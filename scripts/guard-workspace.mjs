#!/usr/bin/env node
/**
 * Fail fast, and legibly, when `node_modules` is structurally broken.
 *
 * This exists because of a specific incident on 2026-07-29. A staging script
 * meant to build a mirror `node_modules` in a scratch directory wrote into
 * THIS repo's `node_modules` instead, replacing eight scoped entries with
 * symlinks pointing at themselves:
 *
 *     node_modules/@types/bun -> /abs/path/to/node_modules/@types/bun
 *
 * A self-referential link resolves to nothing, so the Node and Bun ambient
 * types disappeared and `tsc` reported 168 errors across 20 files — including
 * files nobody had touched. Several agents spent half an hour reading that as
 * a code defect. It was one broken install, and one `bun install` fixed it.
 *
 * So the value here is the MESSAGE, not the detection. The failure was never
 * subtle; it was mis-attributed. Running this before `tsc` means the wall of
 * "Cannot find module 'node:path'" never renders in the first place — the
 * reader gets one line naming the real problem and the command that fixes it.
 *
 * Deliberately NOT a completeness check. It does not verify that every declared
 * dependency is present, or that versions match the lockfile — `bun install
 * --frozen-lockfile` already owns that, and duplicating it here would make this
 * guard slow enough that nobody would want it in front of `typecheck`. It
 * answers exactly one question: are the links that exist actually resolvable?
 */
import { existsSync, lstatSync, readdirSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * Every place bun's isolated linker puts links. The workspace leaves matter as
 * much as the root: `packages/cli/node_modules` is where `commander` and `nypm`
 * resolve from, and it broke independently of the root during the incident's
 * cleanup.
 */
function linkRoots() {
  const roots = [join(REPO_ROOT, "node_modules")];
  const packages = join(REPO_ROOT, "packages");
  if (!existsSync(packages)) return roots;
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = join(packages, entry.name, "node_modules");
    if (existsSync(nested)) roots.push(nested);
  }
  return roots;
}

/**
 * Entries directly under a `node_modules`, with scopes expanded one level.
 * `.bun`, `.bin` and `.old_modules-*` are skipped: the store and the bin
 * shims have their own internal layout, and walking into them would turn a
 * millisecond check into a full-tree stat.
 */
function packageEntries(nodeModules) {
  const found = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      // A scope is a real directory holding the links. It is also exactly where
      // the incident landed, because a scope adds a path level and that is what
      // the buggy staging script got wrong.
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        found.push(path);
        continue;
      }
      for (const scoped of readdirSync(path, { withFileTypes: true })) {
        found.push(join(path, scoped.name));
      }
      continue;
    }
    found.push(path);
  }
  return found;
}

/** `null` when the entry is fine; otherwise why it is not. */
function inspect(path) {
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats) return "vanished while being checked";
  if (!stats.isSymbolicLink()) return null; // a real directory is a valid install

  const target = readlinkSync(path);
  const resolved = isAbsolute(target) ? target : resolve(join(path, ".."), target);

  // The incident's exact shape. Checked before existence because a self-loop
  // also fails the existence test, and "points at itself" is the diagnosis
  // worth printing — "target missing" would send a reader hunting the target.
  if (resolved === path) return "points at itself";
  if (!existsSync(resolved)) return `target does not exist: ${target}`;
  return null;
}

const broken = [];
for (const nodeModules of linkRoots()) {
  for (const entry of packageEntries(nodeModules)) {
    const reason = inspect(entry);
    if (reason) broken.push({ path: relative(REPO_ROOT, entry), reason });
  }
}

if (broken.length === 0) {
  const roots = linkRoots().length;
  console.log(`guard-workspace: clean — ${roots} node_modules root(s), all links resolve.`);
  process.exit(0);
}

console.error(
  `guard-workspace: node_modules is broken — ${broken.length} unresolvable entr${
    broken.length === 1 ? "y" : "ies"
  }.\n`,
);
for (const { path, reason } of broken.slice(0, 20)) {
  console.error(`  ${path}  (${reason})`);
}
if (broken.length > 20) console.error(`  … and ${broken.length - 20} more`);
console.error(
  [
    "",
    "This is an install problem, not a code problem. Any type errors you are",
    "seeing right now about `node:*` modules, `process` or `Buffer` are noise",
    "from this — do not chase them.",
    "",
    "Fix it with:",
    "",
    "  bun install --frozen-lockfile",
    "",
    "Frozen is deliberate: it relinks without re-resolving, so the lockfile",
    "cannot drift as a side effect of a repair.",
  ].join("\n"),
);
process.exit(1);
