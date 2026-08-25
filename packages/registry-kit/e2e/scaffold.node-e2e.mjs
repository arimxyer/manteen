import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist/cli.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "manteen-scaffold-node-"));
  const catalogPath = join(root, "manteen.registry.json");
  const profilePath = join(root, "manteen.author-profile.json");
  const manifestPath = join(root, "package.json");
  writeFileSync(
    catalogPath,
    `${JSON.stringify(
      {
        name: "Built Node scaffold fixture",
        namespace: "@node-proof",
        authorProfile: "manteen.author-profile.json",
        items: [],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(profilePath, `${JSON.stringify({ schemaVersion: 1, stylesApi: [] }, null, 2)}\n`);
  writeFileSync(manifestPath, '{"name":"node-proof","private":true}\n');
  return { root, catalogPath, profilePath, manifestPath };
}

function run(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function json(result) {
  assert.equal(result.stderr, "");
  const value = JSON.parse(result.stdout);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.command, "scaffold");
  return value;
}

test("built CLI on the exact Node runtime preserves the scaffold plan/apply contract", () => {
  assert.equal(process.versions.node, "20.11.0");
  const created = fixture();
  try {
    const preserved = new Map(
      [created.catalogPath, created.profilePath, created.manifestPath].map((path) => [
        path,
        readFileSync(path),
      ]),
    );
    const common = [
      "scaffold",
      "--template",
      "component-styles-api",
      "--name",
      "built-card",
      "--catalog",
      created.catalogPath,
      "--json",
    ];
    const dryRun = run(created.root, [...common, "--dry-run"]);
    assert.equal(dryRun.status, 0, JSON.stringify(dryRun));
    const plan = json(dryRun).payload;
    assert.match(plan.planDigest, /^[a-f0-9]{64}$/);
    assert.equal(plan.safe, true);
    assert.deepEqual(
      plan.files.map((file) => file.path),
      [...plan.files.map((file) => file.path)].sort(),
    );

    const applied = run(created.root, [...common, "--apply", "--expect-plan", plan.planDigest]);
    assert.equal(applied.status, 0);
    assert.equal(json(applied).mutated, true);

    const secondDryRun = run(created.root, [...common, "--dry-run"]);
    assert.equal(secondDryRun.status, 0);
    const secondPlan = json(secondDryRun).payload;
    assert.ok(secondPlan.files.every((file) => file.operation === "noop"));
    const secondApply = run(created.root, [
      ...common,
      "--apply",
      "--expect-plan",
      secondPlan.planDigest,
    ]);
    assert.equal(secondApply.status, 0);
    assert.equal(json(secondApply).mutated, false);

    for (const [path, bytes] of preserved) assert.deepEqual(readFileSync(path), bytes);

    const ambiguous = run(created.root, [...common, "--dry-run", "--name", "second-name"]);
    assert.equal(ambiguous.status, 2);
    assert.equal(json(ambiguous).errors[0].code, "invalid-arguments");
  } finally {
    rmSync(created.root, { recursive: true, force: true });
  }
});

test("built package exports the public scaffold planner", async () => {
  const kit = await import(join(PACKAGE_ROOT, "dist/index.mjs"));
  assert.equal(typeof kit.planScaffold, "function");
  assert.equal(typeof kit.applyScaffold, "function");
  assert.deepEqual(kit.SCAFFOLD_TEMPLATES, [
    "component-basic",
    "component-styles-api",
    "component-polymorphic",
  ]);
});
