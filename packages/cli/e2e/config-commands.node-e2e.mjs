import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist/cli.mjs");
const ENV = {
  ...process.env,
  WORKSHOP_TOKEN: "expanded-header-secret",
  WORKSHOP_QUERY: "expanded-query-secret",
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "manteen-config-command-node-"));
  writeFileSync(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@house": "https://house.test/{name}.json" },
        aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(root, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  return root;
}

function run(root, args) {
  return spawnSync(process.execPath, [CLI, ...args, "--cwd", root, "--json"], {
    encoding: "utf8",
    env: ENV,
  });
}

function envelope(result) {
  assert.equal(result.stderr, "", result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.schemaVersion, 2);
  assert.ok(Array.isArray(value.actions));
  return value;
}

test("built registry commands turn a secret-safe preview into one exact reviewed apply", () => {
  const root = fixture();
  try {
    const plannedResult = run(root, [
      "registry",
      "add",
      "@workshop",
      "--url",
      "https://workshop.test/{name}.json",
      "--header",
      "Authorization=Bearer ${WORKSHOP_TOKEN}",
      "--param",
      "token=${WORKSHOP_QUERY}",
      "--dry-run",
    ]);
    assert.equal(plannedResult.status, 0, plannedResult.stdout);
    const planned = envelope(plannedResult);
    assert.equal(planned.command, "registry");
    assert.equal(planned.mutated, false);
    assert.equal(planned.actions.length, 1);
    assert.equal(planned.actions[0].kind, "rerun");
    assert.equal(planned.actions[0].argv.includes("--dry-run"), false);
    assert.deepEqual(planned.actions[0].argv.slice(-2), [
      "--expect-plan",
      planned.payload.planDigest,
    ]);
    assert.equal(plannedResult.stdout.includes("expanded-header-secret"), false);
    assert.equal(plannedResult.stdout.includes("expanded-query-secret"), false);

    const appliedResult = spawnSync(process.execPath, [CLI, ...planned.actions[0].argv.slice(1)], {
      encoding: "utf8",
      env: ENV,
    });
    assert.equal(appliedResult.status, 0, appliedResult.stdout);
    const applied = envelope(appliedResult);
    assert.equal(applied.mutated, true);
    assert.equal(applied.actions.length, 0);
    const config = JSON.parse(readFileSync(join(root, "manteen.json"), "utf8"));
    assert.equal(config.registries["@workshop"].headers.Authorization, "Bearer ${WORKSHOP_TOKEN}");
    assert.equal(config.registries["@workshop"].params.token, "${WORKSHOP_QUERY}");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built verification commands discover scripts and refuse a stale reviewed plan", () => {
  const root = fixture();
  try {
    const shown = envelope(run(root, ["verification", "show"]));
    assert.deepEqual(shown.payload.availableScripts, ["test"]);

    const planned = envelope(
      run(root, ["verification", "set", "--add", "test", "--timeout-ms", "5000", "--dry-run"]),
    );
    assert.equal(planned.actions.length, 1);
    writeFileSync(
      join(root, "manteen.json"),
      `${readFileSync(join(root, "manteen.json"), "utf8").trimEnd()} \n`,
    );

    const staleResult = spawnSync(process.execPath, [CLI, ...planned.actions[0].argv.slice(1)], {
      encoding: "utf8",
      env: ENV,
    });
    assert.equal(staleResult.status, 1, staleResult.stdout);
    const stale = envelope(staleResult);
    assert.equal(stale.ok, false);
    assert.equal(stale.mutated, false);
    assert.equal(stale.errors[0].code, "config-plan-stale");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
