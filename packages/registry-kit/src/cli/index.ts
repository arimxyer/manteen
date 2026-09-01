#!/usr/bin/env node
import { packageVersion } from "../registry-output";
import { BUILD_USAGE, build } from "./build";
import { DEV_USAGE, dev } from "./dev";
import { kitEnvelope, writeJson } from "./json";
import { MERGE_USAGE, mergeTheme } from "./merge-theme";
import { SCAFFOLD_USAGE, scaffold } from "./scaffold";

const USAGE = `manteen-kit — tooling for Mantine component registries

Usage:
  manteen-kit <command> [options]

Commands:
  build [catalog] [outDir]              compile a catalog to the wire format
  merge-theme <base> <fragment>         compose a theme fragment into a theme
  scaffold --template <kind> --name <item>
                                        plan or apply source-owned author files
  dev [catalog] [outDir]                  watch, build and serve a local registry

Options:
  -V, --version                           print the installed package version

Run a command with --help for its options.
`;

/**
 * Every branch RETURNS an exit code and the process exits once, at the call
 * site. The previous shape called `process.exit()` inside each case with no
 * `break`, so nothing but "exit never returns" stopped `build` from falling
 * through into `merge-theme` — a hazard that surfaces the day someone captures
 * the code instead of exiting on it.
 */
async function run(command: string | undefined, rest: string[]): Promise<number> {
  const json = command === "--json" || rest.includes("--json");
  switch (command) {
    case "-V":
    case "--version": {
      const version = packageVersion();
      if (json) writeJson(kitEnvelope("version", 0, false, { version }));
      else process.stdout.write(`${version}\n`);
      return 0;
    }
    case "build":
      return build(rest);
    case "merge-theme":
      return mergeTheme(rest);
    case "scaffold":
      return scaffold(rest);
    case "dev":
      return dev(rest);
    case "-h":
    case "--help":
    case undefined:
      if (json) writeJson(kitEnvelope("help", 0, false, { usage: USAGE }));
      else process.stdout.write(USAGE);
      return command === undefined ? 2 : 0;
    default:
      if (json) {
        writeJson(
          kitEnvelope("unknown", 2, false, null, [
            {
              code: "unknown-command",
              message: `Unknown command: ${command}`,
              details: { usage: USAGE },
            },
          ]),
        );
      } else {
        process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
        process.stderr.write(`\n${BUILD_USAGE}\n${MERGE_USAGE}\n${SCAFFOLD_USAGE}\n${DEV_USAGE}`);
      }
      return 2;
  }
}

const [command, ...rest] = process.argv.slice(2);
process.exitCode = await run(command, rest);
