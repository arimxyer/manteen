#!/usr/bin/env node
/**
 * Fail when a dependency this repo DECLARES is not actually installed.
 *
 * `guard-workspace.mjs` answers "do the links that exist resolve?" and says in
 * its own header that it is deliberately not a completeness check, because it
 * runs in front of `tsc` and has to stay in the milliseconds. That reasoning
 * still holds, which is why this is a separate file that runs only in `bun run
 * guard` — not in `typecheck`.
 *
 * What that header also said was that `bun install --frozen-lockfile` already
 * owns completeness. An incident on 2026-08-05 showed the gap in that: it owns
 * completeness only when somebody runs it, and the failure mode is precisely
 * not knowing that you need to.
 *
 * The shape of it, which will recur:
 *
 *   1. A branch developed in a git worktree adds a dependency. `package.json`
 *      and `bun.lock` are tracked, so the DECLARATION is committed. The install
 *      lands in that worktree's own `node_modules`, which is gitignored.
 *   2. The branch is merged home and the worktree is deleted. The declaration
 *      arrives; the installation is thrown away.
 *   3. The receiving checkout now declares a package it does not have.
 *
 * A JS import fails loudly at that point — `tsc` says "Cannot find module". A
 * CSS `@import` does not: nothing in `test`, `typecheck`, `lint` or `guard`
 * resolved those specifiers, so `@fontsource-variable/figtree` cleared every
 * check and surfaced only as an opaque 500 from the dev server, with the real
 * error reachable only through `astro dev logs`. Half an hour went into reading
 * that as a code defect.
 *
 * CI cannot cover this. Every job begins with `bun install --frozen-lockfile`
 * on a clean runner, so CI always holds a correctly linked tree and can never
 * observe the state being guarded against. Green CI is not evidence that a
 * local checkout is installed.
 *
 * Scope, deliberately narrow:
 *
 *   - `dependencies` and `devDependencies` of every workspace manifest.
 *   - Presence only. Versions belong to `bun install --frozen-lockfile`; doing
 *     them here is the slow completeness check the other guard was right to
 *     refuse.
 *   - `peerDependencies` are skipped — the consumer supplies those.
 *   - `optionalDependencies` are skipped — absent is a legal state for them.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CHECKED_FIELDS = ["dependencies", "devDependencies"];

/** The root manifest plus every workspace leaf, matching `workspaces` in package.json. */
function manifests() {
  const found = [join(REPO_ROOT, "package.json")];
  for (const group of ["apps", "packages"]) {
    const dir = join(REPO_ROOT, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(dir, entry.name, "package.json");
      if (existsSync(manifest)) found.push(manifest);
    }
  }
  return found;
}

/**
 * Node's upward walk, stopped at the repo root. Bun's isolated linker puts a
 * package's own dependencies in its own `node_modules`, but hoists plenty to
 * the root, so both have to be searched — checking only the adjacent directory
 * would report most of the tree as missing.
 *
 * `existsSync` follows symlinks, so a dangling link counts as missing here. It
 * is also reported by `guard-workspace`, which is the guard that explains that
 * particular shape properly.
 */
function isInstalled(fromDir, name) {
  let dir = fromDir;
  for (;;) {
    if (existsSync(join(dir, "node_modules", name))) return true;
    if (dir === REPO_ROOT) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

const missing = [];
let checked = 0;
const files = manifests();

for (const manifest of files) {
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const dir = dirname(manifest);
  for (const field of CHECKED_FIELDS) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      checked++;
      if (isInstalled(dir, name)) continue;
      missing.push({ manifest: relative(REPO_ROOT, manifest), field, name, range });
    }
  }
}

if (missing.length === 0) {
  console.log(
    `guard-deps: clean — ${checked} declared dependencies across ${files.length} manifest(s), all installed.`,
  );
  process.exit(0);
}

console.error(
  `guard-deps: ${missing.length} declared dependenc${
    missing.length === 1 ? "y is" : "ies are"
  } not installed.\n`,
);
for (const { manifest, field, name, range } of missing.slice(0, 20)) {
  console.error(`  ${name}@${range}  (${manifest} → ${field})`);
}
if (missing.length > 20) console.error(`  … and ${missing.length - 20} more`);
console.error(
  [
    "",
    "Declared in a tracked manifest, absent from node_modules. The usual cause is",
    "a branch that added the dependency inside a git worktree: the declaration is",
    "committed and travels with the merge, the install lives in that worktree's",
    "gitignored node_modules and is deleted with it.",
    "",
    "Fix it with:",
    "",
    "  bun install --frozen-lockfile",
    "",
    "Frozen relinks without re-resolving, so a repair cannot drift the lockfile.",
    "",
    "Do this before trusting the docs site: a missing package reached only from a",
    "CSS @import is invisible to tsc and astro check, and shows up as a bare 500",
    "whose real error is only in `astro dev logs`.",
  ].join("\n"),
);
process.exit(1);
