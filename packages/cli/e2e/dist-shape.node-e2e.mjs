/**
 * Phase 0's done-when list, as executable assertions under real `node`.
 *
 * Everything here is about the SHAPE of what gets published rather than about
 * behaviour, and every one of these failures is invisible to `tsc` and to
 * `bun test`:
 *
 *   - a nested `dist/cli/` entry silently repoints every `../schema/...`
 *     resolution and throws ENOENT only once a user runs the binary;
 *   - `manteen-kit` inlined by the bundler repoints ITS schema resolution at
 *     packages/cli, and `createWireValidator()` throws — again, only at runtime.
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { createWireValidator } from "manteen-kit";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const DIST = join(PKG_ROOT, "dist");
const CLI = join(DIST, "cli.mjs");

assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node, not bun — use `node --test packages/cli/e2e/*.mjs`",
);
assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

test("dist is flat — every entry sits one level below the package root", () => {
  const nested = readdirSync(DIST).filter((entry) => statSync(join(DIST, entry)).isDirectory());
  assert.deepEqual(
    nested,
    [],
    'a subdirectory under dist/ breaks `resolve(<module dir>, "../schema/...")` for every entry inside it',
  );
});

test("every schema the bundle resolves against dist/.. exists", () => {
  for (const name of [
    "manteen.schema.json",
    "manteen-item-meta.schema.json",
    "manteen.lock.schema.json",
  ]) {
    assert.ok(
      existsSync(resolve(DIST, "..", "schema", name)),
      `schema/${name} is missing; a module that loads it throws ENOENT at runtime only`,
    );
  }
});

test("the built binary runs under node and prints its version", () => {
  const result = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const { version } = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8"));
  assert.equal(result.stdout.trim(), version);
});

test("manteen-kit stayed external and its wire validator still works", async () => {
  // Half the proof: the built programmatic surface loads under real node.
  const manteen = await import(pathToFileURL(join(DIST, "index.mjs")).href);
  assert.equal(typeof manteen.plan, "function");
  assert.equal(typeof manteen.apply, "function");
  assert.equal(typeof manteen.loadConfig, "function");

  // The other half: a real `import … from "manteen-kit"` statement survives in
  // the bundle. Inlining the kit would repoint its `resolve(<module dir>, "..")`
  // at packages/cli and make the validator below throw ENOENT.
  const bundles = readdirSync(DIST)
    .filter((entry) => entry.endsWith(".mjs"))
    .map((entry) => readFileSync(join(DIST, entry), "utf8"));
  assert.ok(
    bundles.some((source) => /from\s*["']manteen-kit["']/.test(source)),
    "no bundle imports manteen-kit by package name — tsdown inlined it",
  );

  const validate = createWireValidator();
  const doc = JSON.parse(readFileSync(join(REPO_ROOT, "public", "r", "empty-state.json"), "utf8"));
  assert.equal(validate(doc), null, "public/r/empty-state.json must validate with zero messages");
});
