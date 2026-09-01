import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist/cli.mjs");

test("built CLI reports its exact package version", () => {
  const { version } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const result = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, JSON.stringify(result));
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, "");
});

function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "manteen-scaffold-node-")));
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
        items: [
          {
            name: "existing",
            kind: "component",
            files: [{ path: "src/existing.tsx", as: "component" }],
            stylesApi: { Existing: ["root"] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, "src/existing.tsx"), "export const Existing = () => null;\n");
  writeFileSync(join(root, "evidence/existing.contract"), "existing ownership\n");
  writeFileSync(
    profilePath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        stylesApi: [
          {
            item: "existing",
            component: "Existing",
            evidence: "evidence/existing.contract",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
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
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.command, "scaffold");
  return value;
}

test("built CLI on a supported Node runtime preserves the scaffold plan/apply contract", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  assert.ok(major > 20 || (major === 20 && minor >= 11), process.versions.node);
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

    const malformedName = run(created.root, [
      "scaffold",
      "--template",
      "component-basic",
      "--name",
      "a--b",
      "--catalog",
      created.catalogPath,
      "--dry-run",
      "--json",
    ]);
    assert.equal(malformedName.status, 2);
    const malformedEnvelope = json(malformedName);
    assert.equal(malformedEnvelope.mutated, false);
    assert.equal(malformedEnvelope.errors[0].code, "invalid-arguments");
  } finally {
    rmSync(created.root, { recursive: true, force: true });
  }
});

test("built package exports the public scaffold planner", async () => {
  const kit = await import(pathToFileURL(join(PACKAGE_ROOT, "dist/index.mjs")).href);
  assert.equal(typeof kit.planScaffold, "function");
  assert.equal(typeof kit.applyScaffold, "function");
  assert.deepEqual(kit.SCAFFOLD_TEMPLATES, [
    "component-basic",
    "component-styles-api",
    "component-polymorphic",
  ]);
});

test("built CLI --register completes and replays the full authoring plan", () => {
  const created = fixture();
  try {
    const common = [
      "scaffold",
      "--template",
      "component-styles-api",
      "--name",
      "registered-card",
      "--catalog",
      created.catalogPath,
      "--register",
      "--json",
    ];
    const preview = run(created.root, [...common, "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    const plan = json(preview).payload;
    assert.equal(plan.registration.enabled, true);
    assert.deepEqual(
      plan.registration.files.map((file) => [file.path, file.operation]),
      [
        ["manteen.author-profile.json", "replace"],
        ["manteen.registry.json", "replace"],
        ["package.json", "replace"],
      ],
    );

    const apply = run(created.root, [...common, "--apply", "--expect-plan", plan.planDigest]);
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);
    assert.equal(json(apply).mutated, true);
    const catalog = JSON.parse(readFileSync(created.catalogPath, "utf8"));
    const item = catalog.items.find((candidate) => candidate.name === "registered-card");
    assert.deepEqual(
      item.files.map((file) => file.target),
      ["@ui/registered-card/registered-card.tsx", "@ui/registered-card/registered-card.module.css"],
    );
    const profile = JSON.parse(readFileSync(created.profilePath, "utf8"));
    assert.equal(profile.stylesApi.at(-1).item, "registered-card");
    const manifest = JSON.parse(readFileSync(created.manifestPath, "utf8"));
    assert.equal(manifest.dependencies["@mantine/core"], "^9.5.0");

    const replay = run(created.root, [...common, "--dry-run"]);
    assert.equal(replay.status, 0, replay.stderr || replay.stdout);
    const replayPlan = json(replay).payload;
    assert.ok(replayPlan.files.every((file) => file.operation === "noop"));
    assert.ok(replayPlan.registration.files.every((file) => file.operation === "noop"));
  } finally {
    rmSync(created.root, { recursive: true, force: true });
  }
});
