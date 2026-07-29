#!/usr/bin/env node
/**
 * Fail the build on Bun-only APIs in shipped code — and on raw control
 * characters anywhere in it (see `checkText`, a second concern sharing this
 * walk).
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
 *
 * Rules are per-scope rather than uniform, because the repo runs two tiers and
 * only one of them ships. The `bun test` tier imports `bun:test` by design, so
 * banning that specifier everywhere would be a rule the codebase must violate.
 * `import.meta.dir` is banned in BOTH tiers: it is Bun-only either way, and a
 * test using the portable spelling costs nothing while keeping the habit
 * uniform — the original bug was written in a test file and copied into src.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
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

const ALL = RULES.map((rule) => rule.id);
const PORTABLE_ONLY = ["import.meta.dir"];

/**
 * Everything that either ships to a user or runs under `node`, versus the
 * `bun test` tier which only has to stay portable in its path handling.
 */
const SCOPES = [
  {
    label: "shipped",
    roots: ["packages/cli/src", "packages/cli/e2e", "packages/registry-kit/src"],
    rules: ALL,
  },
  {
    label: "bun tests",
    roots: ["packages/cli/test", "packages/registry-kit/test", "test"],
    rules: PORTABLE_ONLY,
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
    { rule: "import.meta.dir", text: 'resolve(import.meta.dirname, "..")', hit: false },
    { rule: "import.meta.dir", text: "import.meta.dirname", hit: false },
    // …and the Bun form is, however it terminates.
    { rule: "import.meta.dir", text: "const d = import.meta.dir;", hit: true },
    { rule: "import.meta.dir", text: 'resolve(import.meta.dir, "..")', hit: true },
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

/**
 * Lines that BEGIN as comments are prose and are skipped — documenting why
 * `import.meta.dir` is banned should not trip the ban, and a guard that flags
 * its own rationale is one people mute.
 *
 * Deliberately only the leading form. Stripping from a mid-line `//` would
 * blind the guard after any string containing `://`, and a false negative in a
 * guard is far worse than the occasional flagged trailing comment.
 */
function isProse(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/**
 * A different concern from the rules above, riding the same walk rather than
 * paying for a fourth guard script over one check.
 *
 * A RAW NUL byte in a source file makes it `data` rather than text, and **grep
 * then silently skips the whole file** — no match, no warning, no hint that it
 * was never searched. Two files here had one: both used NUL legitimately, as a
 * composite-key field separator, but written as a literal byte instead of the
 * `\u0000` escape. The strings are identical at runtime; the difference is
 * entirely in whether the file can be read by the tools people review with.
 *
 * It is deliberately NOT a rule in `RULES`: those are line-based and skip
 * prose, and a control character buried in a comment is exactly as invisible to
 * grep as one in code. This runs over whole file text, comments included.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the entire purpose of this check; the rule is correct everywhere else and stays on.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function checkText(file, text) {
  const found = [];
  for (const match of text.matchAll(CONTROL_CHARACTERS)) {
    const line = text.slice(0, match.index).split("\n").length;
    const code = match[0].charCodeAt(0).toString(16).padStart(4, "0");
    found.push({
      file: relative(REPO_ROOT, file),
      line,
      column: match.index - text.lastIndexOf("\n", match.index - 1),
      text: `U+${code.toUpperCase()}`,
      hint: `a raw control character makes this file binary to grep, which then skips it silently — write the escape (\\u${code}) instead`,
    });
  }
  return found;
}

function scan() {
  const hits = [];

  for (const scope of SCOPES) {
    const rules = RULES.filter((rule) => scope.rules.includes(rule.id));
    for (const root of scope.roots) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        hits.push(...checkText(file, source));
        const lines = source.split("\n");
        lines.forEach((line, index) => {
          if (isProse(line)) return;
          for (const rule of rules) {
            rule.pattern.lastIndex = 0;
            for (const match of line.matchAll(rule.pattern)) {
              hits.push({
                file: relative(REPO_ROOT, file),
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
  }

  return hits;
}

selfTest();

const hits = scan();

if (hits.length > 0) {
  // Not "Bun-only API use(s)" any more: `checkText` contributes to the same
  // list, and a control-character hit reported under that heading sends the
  // reader looking for a `Bun.` that is not there.
  console.error(`guard-runtime-apis: ${hits.length} problem(s) in scanned source.\n`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}:${hit.column}  ${hit.text}`);
    console.error(`    ${hit.hint}\n`);
  }
  process.exit(1);
}

const summary = SCOPES.map(
  (scope) => `${scope.label}: ${scope.roots.length} root(s), ${scope.rules.length} rule(s)`,
).join(" | ");
console.log(`guard-runtime-apis: clean — ${summary}.`);
