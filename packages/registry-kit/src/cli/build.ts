import { resolve } from "node:path";

import {
  AuthorConformanceError,
  compileRegistry,
  planRegistryWrite,
  RegistryOutputError,
  writeRegistry,
} from "../build-registry";
import { MantineRangeError } from "../mantine-ranges";
import { kitEnvelope, writeJson } from "./json";

export const BUILD_USAGE = `manteen-kit build [catalog.json] [outDir] [options]

Compiles a Mantine registry catalog to the interchange wire format.
Defaults: ./manteen.registry.json -> <catalog dir>/public/r

Options:
  --check               compare complete prospective output without writing
  --overwrite-output    replace drifted marker-owned generated files
  --json                emit one versioned machine-readable document
`;

interface BuildArgs {
  catalog: string;
  outDir: string;
  check: boolean;
  overwriteOutput: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): BuildArgs | null {
  const positional: string[] = [];
  let check = false;
  let overwriteOutput = false;
  let json = false;
  let help = false;
  for (const arg of argv) {
    if (arg === "--check") check = true;
    else if (arg === "--overwrite-output") overwriteOutput = true;
    else if (arg === "--json") json = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg.startsWith("-")) return null;
    else positional.push(arg);
  }
  if (positional.length > 2) return null;
  const catalog = resolve(positional[0] ?? "manteen.registry.json");
  return {
    catalog,
    outDir: resolve(positional[1] ?? resolve(catalog, "../public/r")),
    check,
    overwriteOutput,
    json,
    help,
  };
}

export function build(argv: string[]): number {
  const wantsJson = argv.includes("--json");
  const args = parseArgs(argv);
  if (!args) {
    if (wantsJson) {
      writeJson(
        kitEnvelope("build", 2, false, null, [
          {
            code: "invalid-arguments",
            message: "Invalid build arguments.",
            details: { usage: BUILD_USAGE },
          },
        ]),
      );
    } else {
      process.stderr.write(BUILD_USAGE);
    }
    return 2;
  }
  if (args.help) {
    if (args.json) writeJson(kitEnvelope("build", 0, false, { usage: BUILD_USAGE }));
    else process.stdout.write(BUILD_USAGE);
    return 0;
  }

  let result: ReturnType<typeof compileRegistry>;
  try {
    result = compileRegistry(args.catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      writeJson(
        kitEnvelope("build", 1, false, null, [
          error instanceof AuthorConformanceError
            ? {
                code: "author-conformance-failed",
                message,
                details: error.failures,
              }
            : error instanceof MantineRangeError
              ? {
                  code: "mantine-range-validation-failed",
                  message,
                  details: error.failures,
                }
              : { code: "compile-failed", message },
        ]),
      );
    } else process.stderr.write(`${message}\n`);
    return 1;
  }

  for (const failure of result.failures) {
    if (!args.json) {
      process.stderr.write(`✗ ${failure.item} does not conform to the wire schema:\n`);
      for (const message of failure.messages) process.stderr.write(`    ${message}\n`);
    }
  }

  if (result.failures.length > 0) {
    if (args.json) {
      writeJson(
        kitEnvelope("build", 1, false, null, [
          {
            code: "wire-schema-failures",
            message: `${result.failures.length} item(s) failed wire-schema validation.`,
            details: result.failures,
          },
        ]),
      );
    } else {
      process.stderr.write(`\n${result.failures.length} item(s) failed wire-schema validation.\n`);
    }
    return 1;
  }

  if (args.check) {
    const plan = planRegistryWrite(result, args.outDir, {
      overwriteOutput: args.overwriteOutput,
    });
    const exitCode = plan.status === "clean" ? 0 : plan.status === "refused" ? 2 : 1;
    if (args.json) {
      writeJson(
        kitEnvelope(
          "build",
          exitCode,
          false,
          plan,
          plan.diagnostics.map((diagnostic) => ({ ...diagnostic })),
        ),
      );
    } else if (plan.status === "clean") {
      process.stdout.write(`Registry output is clean: ${plan.outDir}\n`);
    } else if (plan.status === "refused") {
      for (const diagnostic of plan.diagnostics) process.stderr.write(`${diagnostic.message}\n`);
    } else {
      process.stderr.write(`Registry output is ${plan.status}: ${plan.changedFiles.join(", ")}\n`);
    }
    return exitCode;
  }

  let outcome: ReturnType<typeof writeRegistry>;
  try {
    outcome = writeRegistry(result, args.outDir, {
      overwriteOutput: args.overwriteOutput,
    });
  } catch (error) {
    const diagnostics =
      error instanceof RegistryOutputError
        ? error.diagnostics
        : [
            {
              code: "write-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          ];
    if (args.json) {
      writeJson(
        kitEnvelope(
          "build",
          2,
          false,
          null,
          diagnostics.map((diagnostic) => ({ ...diagnostic })),
        ),
      );
    } else {
      for (const diagnostic of diagnostics) process.stderr.write(`${diagnostic.message}\n`);
    }
    return 2;
  }

  if (args.json) {
    writeJson(kitEnvelope("build", 0, outcome.mutated, outcome));
    return 0;
  }

  for (const item of result.items) {
    process.stdout.write(
      `  ${item.name as string} → ${item.name as string}.json (${item.type as string})\n`,
    );
  }
  process.stdout.write(`  index → registry.json (${result.items.length} items)\n`);
  process.stdout.write(`  ownership → .manteen-kit-output.json\n`);
  process.stdout.write(
    `\nBuilt ${result.items.length} items from ${result.source.namespace}. Wire-schema conformance verified.\n`,
  );

  return 0;
}
