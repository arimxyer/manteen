#!/usr/bin/env node
/**
 * Fail the build on Bun-only APIs in shipped code.
 *
 * This package is published as Node ESM and its e2e tier runs under real `node`,
 * but every developer here runs `bun test` — so a Bun-only API passes the whole
 * local suite and fails only for a user. That is not hypothetical: it shipped
 * once already, as `import.meta.dir` (which is `undefined` under Node, so schema
 * resolution silently produced `resolve(undefined, "..")` rather than throwing
 * at the call site).
 *
 * `scripts/` is deliberately NOT scanned. This file's own regexes and self-test
 * fixtures contain every pattern it looks for, so scanning itself would make the
 * guard permanently red. Anything that scanning `scripts/` would have caught is
 * build tooling that never reaches a user's machine.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const ROOTS = ["src", "e2e"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js"]);

const RULES = [
  {
    /**
     * The lookahead is the whole point: `import.meta.dirname` is the portable
     * replacement and must NOT be flagged, while `import.meta.dir` in every
     * terminating context must be. `\B` would not work here — `.` is a
     * non-word character, so there is no word boundary to assert against.
     */
    id: "import.meta.dir",
    pattern: /import\.meta\.dir(?!name)/g,
    hint: "use `import.meta.dirname` (Node 20.11+); `import.meta.dir` is Bun-only and is `undefined` under Node",
  },
  {
    id: "Bun global",
    pattern: /\bBun\./g,
    hint: "no `Bun.$`, `Bun.file`, `Bun.semver`, … — use node:child_process, node:fs and the `semver` package",
  },
  {
    id: "bun: specifier",
    pattern: /from ["']bun:/g,
    hint: "no `bun:test` / `bun:sqlite` imports in shipped code; the e2e tier uses node:test",
  },
];

/**
 * Proves the matchers before trusting them, on strings rather than temp files —
 * a fixture on disk would have to live under a scanned root to be read, and then
 * the guard would flag its own fixture.
 */
function selfTest() {
  const cases = [
    // The lookahead: the portable form is never a hit, in any context.
    { rule: "import.meta.dir", text: "const d = import.meta.dirname;", hit: false },
    { rule: "import.meta.dir", text: "resolve(import.meta.dirname, \"..\")", hit: false },
    { rule: "import.meta.dir", text: "import.meta.dirname", hit: false },
    // …and the Bun form is, however it terminates.
    { rule: "import.meta.dir", text: "const d = import.meta.dir;", hit: true },
    { rule: "import.meta.dir", text: "resolve(import.meta.dir, \"..\")", hit: true },
    { rule: "import.meta.dir", text: "const d = import.meta.dir", hit: true },
    { rule: "import.meta.dir", text: "${import.meta.dir}/schema", hit: true },
    { rule: "import.meta.dir", text: "import.meta.dir\n", hit: true },
    { rule: "import.meta.dir", text: "import.meta.directory", hit: true },

    { rule: "Bun global", text: "await Bun.$`ls`", hit: true },
    { rule: "Bun global", text: "Bun.semver.satisfies(a, b)", hit: true },
    // A word character before `Bun` is not a boundary, so these stay clean.
    { rule: "Bun global", text: "myBun.file(x)", hit: false },
    { rule: "Bun global", text: "const bun = 1; bun.x", hit: false },
    { rule: "Bun global", text: "Bunny.hop()", hit: false },

    { rule: "bun: specifier", text: 'import { test } from "bun:test";', hit: true },
    { rule: "bun: specifier", text: "import { Database } from 'bun:sqlite';", hit: true },
    { rule: "bun: specifier", text: 'import { readFileSync } from "node:fs";', hit: false },
  ];

  const failures = [];
  for (const { rule, text, hit } of cases) {
    const { pattern } = RULES.find((candidate) => candidate.id === rule);
    pattern.lastIndex = 0;
    const matched = pattern.test(text);
    pattern.lastIndex = 0;
    if (matched !== hit) {
      failures.push(`  ${rule}: expected ${hit ? "a hit" : "no hit"} on ${JSON.stringify(text)}`);
    }
  }

  if (failures.length > 0) {
    console.error("guard-runtime-apis: the matchers are broken, so the scan proves nothing.");
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // A root that does not exist yet is not a failure; phases add them.
  }

  for (const entry of entries.sort()) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      yield full;
    }
  }
}

function scan() {
  const hits = [];

  for (const root of ROOTS) {
    for (const file of walk(join(PKG_ROOT, root))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const rule of RULES) {
          rule.pattern.lastIndex = 0;
          for (const match of line.matchAll(rule.pattern)) {
            hits.push({
              file: relative(PKG_ROOT, file),
              line: index + 1,
              column: match.index + 1,
              text: match[0],
              hint: rule.hint,
            });
          }
        }
      });
    }
  }

  return hits;
}

selfTest();

const hits = scan();

if (hits.length > 0) {
  console.error(`guard-runtime-apis: ${hits.length} Bun-only API use(s) in shipped code.\n`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}:${hit.column}  ${hit.text}`);
    console.error(`    ${hit.hint}\n`);
  }
  process.exit(1);
}

console.log(`guard-runtime-apis: clean (${ROOTS.join(", ")}).`);
