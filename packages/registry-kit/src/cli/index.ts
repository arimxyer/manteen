#!/usr/bin/env node
import { BUILD_USAGE, build } from "./build";
import { MERGE_USAGE, mergeTheme } from "./merge-theme";

const USAGE = `manteen-kit — tooling for Mantine component registries

Usage:
  manteen-kit <command> [options]

Commands:
  build [catalog] [outDir]              compile a catalog to the wire format
  merge-theme <base> <fragment>         compose a theme fragment into a theme

Run a command with --help for its options.
`;

/**
 * Every branch RETURNS an exit code and the process exits once, at the call
 * site. The previous shape called `process.exit()` inside each case with no
 * `break`, so nothing but "exit never returns" stopped `build` from falling
 * through into `merge-theme` — a hazard that surfaces the day someone captures
 * the code instead of exiting on it.
 */
function run(command: string | undefined, rest: string[]): number {
  switch (command) {
    case "build":
      return build(rest);
    case "merge-theme":
      return mergeTheme(rest);
    case "-h":
    case "--help":
    case undefined:
      process.stdout.write(USAGE);
      return command === undefined ? 2 : 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      process.stderr.write(`\n${BUILD_USAGE}\n${MERGE_USAGE}`);
      return 2;
  }
}

const [command, ...rest] = process.argv.slice(2);
process.exit(run(command, rest));
