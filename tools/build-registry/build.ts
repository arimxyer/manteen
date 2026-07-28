#!/usr/bin/env bun
/**
 * CLI wrapper around the compiler.
 *
 * Usage: build.ts [catalog.json] [outDir]
 */
import { join, resolve } from "node:path";

import { compileRegistry, writeRegistry } from "./build-registry";

const TOOL_ROOT = resolve(import.meta.dir, "../..");

const catalog = resolve(process.argv[2] ?? join(TOOL_ROOT, "mantine-registry.json"));
const outDir = resolve(process.argv[3] ?? join(resolve(catalog, ".."), "public/r"));

let result;
try {
  result = compileRegistry(catalog);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

for (const failure of result.failures) {
  process.stderr.write(`✗ ${failure.item} does not conform to the wire schema:\n`);
  for (const message of failure.messages) process.stderr.write(`    ${message}\n`);
}

if (result.failures.length > 0) {
  process.stderr.write(`\n${result.failures.length} item(s) failed wire-schema validation.\n`);
  process.exit(1);
}

writeRegistry(result, outDir);

for (const item of result.items) {
  process.stdout.write(`  ${item.name as string} → r/${item.name as string}.json (${item.type as string})\n`);
}
process.stdout.write(`  index → r/registry.json (${result.items.length} items)\n`);
process.stdout.write(`\nBuilt ${result.items.length} items. Wire-schema conformance verified.\n`);
