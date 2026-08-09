import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { mergeThemeSource } from "../merge-theme";
import { kitEnvelope, writeJson } from "./json";

export const MERGE_USAGE = `manteen-kit merge-theme <base.ts> <fragment.ts> [options]

Composes a Mantine theme fragment into an existing theme instead of overwriting it.

Options:
  --write             apply the merge (default: dry run, prints the result)
  --prefer <side>     'base' (default) keeps local edits, 'incoming' applies the fragment
  --json              machine-readable report

Exit codes: 0 clean, 1 merged with conflicts, 2 usage or parse error.
`;

interface Args {
  base: string;
  incoming: string;
  write: boolean;
  prefer: "base" | "incoming";
  json: boolean;
}

function parseArgs(argv: string[]): Args | null {
  const positional: string[] = [];
  let write = false;
  let json = false;
  let prefer: "base" | "incoming" = "base";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--write") write = true;
    else if (arg === "--json") json = true;
    else if (arg === "--prefer") {
      const value = argv[++i];
      if (value !== "base" && value !== "incoming") return null;
      prefer = value;
    } else if (arg === "-h" || arg === "--help") return null;
    else if (arg.startsWith("-")) return null;
    else positional.push(arg);
  }

  if (positional.length !== 2) return null;
  return { base: positional[0]!, incoming: positional[1]!, write, prefer, json };
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.manteen-kit-tmp`;
  writeFileSync(temporary, content, { flag: "wx" });
  // A failed rename leaves the temporary file as recovery evidence rather than
  // deleting bytes we cannot prove were never observed.
  renameSync(temporary, path);
}

export function mergeTheme(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args) {
    if (argv.includes("--json")) {
      writeJson(
        kitEnvelope("merge-theme", 2, false, null, [
          {
            code: "invalid-arguments",
            message: "Invalid merge-theme arguments.",
            details: { usage: MERGE_USAGE },
          },
        ]),
      );
    } else process.stdout.write(MERGE_USAGE);
    return 2;
  }

  if (!existsSync(args.incoming)) {
    const message = `Fragment not found: ${args.incoming}`;
    if (args.json) {
      writeJson(
        kitEnvelope("merge-theme", 2, false, null, [{ code: "fragment-not-found", message }]),
      );
    } else process.stderr.write(`${message}\n`);
    return 2;
  }

  const incomingText = readFileSync(args.incoming, "utf8");

  // No base theme yet: a fragment is a valid standalone theme, so install it as-is.
  if (!existsSync(args.base)) {
    try {
      if (args.write) writeAtomic(args.base, incomingText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.json)
        writeJson(kitEnvelope("merge-theme", 2, false, null, [{ code: "write-failed", message }]));
      else process.stderr.write(`${message}\n`);
      return 2;
    }
    const payload = { created: true, changed: true, added: [], conflicts: [], importsAdded: [] };
    if (args.json) writeJson(kitEnvelope("merge-theme", 0, args.write, payload));
    else
      process.stdout.write(
        `${args.write ? "Created" : "Would create"} ${args.base} from ${args.incoming}.\n`,
      );
    return 0;
  }

  let result: ReturnType<typeof mergeThemeSource>;
  try {
    result = mergeThemeSource(readFileSync(args.base, "utf8"), incomingText, {
      prefer: args.prefer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json)
      writeJson(kitEnvelope("merge-theme", 2, false, null, [{ code: "merge-failed", message }]));
    else process.stderr.write(`${message}\n`);
    return 2;
  }

  if (args.write && result.changed) {
    try {
      writeAtomic(args.base, result.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.json)
        writeJson(kitEnvelope("merge-theme", 2, false, null, [{ code: "write-failed", message }]));
      else process.stderr.write(`${message}\n`);
      return 2;
    }
  }

  if (args.json) {
    const exitCode = result.conflicts.length > 0 ? 1 : 0;
    writeJson(
      kitEnvelope("merge-theme", exitCode, args.write && result.changed, {
        changed: result.changed,
        added: result.added,
        importsAdded: result.importsAdded,
        conflicts: result.conflicts,
      }),
    );
  } else {
    if (!result.changed) {
      process.stdout.write(`Nothing to merge — ${args.base} already has everything.\n`);
    } else {
      for (const path of result.added) process.stdout.write(`  + ${path}\n`);
      for (const name of result.importsAdded) {
        process.stdout.write(`  + import { ${name} } from "@mantine/core"\n`);
      }
    }

    for (const conflict of result.conflicts) {
      const kept = args.prefer === "base" ? conflict.base : conflict.incoming;
      const ignored = args.prefer === "base" ? conflict.incoming : conflict.base;
      process.stdout.write(
        `  ! ${conflict.path}\n      kept:     ${kept}\n      ignored:  ${ignored}\n      ${conflict.reason}\n`,
      );
    }

    if (args.write) {
      if (result.changed) {
        process.stdout.write(`\nWrote ${args.base}\n`);
      }
    } else if (result.changed) {
      process.stdout.write(`\n--- ${args.base} (dry run) ---\n${result.text}`);
    }
  }

  return result.conflicts.length > 0 ? 1 : 0;
}
