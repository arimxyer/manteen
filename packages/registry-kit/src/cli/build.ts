import { resolve } from "node:path";

import { compileRegistry, writeRegistry } from "../build-registry";

export const BUILD_USAGE = `mantine-registry build [catalog.json] [outDir]

Compiles a Mantine registry catalog to the interchange wire format.
Defaults: ./mantine-registry.json -> <catalog dir>/public/r
`;

export function build(argv: string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(BUILD_USAGE);
    return 0;
  }

  const catalog = resolve(argv[0] ?? "mantine-registry.json");
  const outDir = resolve(argv[1] ?? resolve(catalog, "../public/r"));

  let result;
  try {
    result = compileRegistry(catalog);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  for (const failure of result.failures) {
    process.stderr.write(`✗ ${failure.item} does not conform to the wire schema:\n`);
    for (const message of failure.messages) process.stderr.write(`    ${message}\n`);
  }

  if (result.failures.length > 0) {
    process.stderr.write(`\n${result.failures.length} item(s) failed wire-schema validation.\n`);
    return 1;
  }

  writeRegistry(result, outDir);

  for (const item of result.items) {
    process.stdout.write(`  ${item.name as string} → ${item.name as string}.json (${item.type as string})\n`);
  }
  process.stdout.write(`  index → registry.json (${result.items.length} items)\n`);
  process.stdout.write(
    `\nBuilt ${result.items.length} items from ${result.source.namespace}. Wire-schema conformance verified.\n`,
  );

  return 0;
}
