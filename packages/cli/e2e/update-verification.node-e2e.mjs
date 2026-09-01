/**
 * Post-update verification, end to end under real Node against the built CLI.
 *
 * The important seam in this file is not merely "a package script ran". The
 * consumer-owned process begins after source, pristine bases and receipt are
 * written but before the shared rollback journal is released. These tests
 * therefore assert both facts on every failure path: verification failed (or
 * never ran), and every captured managed/control preimage was restored.
 *
 * Run after both packages have been built:
 *   node --test packages/cli/e2e/update-verification.node-e2e.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { compileRegistry, writeRegistry } from "manteen-kit";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");

assert.equal(
  process.versions.bun,
  undefined,
  "the verification e2e tier must run under Node, not a source-tier runtime",
);
assert.ok(existsSync(CLI), `${CLI} is missing. Build packages/cli before running this tier.`);

const WORK = mkdtempSync(join(tmpdir(), "manteen-update-verification-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

const TSCONFIG = {
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@/components/ui/*": ["./src/components/ui/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/lib/*": ["./src/lib/*"],
    },
  },
};

const ALIASES = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

const ITEM = "@base/empty-state";
const DESTINATION = join("src", "components", "ui", "empty-state.tsx");
const BASE_PATH = join(".manteen", "bases", `${DESTINATION}.base`);
const RECEIPT_PATH = "manteen.lock.json";

function publish(name) {
  const outDir = join(WORK, name);
  const result = compileRegistry(join(BASE_FIXTURE, "manteen.registry.json"));
  assert.deepEqual(result.failures, [], `${name}: fixture must compile`);
  writeRegistry(result, outDir);
  const base = pathToFileURL(outDir).href;
  return {
    dir: outDir,
    config: { url: `${base}/{name}.json`, index: `${base}/registry.json` },
  };
}

function makeProject({ registry, checks, scripts = {}, timeoutMs }) {
  // Keep the spelling of the fixture root identical to getcwd(3), including on
  // systems where the temporary directory is exposed through a symlink.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "manteen-verification-project-")));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "verification-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: "npm@10.9.2",
        scripts,
        // Already declared and installed, so ordinary cases never need the
        // network or a dependency-install subprocess.
        dependencies: { "@mantine/core": "^9.5.0" },
      },
      null,
      2,
    )}\n`,
  );

  mkdirSync(join(dir, "node_modules", "@mantine", "core"), { recursive: true });
  writeFileSync(
    join(dir, "node_modules", "@mantine", "core", "package.json"),
    `${JSON.stringify({ name: "@mantine/core", version: "9.5.0" }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "tsconfig.json"), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  writeFileSync(
    join(dir, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@base": registry.config },
        aliases: ALIASES,
        ...(checks === undefined
          ? {}
          : {
              verification: { update: checks, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
            }),
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

function run(project, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: "utf8",
    env: childEnv(),
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    get all() {
      return `${this.stdout}${this.stderr}`;
    },
  };
}

/** Parse stdout alone. Child output is allowed on stderr but may never append a
 * byte before or after this JSON document. */
function json(result) {
  const document = JSON.parse(result.stdout);
  return new Proxy(document, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      return target.payload?.[property];
    },
  });
}

function install(project, extra = []) {
  const result = run(project, ["add", ITEM, ...extra]);
  assert.equal(result.status, 0, result.all);
  assert.equal(existsSync(join(project, DESTINATION)), true, "fixture item was not installed");
}

function writeVerifier(project, filename, source) {
  writeFileSync(join(project, filename), `${source.trim()}\n`);
}

/** Append a non-overlapping upstream change and return the exact new bytes. */
function moveUpstream(registry, tag) {
  const itemPath = join(registry.dir, "empty-state.json");
  const item = JSON.parse(readFileSync(itemPath, "utf8"));
  item.files[0].content = `${item.files[0].content}\n// ${tag}\n`;
  writeFileSync(itemPath, `${JSON.stringify(item, null, 2)}\n`);
  return item.files[0].content;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertAppliedTree(project, expected) {
  const source = readFileSync(join(project, DESTINATION));
  const base = readFileSync(join(project, BASE_PATH));
  assert.equal(source.toString("utf8"), expected, "incoming source must remain applied");
  assert.equal(base.toString("utf8"), expected, "new pristine base must remain applied");

  const receiptText = readFileSync(join(project, RECEIPT_PATH), "utf8");
  const receipt = JSON.parse(receiptText);
  const file = receipt.items
    .find((entry) => entry.id === ITEM)
    ?.files.find((entry) => entry.destination === DESTINATION.split("\\").join("/"));
  assert.ok(file, "updated item is missing from the receipt");
  assert.equal(file.destination, DESTINATION.split("\\").join("/"));
  assert.equal(file.installedSha256, sha256(source));
  assert.equal(file.baseSha256, sha256(base));
  assert.equal(receiptText.includes('"verification"'), false, "receipt acquired a certificate");
  return receipt;
}

function snapshotManagedTree(project) {
  return {
    source: readFileSync(join(project, DESTINATION)),
    base: readFileSync(join(project, BASE_PATH)),
    receipt: readFileSync(join(project, RECEIPT_PATH)),
    packageJson: readFileSync(join(project, "package.json")),
    config: readFileSync(join(project, "manteen.json")),
  };
}

function assertManagedTree(project, expected) {
  assert.deepEqual(readFileSync(join(project, DESTINATION)), expected.source);
  assert.deepEqual(readFileSync(join(project, BASE_PATH)), expected.base);
  assert.deepEqual(readFileSync(join(project, RECEIPT_PATH)), expected.receipt);
  assert.deepEqual(readFileSync(join(project, "package.json")), expected.packageJson);
  assert.deepEqual(readFileSync(join(project, "manteen.json")), expected.config);
}

test("a configured passing check verifies the applied update and may create an ordinary artifact", () => {
  const registry = publish("passing");
  const project = makeProject({
    registry,
    checks: ["verify:pass"],
    scripts: { "verify:pass": "node verify-pass.mjs" },
  });
  writeVerifier(
    project,
    "verify-pass.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verification-cache", "allowed outside the managed set\\n");
    `,
  );
  install(project);
  const incoming = moveUpstream(registry, "passing verification upstream");

  const preview = run(project, ["update", "--dry-run", "--json"]);
  assert.equal(preview.status, 0, preview.all);
  const previewDocument = json(preview);
  assert.equal(previewDocument.kind, "previewed");
  assert.equal(previewDocument.dryRun, true);
  const digest = previewDocument.planDigest;
  assert.match(digest, /^[0-9a-f]{64}$/);

  const result = run(project, ["update", "--expect-plan", digest, "--json"]);
  assert.equal(result.status, 0, result.all);
  const doc = json(result);
  assert.equal(doc.ok, true);
  assert.equal(doc.kind, "applied");
  assert.equal(doc.dryRun, false);
  assert.equal(doc.planDigest, digest);
  assert.equal(doc.verification.status, "passed");
  assert.deepEqual(
    doc.verification.checks.map(({ script, result: checkResult }) => [script, checkResult]),
    [["verify:pass", "passed"]],
  );
  assert.equal(existsSync(join(project, ".verification-cache")), true);
  assertAppliedTree(project, incoming);
});

test("verification is fail-fast and failure restores source, base, receipt and controls", () => {
  const registry = publish("fail-fast");
  const project = makeProject({
    registry,
    checks: ["verify:first", "verify:later"],
    scripts: {
      "verify:first": "node verify-first.mjs",
      "verify:later": "node verify-later.mjs",
    },
  });
  writeVerifier(
    project,
    "verify-first.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-first", "ran\\n");
      process.exitCode = 7;
    `,
  );
  writeVerifier(
    project,
    "verify-later.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-later", "must not run\\n");
    `,
  );
  install(project);
  const before = snapshotManagedTree(project);
  moveUpstream(registry, "failed verification upstream");

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 1, result.all);
  const doc = json(result);
  assert.equal(doc.ok, false);
  assert.equal(doc.kind, "rolled-back", "a restored verification failure is not applied");
  assert.equal(doc.verification.status, "failed");
  assert.equal(doc.verification.failure.kind, "script-failed");
  assert.equal(doc.verification.failure.exitCode, 7);
  assert.match(doc.verification.failure.message, /restore captured preimages/i);
  assert.match(doc.failure.message, /restored to its previous contents/i);
  assert.equal(doc.mutated, false);
  assert.deepEqual(
    doc.verification.checks.map(({ script, result: checkResult }) => [script, checkResult]),
    [
      ["verify:first", "failed"],
      ["verify:later", "not-run"],
    ],
  );
  assert.equal(existsSync(join(project, ".verify-first")), true);
  assert.equal(existsSync(join(project, ".verify-later")), false, "later script was not skipped");
  assertManagedTree(project, before);
});

/**
 * A hang is the one verification failure the CLI cannot report by waiting for
 * it, so the ceiling has to end the run itself. The seam worth pinning is that
 * a terminated check reports as `timed-out` and NOT as `script-failed`: a killed
 * child also exits non-zero, and "your script failed" sends the reader after a
 * bug in their test suite rather than at a process that never finished.
 *
 * `timeoutMs` is tiny here on purpose. This asserts the mechanism, not the
 * default — a test that waited out the shipped five minutes would be a hang of
 * its own.
 */
test("a check that never finishes is terminated and reported as a timeout", () => {
  const registry = publish("timeout");
  const project = makeProject({
    registry,
    checks: ["verify:hang", "verify:later"],
    scripts: {
      "verify:hang": "node verify-hang.mjs",
      "verify:later": "node verify-later.mjs",
    },
    timeoutMs: 1000,
  });
  writeVerifier(
    project,
    "verify-hang.mjs",
    `
      // No timer to clear and nothing to resolve it: this process only ends
      // when something outside it decides to end it.
      setInterval(() => {}, 1000);
    `,
  );
  writeVerifier(
    project,
    "verify-later.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-later", "must not run\\n");
    `,
  );
  install(project);
  const before = snapshotManagedTree(project);
  moveUpstream(registry, "timed out verification upstream");

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 1, result.all);
  const doc = json(result);
  assert.equal(doc.ok, false);
  assert.equal(doc.kind, "rolled-back", "a restored verification timeout is not applied");
  assert.equal(doc.verification.status, "failed");
  assert.equal(doc.verification.failure.kind, "timed-out");
  assert.equal(doc.verification.failure.script, "verify:hang");
  assert.equal(doc.verification.failure.timeoutMs, 1000);
  assert.match(doc.verification.failure.message, /did not finish within 1000ms/);
  assert.match(doc.verification.failure.message, /restore captured preimages/i);
  assert.match(doc.verification.failure.message, /timeoutMs/, "the message names the way out");
  assert.match(doc.failure.message, /restored to its previous contents/i);
  assert.equal(doc.mutated, false);
  assert.deepEqual(
    doc.verification.checks.map(({ script, result: checkResult }) => [script, checkResult]),
    [
      ["verify:hang", "failed"],
      ["verify:later", "not-run"],
    ],
  );
  assert.equal(existsSync(join(project, ".verify-later")), false, "fail-fast still holds");
  assertManagedTree(project, before);
});

test("--no-verify bypasses dynamic missing-script refusal and reports skipped", () => {
  const registry = publish("no-verify");
  const project = makeProject({
    registry,
    checks: ["verify:not-defined"],
    scripts: {},
  });
  install(project);
  const incoming = moveUpstream(registry, "no verify upstream");

  const result = run(project, ["update", "--no-verify", "--json"]);
  assert.equal(result.status, 0, result.all);
  const doc = json(result);
  assert.equal(doc.verification.status, "skipped");
  assert.deepEqual(doc.verification.checks, []);
  assertAppliedTree(project, incoming);
});

test("--no-verify does not bypass malformed verification configuration", () => {
  const registry = publish("invalid-config-no-verify");
  const project = makeProject({ registry, checks: [], scripts: {} });

  const result = run(project, ["update", "--no-verify", "--json"]);

  assert.equal(result.status, 2, result.all);
  assert.equal(result.stderr, "", "configuration failures belong inside the JSON envelope");
  const document = json(result);
  assert.equal(document.ok, false);
  assert.equal(document.exitCode, 2);
  assert.match(document.errors[0]?.message ?? "", /verification\/update/i);
});

test("diff ignores update verification and never resolves a missing script", () => {
  const registry = publish("diff-ignores-verification");
  const project = makeProject({ registry, checks: ["verify:missing"], scripts: {} });
  install(project);

  const result = run(project, ["diff"]);

  assert.equal(result.status, 0, result.all);
  assert.doesNotMatch(result.stderr, /verification-script-unavailable/, result.stderr);
  assert.doesNotMatch(result.stderr, /verify:missing/, result.stderr);
});

test("a missing configured script refuses before apply", () => {
  const registry = publish("missing-script");
  const project = makeProject({
    registry,
    checks: ["verify:missing"],
    scripts: {},
  });
  install(project);
  moveUpstream(registry, "missing script upstream");
  const sourceBefore = readFileSync(join(project, DESTINATION));
  const baseBefore = readFileSync(join(project, BASE_PATH));
  const receiptBefore = readFileSync(join(project, RECEIPT_PATH));

  for (const args of [["update"], ["update", "--force"]]) {
    const result = run(project, args);
    assert.equal(result.status, 1, result.all);
    assert.match(result.stderr, /verify:missing/, result.stderr);
  }
  assert.deepEqual(readFileSync(join(project, DESTINATION)), sourceBefore);
  assert.deepEqual(readFileSync(join(project, BASE_PATH)), baseBefore);
  assert.deepEqual(readFileSync(join(project, RECEIPT_PATH)), receiptBefore);
});

test("dry-run reports planned checks, invokes none and writes nothing", () => {
  const registry = publish("dry-run");
  const project = makeProject({
    registry,
    checks: ["verify:dry"],
    scripts: { "verify:dry": "node verify-dry.mjs" },
  });
  writeVerifier(
    project,
    "verify-dry.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-dry", "must not run\\n");
    `,
  );
  install(project);
  moveUpstream(registry, "dry run upstream");
  const sourceBefore = readFileSync(join(project, DESTINATION));
  const baseBefore = readFileSync(join(project, BASE_PATH));
  const receiptBefore = readFileSync(join(project, RECEIPT_PATH));

  const result = run(project, ["update", "--dry-run", "--json"]);
  assert.equal(result.status, 0, result.all);
  const doc = json(result);
  assert.equal(doc.verification.status, "planned");
  assert.deepEqual(
    doc.verification.checks.map(({ script, result: checkResult }) => [script, checkResult]),
    [["verify:dry", "not-run"]],
  );
  assert.equal(existsSync(join(project, ".verify-dry")), false);
  assert.deepEqual(readFileSync(join(project, DESTINATION)), sourceBefore);
  assert.deepEqual(readFileSync(join(project, BASE_PATH)), baseBefore);
  assert.deepEqual(readFileSync(join(project, RECEIPT_PATH)), receiptBefore);
});

test("a merge conflict runs no verification script and changes no update state", () => {
  const registry = publish("conflict");
  const project = makeProject({
    registry,
    checks: ["verify:conflict"],
    scripts: { "verify:conflict": "node verify-conflict.mjs" },
  });
  writeVerifier(
    project,
    "verify-conflict.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-conflict", "must not run\\n");
    `,
  );
  install(project);

  const target = join(project, DESTINATION);
  writeFileSync(target, readFileSync(target, "utf8").replace("Nothing here", "Nothing local"));
  const itemPath = join(registry.dir, "empty-state.json");
  const item = JSON.parse(readFileSync(itemPath, "utf8"));
  item.files[0].content = item.files[0].content.replace("Nothing here", "Nothing upstream");
  writeFileSync(itemPath, `${JSON.stringify(item, null, 2)}\n`);

  const sourceBefore = readFileSync(target);
  const baseBefore = readFileSync(join(project, BASE_PATH));
  const receiptBefore = readFileSync(join(project, RECEIPT_PATH));
  const result = run(project, ["update"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /update-conflict/, result.stderr);
  assert.equal(existsSync(join(project, ".verify-conflict")), false);
  assert.deepEqual(readFileSync(target), sourceBefore);
  assert.deepEqual(readFileSync(join(project, BASE_PATH)), baseBefore);
  assert.deepEqual(readFileSync(join(project, RECEIPT_PATH)), receiptBefore);
});

test("an all-identical installed update still runs configured verification", () => {
  const registry = publish("all-identical");
  const project = makeProject({
    registry,
    checks: ["verify:identical"],
    scripts: { "verify:identical": "node verify-identical.mjs" },
  });
  writeVerifier(
    project,
    "verify-identical.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".verify-identical", "ran\\n");
    `,
  );
  install(project);
  const sourceBefore = readFileSync(join(project, DESTINATION));
  const baseBefore = readFileSync(join(project, BASE_PATH));
  const receiptBefore = readFileSync(join(project, RECEIPT_PATH));

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 0, result.all);
  assert.equal(json(result).verification.status, "passed");
  assert.equal(existsSync(join(project, ".verify-identical")), true);
  assert.deepEqual(readFileSync(join(project, DESTINATION)), sourceBefore);
  assert.deepEqual(readFileSync(join(project, BASE_PATH)), baseBefore);
  assert.deepEqual(readFileSync(join(project, RECEIPT_PATH)), receiptBefore);
});

test("JSON stdout remains one document while both child streams route to stderr", () => {
  const registry = publish("json-streams");
  const project = makeProject({
    registry,
    checks: ["verify:streams"],
    scripts: { "verify:streams": "node verify-streams.mjs" },
  });
  writeVerifier(
    project,
    "verify-streams.mjs",
    `
      process.stdout.write("child-stdout-sentinel\\n");
      process.stderr.write("child-stderr-sentinel\\n");
    `,
  );
  install(project);

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 0, result.all);
  const doc = json(result);
  assert.equal(doc.verification.status, "passed");
  assert.equal(result.stdout.includes("child-stdout-sentinel"), false, result.stdout);
  assert.equal(result.stdout.includes("child-stderr-sentinel"), false, result.stdout);
  assert.match(result.stderr, /child-stdout-sentinel/, result.stderr);
  assert.match(result.stderr, /child-stderr-sentinel/, result.stderr);
});

test("an applied package-script change makes the planned definition stale", () => {
  const registry = publish("definition-stale");
  const project = makeProject({
    registry,
    checks: ["verify:stale"],
    scripts: { "verify:stale": "node stale-original.mjs" },
  });
  writeVerifier(
    project,
    "stale-original.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".stale-original-ran", "must not run\\n");
    `,
  );
  writeVerifier(
    project,
    "stale-replacement.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(".stale-replacement-ran", "must not run\\n");
    `,
  );
  const itemPath = join(registry.dir, "empty-state.json");
  const item = JSON.parse(readFileSync(itemPath, "utf8"));

  // Explicit project-root targets are part of the registry interchange. Make
  // this item own the current package.json so the subsequent update can change
  // a planned definition during apply without a timing race or networked
  // dependency fixture.
  item.files.push({
    path: "registry/project/package.json",
    type: "registry:file",
    target: "~/package.json",
    content: readFileSync(join(project, "package.json"), "utf8"),
  });
  writeFileSync(itemPath, `${JSON.stringify(item, null, 2)}\n`);
  install(project, ["--overwrite"]);
  const before = snapshotManagedTree(project);

  const changedPackage = JSON.parse(item.files.at(-1).content);
  changedPackage.scripts["verify:stale"] = "node stale-replacement.mjs";
  item.files.at(-1).content = `${JSON.stringify(changedPackage, null, 2)}\n`;
  item.files[0].content = `${item.files[0].content}\n// definition stale upstream\n`;
  writeFileSync(itemPath, `${JSON.stringify(item, null, 2)}\n`);

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 1, result.all);
  const doc = json(result);
  assert.equal(doc.kind, "rolled-back");
  assert.equal(doc.verification.status, "failed");
  assert.equal(doc.verification.failure.kind, "definition-stale");
  assert.equal(existsSync(join(project, ".stale-original-ran")), false);
  assert.equal(existsSync(join(project, ".stale-replacement-ran")), false);
  assert.equal(doc.mutated, false);
  assertManagedTree(project, before);
});

test("a zero-exit script that changes a managed component fails verification as byte drift", () => {
  const registry = publish("managed-drift");
  const project = makeProject({
    registry,
    checks: ["verify:drift"],
    scripts: { "verify:drift": "node verify-drift.mjs" },
  });
  writeVerifier(
    project,
    "verify-drift.mjs",
    `
      import { appendFileSync } from "node:fs";
      appendFileSync("src/components/ui/empty-state.tsx", "// verifier drift\\n");
    `,
  );
  install(project);
  const pristine = readFileSync(join(project, DESTINATION), "utf8");
  const before = snapshotManagedTree(project);

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 1, result.all);
  const doc = json(result);
  assert.equal(doc.kind, "rolled-back");
  assert.equal(doc.verification.status, "failed");
  assert.equal(doc.verification.failure.kind, "managed-byte-drift");
  assert.match(JSON.stringify(doc.verification.failure), /src\/components\/ui\/empty-state\.tsx/);
  assert.equal(doc.verification.checks[0].result, "failed");
  assert.equal(readFileSync(join(project, DESTINATION), "utf8"), pristine);
  assert.equal(doc.mutated, false);
  assertManagedTree(project, before);
});
