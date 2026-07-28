#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { mergeThemeSource } from "./merge-theme";

const USAGE = `merge-mantine-theme — compose a Mantine theme fragment into an existing theme.

Usage:
  merge-mantine-theme <base.ts> <fragment.ts> [options]

Options:
  --write             apply the merge (default: dry run, prints the result)
  --prefer <side>     'base' (default) keeps local edits, 'incoming' applies the fragment
  --json              machine-readable report
  -h, --help

Exit codes:
  0  merged cleanly (or nothing to do)
  1  merged, but conflicts were reported
  2  usage or parse error
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

const args = parseArgs(process.argv.slice(2));
if (!args) {
  process.stdout.write(USAGE);
  process.exit(2);
}

if (!existsSync(args.incoming)) {
  process.stderr.write(`Fragment not found: ${args.incoming}\n`);
  process.exit(2);
}

const incomingText = readFileSync(args.incoming, "utf8");

// No base theme yet: the fragment is a valid standalone theme, so install it as-is.
if (!existsSync(args.base)) {
  if (args.write) writeFileSync(args.base, incomingText);
  const report = { created: true, added: [], conflicts: [], importsAdded: [] };
  process.stdout.write(
    args.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${args.write ? "Created" : "Would create"} ${args.base} from ${args.incoming}.\n`,
  );
  process.exit(0);
}

let result;
try {
  result = mergeThemeSource(readFileSync(args.base, "utf8"), incomingText, {
    prefer: args.prefer,
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        changed: result.changed,
        added: result.added,
        importsAdded: result.importsAdded,
        conflicts: result.conflicts,
      },
      null,
      2,
    )}\n`,
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
    process.stdout.write(
      `  ! ${conflict.path}\n      kept:     ${args.prefer === "base" ? conflict.base : conflict.incoming}\n` +
        `      ignored:  ${args.prefer === "base" ? conflict.incoming : conflict.base}\n` +
        `      ${conflict.reason}\n`,
    );
  }

  if (args.write) {
    if (result.changed) {
      writeFileSync(args.base, result.text);
      process.stdout.write(`\nWrote ${args.base}\n`);
    }
  } else if (result.changed) {
    process.stdout.write(`\n--- ${args.base} (dry run) ---\n${result.text}`);
  }
}

process.exit(result.conflicts.length > 0 ? 1 : 0);
