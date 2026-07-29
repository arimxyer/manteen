#!/usr/bin/env node
/**
 * Every DiagnosticCode must either be constructed somewhere or be listed below
 * as deliberately pending.
 *
 * The refusal table is a specification, and a specified refusal with no emitter
 * is indistinguishable from a forgotten one by reading the types. This makes
 * the difference explicit and checkable.
 *
 * PENDING is required to shrink: a code that gains an emitter while still
 * listed here fails just as loudly as one that goes missing, so finishing a
 * phase forces the list to be updated rather than left to drift.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(import.meta.dirname, "../src");
const TYPES = join(SRC, "plan/types.ts");

/** Declared, not yet emitted, with the phase that will land it. */
const PENDING = new Map([
  ["mantine-version-mismatch", "phase 3 — version gate"],
  ["mantine-version-unknown", "phase 3 — version gate"],
  ["provider-missing", "phase 3 — provider check"],
  ["styles-api", "phase 3 — stylesApi reporting"],
  ["theme-base-unmergeable", "phase 3 — theme fold"],
  ["theme-conflict", "phase 3 — theme fold"],
]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const types = readFileSync(TYPES, "utf8");
const start = types.indexOf("export type DiagnosticCode");
if (start === -1) {
  console.error("guard-diagnostics: no DiagnosticCode union in plan/types.ts");
  process.exit(1);
}
// The union carries JSDoc between members, so stop at the first semicolon that
// ends a line rather than the first semicolon of any kind.
const end = start + types.slice(start).search(/;\s*$/m);
const declared = [...types.slice(start, end).matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);

const sources = walk(SRC).filter((path) => path !== TYPES);
const corpus = sources.map((path) => readFileSync(path, "utf8")).join("\n");
const emitted = (code) =>
  new RegExp(`(diag\\(\\s*"${code}"|code:\\s*"${code}"|"${code}"\\s*,)`).test(corpus);

const failures = [];
for (const code of declared) {
  const has = emitted(code);
  if (!has && !PENDING.has(code)) {
    failures.push(`  ${code}: declared with no emitter, and not listed as pending`);
  }
  if (has && PENDING.has(code)) {
    failures.push(`  ${code}: now emitted — remove it from PENDING (${PENDING.get(code)})`);
  }
}
for (const code of PENDING.keys()) {
  if (!declared.includes(code)) failures.push(`  ${code}: in PENDING but no longer declared`);
}

if (failures.length > 0) {
  console.error(`guard-diagnostics: ${failures.length} problem(s)\n${failures.join("\n")}`);
  process.exit(1);
}

const pending = declared.filter((code) => PENDING.has(code)).length;
console.log(
  `guard-diagnostics: ${declared.length} codes, ${declared.length - pending} emitted, ${pending} pending.`,
);
