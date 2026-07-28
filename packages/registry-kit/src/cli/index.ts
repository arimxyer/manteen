#!/usr/bin/env bun
import { BUILD_USAGE, build } from "./build";
import { MERGE_USAGE, mergeTheme } from "./merge-theme";

const USAGE = `mantine-registry — tooling for Mantine component registries

Usage:
  mantine-registry <command> [options]

Commands:
  build [catalog] [outDir]              compile a catalog to the wire format
  merge-theme <base> <fragment>         compose a theme fragment into a theme

Run a command with --help for its options.
`;

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "build":
    process.exit(build(rest));
  case "merge-theme":
    process.exit(mergeTheme(rest));
  case "-h":
  case "--help":
  case undefined:
    process.stdout.write(USAGE);
    process.exit(command === undefined ? 2 : 0);
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.stderr.write(`\n${BUILD_USAGE}\n${MERGE_USAGE}`);
    process.exit(2);
}
