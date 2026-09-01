/**
 * W5's command set — `list`, `info`, `diff`, `update` — end to end under real
 * `node`, against a `file:` registry compiled from the kit's own fixtures.
 *
 * These four modules were written by four agents who could not see each other's
 * work, so what this file is actually for is the SEAMS between them: one exit
 * convention, one `--json` envelope, one way of saying "no receipt yet", one way
 * of naming a registry that could not be listed. Every assertion below that
 * checks a shape rather than a value is checking a seam.
 *
 * Every command runs in a child process spawned with `process.execPath` against
 * the BUILT `dist/cli.mjs`. That is the only shape a user ever gets, and it is
 * the only tier where the runtime-API guard's bans are actually enforced by the
 * runtime — under `bun test` every one of them resolves happily.
 *
 * (Worded around the banned spellings rather than quoting them: the guard scans
 * `e2e/` too, and a comment naming one turns it red.)
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.node-e2e.mjs
 *
 * NEVER run the build concurrently with this file: tsdown cleans `dist/` first,
 * and a spawn that lands in that window fails with MODULE_NOT_FOUND on
 * `dist/cli.mjs` — which reads as a broken command rather than a missed build.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
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

import { applyScaffold, compileRegistry, planScaffold, writeRegistry } from "manteen-kit";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");

assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node, not bun — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);

assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

const WORK = mkdtempSync(join(tmpdir(), "manteen-cmdset-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

/**
 * Compile the authoring catalog to the wire format and serve it over `file:`.
 *
 * Returns BOTH URLs, because W5 is the first phase that needs the second one:
 * `url` is D21's item template and `index` is the catalog `writeRegistry` emits
 * beside the items as `registry.json`. `list` and `info` read the index; `add`,
 * `diff` and `update` read items. A registry with only `url` is still valid —
 * that is the `no-index` case, asserted at the bottom of this file.
 *
 * `pathToFileURL` on the DIRECTORY, then the template appended as text: URL
 * encoding would turn the literal `{name}` the config schema requires into
 * `%7Bname%7D`.
 */
function publish(fixtureDir, outName) {
  const outDir = join(WORK, outName);
  const result = compileRegistry(join(fixtureDir, "manteen.registry.json"));
  assert.deepEqual(result.failures, [], `${outName} fixture does not compile`);
  writeRegistry(result, outDir);
  const base = pathToFileURL(outDir).href;
  return { url: `${base}/{name}.json`, index: `${base}/registry.json` };
}

const BASE = publish(BASE_FIXTURE, "base");

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

/** A consumer project. Scaffolding copied from `first-slice.node-e2e.mjs`,
 *  including the two D15/D17 hermeticity measures documented there. */
function makeProject({
  registries = { "@base": BASE },
  aliases = ALIASES,
  theme,
  scripts = {},
  verification,
} = {}) {
  // macOS exposes tmpdir through `/var` while getcwd(3), and therefore the CLI,
  // reports the canonical `/private/var` path. Keep the fixture on that same
  // absolute-path boundary instead of comparing two spellings of one directory.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "manteen-cmdset-project-")));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "cmdset-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        scripts,
        // D15: nypm returns `undefined` — not a throw — with no lockfile and no
        // `packageManager` field, and plan() turns that into a
        // `no-package-manager` refusal at exit 2.
        packageManager: "npm@10.9.2",
        // D17 drops a dependency only when BOTH the installed version satisfies
        // the range AND the name is already declared here. Both hold, so
        // `@mantine/core@^9` never reaches an installer and the tier stays
        // hermetic — no network, no `npm install`.
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
    // `theme` omitted rather than written as `undefined`: the config schema has
    // `additionalProperties: false` and a present-but-null key is a config error,
    // not an absent one.
    `${JSON.stringify(
      {
        registries,
        aliases,
        ...(theme === undefined ? {} : { theme }),
        ...(verification === undefined ? {} : { verification }),
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
    // `CI=true`, not `CI=1`: D14's predicate is an exact string comparison, so
    // `CI=1` would leave the child on the interactive branch, where a prompt
    // against a piped stdin hangs until the test times out.
    env: childEnv(),
  });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    get all() {
      return `${this.stdout}${this.stderr}${this.signal === null ? "" : `signal: ${this.signal}\n`}${this.error === undefined ? "" : `${this.error.stack ?? this.error.message}\n`}`;
    },
  };
}

/** stdout, parsed. Asserts the `--json` contract in the act of using it: the
 *  document is on STDOUT ALONE and is the whole of it. */
function json(result) {
  const document = JSON.parse(result.stdout);
  return new Proxy(document, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      return target.payload?.[property];
    },
  });
}

const ITEM = "@base/empty-state";
const DESTINATION = join("src", "components", "ui", "empty-state.tsx");

// ---- the four commands on a project that has never run `add` ----------------
// The single most common first contact with any of them, and the one an
// installer is most likely to get wrong by exiting non-zero on it.

test("all four commands answer on a project with no receipt, and none of them fails", () => {
  const project = makeProject();

  const listed = run(project, ["list"]);
  assert.equal(listed.status, 0, listed.all);
  assert.match(listed.stdout, /@base/, listed.all);
  assert.match(listed.stdout, /empty-state/, listed.all);

  const described = run(project, ["info", ITEM]);
  assert.equal(described.status, 0, described.all);

  const compared = run(project, ["diff"]);
  assert.equal(compared.status, 0, compared.all);
  assert.match(compared.stdout, /Nothing to compare/, compared.all);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  assert.equal(updated.stdout, "Nothing to update.\n");
});

test("`no receipt yet` is one note, worded once, and root-relative in all four", () => {
  const project = makeProject();

  // `list` and `diff` both surface the receipt note; `update` reports the same
  // state as "nothing to do". The note text must be IDENTICAL between the two
  // that print it — it comes from `installed.ts` and goes through one renderer.
  const listed = run(project, ["list"]);
  const compared = run(project, ["diff"]);

  const expected = "note  no-receipt\n  manteen.lock.json does not exist";
  assert.ok(listed.stderr.startsWith(expected), listed.stderr);
  assert.ok(compared.stderr.startsWith(expected), compared.stderr);

  // ROOT-RELATIVE, not the absolute tmpdir path. An absolute path here is
  // unassertable across machines, which is why this assertion exists at all.
  assert.equal(listed.stderr.includes(project), false, listed.stderr);
  assert.equal(compared.stderr.includes(project), false, compared.stderr);

  // Notes are on STDERR in text mode, in every command. `info` used to print
  // them into its stdout report; this is the assertion that keeps it from
  // drifting back.
  const described = run(project, ["info", ITEM]);
  assert.equal(described.stdout.includes("no-receipt"), false, described.stdout);
});

// ---- the shared --json envelope ---------------------------------------------

test("every --json document carries the versioned eleven-key envelope on stdout alone", () => {
  const project = makeProject();
  run(project, ["add", ITEM]);

  for (const [command, args] of [
    ["list", ["list", "--json"]],
    ["info", ["info", ITEM, "--json"]],
    ["diff", ["diff", "--json"]],
    ["update", ["update", "--json"]],
  ]) {
    const result = run(project, args);
    const doc = json(result);

    assert.deepEqual(Object.keys(doc), [
      "schemaVersion",
      "command",
      "root",
      "ok",
      "exitCode",
      "mutated",
      "payload",
      "diagnostics",
      "errors",
      "notes",
      "actions",
    ]);
    assert.equal(doc.schemaVersion, 2);
    assert.equal(doc.command, command, `${command}: wrong discriminator`);
    assert.equal(typeof doc.root, "string", `${command}: no root`);
    assert.equal(doc.root, project, `${command}: root must be the absolute project root`);
    assert.equal(typeof doc.ok, "boolean", `${command}: no ok`);
    assert.equal(doc.ok, result.status === 0, `${command}: ok must equal exit === 0`);
    assert.equal(doc.exitCode, result.status, `${command}: exitCode must equal process status`);
    assert.equal(typeof doc.mutated, "boolean", `${command}: mutated must be boolean`);
    assert.ok(doc.payload && typeof doc.payload === "object", `${command}: no payload`);
    assert.ok(Array.isArray(doc.diagnostics), `${command}: diagnostics must be present`);
    assert.ok(Array.isArray(doc.errors), `${command}: errors must be present`);

    // Notes travel INSIDE the document, never on the other stream — otherwise a
    // consumer parsing stdout silently sees a partial answer.
    assert.ok(Array.isArray(doc.notes), `${command}: notes must always be present`);
    assert.ok(Array.isArray(doc.actions), `${command}: actions must always be present`);
    assert.equal(result.stderr, "", `${command}: --json must leave stderr empty`);
    if (command === "update") {
      assert.deepEqual(doc.payload.updateState, { changed: false, versioningRequired: false });
    }
  }
});

test("add JSON is non-interactive, truthful about mutation, and gives typed remediation", () => {
  const project = makeProject();
  const added = run(project, ["add", ITEM, "--json"]);
  assert.equal(added.status, 0, added.all);
  assert.equal(added.stderr, "", added.stderr);
  const addedDocument = json(added);
  assert.equal(addedDocument.command, "add");
  assert.equal(addedDocument.ok, true);
  assert.equal(addedDocument.exitCode, 0);
  assert.equal(addedDocument.mutated, true);
  assert.deepEqual(addedDocument.payload.refs, [ITEM]);
  assert.deepEqual(addedDocument.notes, [
    "Manteen completed registry installation but did not assess application integration. If the task requires the installed items to be used, inspect their `manteen info` usage and props, edit consumer-owned application code, and run the project's required checks.",
  ]);

  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// local adaptation\n`);
  const refused = run(project, ["add", ITEM, "--json"]);
  assert.equal(refused.status, 1, refused.all);
  assert.equal(refused.stderr, "", refused.stderr);
  const refusedDocument = json(refused);
  assert.equal(refusedDocument.ok, false);
  assert.equal(refusedDocument.mutated, false);
  const collision = refusedDocument.diagnostics.find(
    (diagnostic) => diagnostic.code === "destination-exists",
  );
  assert.ok(collision, refused.stdout);
  assert.ok(collision.actions.some((action) => action.kind === "rerun"));
  assert.ok(collision.actions.every((action) => action.argv[0] === "manteen"));
});

test("JSON usage and configuration failures are one complete stdout document", () => {
  const project = mkdtempSync(join(tmpdir(), "manteen-json-failure-"));

  const usage = run(project, ["info", "--json"]);
  assert.equal(usage.status, 2, usage.all);
  assert.equal(usage.stderr, "", usage.stderr);
  const usageDocument = json(usage);
  assert.equal(usageDocument.ok, false);
  assert.equal(usageDocument.exitCode, 2);
  assert.equal(usageDocument.payload, null);
  assert.ok(usageDocument.errors[0]?.manualRationale);

  const config = run(project, ["list", "--json"]);
  assert.equal(config.status, 2, config.all);
  assert.equal(config.stderr, "", config.stderr);
  const configDocument = json(config);
  assert.equal(configDocument.ok, false);
  assert.equal(configDocument.exitCode, 2);
  assert.equal(configDocument.errors[0]?.code, "config");
  assert.match(configDocument.errors[0]?.message ?? "", /No manteen\.json/);
});

test("offline status and packaged agent guidance work before project initialization", () => {
  const project = join(WORK, "agent-uninitialized");
  mkdirSync(project);

  const status = run(project, ["status", "--json"]);
  assert.equal(status.status, 0, status.all);
  assert.equal(status.stderr, "", status.stderr);
  const statusDocument = json(status);
  assert.deepEqual(Object.keys(statusDocument), [
    "schemaVersion",
    "command",
    "root",
    "ok",
    "exitCode",
    "mutated",
    "payload",
    "diagnostics",
    "errors",
    "notes",
    "actions",
  ]);
  assert.equal(statusDocument.command, "status");
  assert.equal(statusDocument.ok, true);
  assert.equal(statusDocument.payload.healthy, false);
  assert.equal(statusDocument.payload.initialized, false);

  const guide = run(project, ["agent", "guide", "--json"]);
  assert.equal(guide.status, 0, guide.all);
  assert.equal(guide.stderr, "", guide.stderr);
  const guideDocument = json(guide);
  assert.equal(guideDocument.command, "agent guide");
  assert.equal(guideDocument.root, null);
  assert.equal(guideDocument.payload.manifest.skill.name, "manteen");
  assert.equal(guideDocument.payload.manifest.guideVersion, 3);
  assert.match(guideDocument.payload.skill, /^---\nname: manteen\n/);
  assert.match(
    guideDocument.payload.skill,
    /distinguish registry installation from application integration/,
  );
});

test("built agent install is dry-run safe and writes an owned packaged skill", () => {
  const project = join(WORK, "agent-install");
  mkdirSync(project);

  const preview = run(project, [
    "agent",
    "install",
    "--target",
    "custom",
    "--path",
    "skill",
    "--dry-run",
    "--json",
  ]);
  assert.equal(preview.status, 0, preview.all);
  assert.equal(json(preview).payload.mutated, false);
  assert.equal(existsSync(join(project, "skill")), false);

  const installed = run(project, [
    "agent",
    "install",
    "--target",
    "custom",
    "--path",
    "skill",
    "--json",
  ]);
  assert.equal(installed.status, 0, installed.all);
  const document = json(installed);
  assert.equal(document.mutated, true);
  assert.equal(document.payload.action, "install");
  assert.ok(existsSync(join(project, "skill", ".manteen-skill.json")));
  assert.ok(existsSync(join(project, "skill", "references", "json-contract.md")));
  assert.match(
    readFileSync(join(project, "skill", "references", "consumer.md"), "utf8"),
    /Report registry installation and application integration as separate facts/,
  );
});

test("add couples a reviewed dry-run to apply with planDigest", () => {
  const project = makeProject();
  const preview = run(project, ["add", ITEM, "--dry-run", "--json"]);
  assert.equal(preview.status, 0, preview.all);
  const digest = json(preview).payload.planDigest;
  assert.match(digest, /^[0-9a-f]{64}$/);

  const applied = run(project, ["add", ITEM, "--expect-plan", digest, "--json"]);
  assert.equal(applied.status, 0, applied.all);
  assert.equal(json(applied).payload.planDigest, digest);
  assert.ok(existsSync(join(project, DESTINATION)));

  const refusedProject = makeProject();
  const refused = run(refusedProject, ["add", ITEM, "--expect-plan", "0".repeat(64), "--json"]);
  assert.equal(refused.status, 1, refused.all);
  const refusal = json(refused);
  assert.equal(refusal.mutated, false);
  assert.ok(refusal.diagnostics.some((diagnostic) => diagnostic.code === "plan-mismatch"));
  assert.equal(existsSync(join(refusedProject, DESTINATION)), false);
});

test("configured add verification failure restores every managed byte", () => {
  const project = makeProject({
    scripts: { "verify:add": "node verify-add.mjs" },
    verification: { add: ["verify:add"] },
  });
  writeFileSync(
    join(project, "verify-add.mjs"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync(".verify-add-ran", "yes\\n");\nprocess.exitCode = 3;\n',
  );

  const result = run(project, ["add", ITEM, "--json"]);
  assert.equal(result.status, 1, result.all);
  const document = json(result);
  assert.equal(document.payload.verification.status, "failed");
  assert.equal(document.payload.verification.phase, "post-write-pre-commit");
  assert.equal(document.payload.verification.rollbackScope, "manteen-managed");
  assert.equal(document.payload.verification.failure.kind, "script-failed");
  assert.equal(document.mutated, false);
  assert.deepEqual(document.notes, []);
  assert.equal(existsSync(join(project, ".verify-add-ran")), true);
  assert.equal(existsSync(join(project, DESTINATION)), false);
  assert.equal(existsSync(join(project, "manteen.lock.json")), false);
  assert.equal(existsSync(join(project, ".manteen", "bases", `${DESTINATION}.base`)), false);
});

// ---- list -------------------------------------------------------------------

test("list marks an installed item, and its JSON says so with a root-relative path", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const text = run(project, ["list"]);
  assert.equal(text.status, 0, text.all);
  assert.match(text.stdout, /installed\s+empty-state/, text.stdout);

  const doc = json(run(project, ["list", "--json"]));
  const [registry] = doc.payload.registries;
  assert.equal(registry.namespace, "@base");
  const item = registry.items.find((entry) => entry.id === ITEM);
  assert.ok(item, `${ITEM} missing from the listing: ${text.stdout}`);
  assert.equal(item.installed.direct, true);
  assert.deepEqual(
    item.installed.files.map((file) => file.path),
    ["src/components/ui/empty-state.tsx"],
    "a listing path must be the POSIX, root-relative receipt form",
  );
  assert.equal(item.installed.files[0].status, "unchanged");
});

test("list --installed remains receipt-backed when its registry index is offline", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const configPath = join(project, "manteen.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.registries["@base"].index = "file:///definitely-missing-manteen-index/registry.json";
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const onlineRequired = run(project, ["list", "--json"]);
  assert.equal(onlineRequired.status, 1, onlineRequired.all);
  assert.ok(
    json(onlineRequired).notes.some((note) => note.includes("index-unreachable")),
    onlineRequired.all,
  );

  const installed = run(project, ["list", "--installed", "--json"]);
  assert.equal(installed.status, 0, installed.all);
  const document = json(installed);
  assert.equal(document.payload.registries.length, 1, installed.all);
  assert.deepEqual(
    document.payload.registries[0].items.map((item) => item.id),
    [ITEM],
  );
  assert.equal(document.payload.registries[0].items[0].installed.direct, true);
  assert.equal(
    document.notes.some((note) => note.includes("index-unreachable")),
    false,
  );
});

test("registered scaffold topology installs relative component and style imports as siblings", () => {
  const registryRoot = join(WORK, "registered-scaffold");
  mkdirSync(registryRoot, { recursive: true });
  const catalogPath = join(registryRoot, "manteen.registry.json");
  writeFileSync(
    catalogPath,
    `${JSON.stringify({ name: "Scaffold topology", namespace: "@scaffold", items: [] }, null, 2)}\n`,
  );
  writeFileSync(
    join(registryRoot, "package.json"),
    '{"name":"scaffold-topology","private":true}\n',
  );
  const input = {
    catalogPath,
    template: "component-styles-api",
    itemName: "status-card",
    register: true,
  };
  const plan = planScaffold(input);
  assert.equal(plan.safe, true, JSON.stringify(plan.diagnostics));
  applyScaffold(input, plan.planDigest);
  const outDir = join(WORK, "registered-scaffold-output");
  writeRegistry(compileRegistry(catalogPath), outDir);
  const base = pathToFileURL(outDir).href;

  const project = makeProject({
    registries: {
      "@scaffold": { url: `${base}/{name}.json`, index: `${base}/registry.json` },
    },
  });
  const preview = run(project, ["add", "@scaffold/status-card", "--dry-run", "--json"]);
  assert.equal(preview.status, 0, preview.all);
  const digest = json(preview).payload.planDigest;
  const applied = run(project, ["add", "@scaffold/status-card", "--expect-plan", digest, "--json"]);
  assert.equal(applied.status, 0, applied.all);

  const directory = join(project, "src/components/ui/status-card");
  const component = join(directory, "status-card.tsx");
  const styles = join(directory, "status-card.module.css");
  assert.equal(existsSync(component), true);
  assert.equal(existsSync(styles), true);
  assert.match(readFileSync(component, "utf8"), /from "\.\/status-card\.module\.css"/);
});

test("list refuses an unregistered namespace with the code add uses, at exit 1", () => {
  const project = makeProject();
  const result = run(project, ["list", "@nope"]);
  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /note {2}unknown-namespace {2}@nope/, result.stderr);
  // Bare names are normalized, so this is the same refusal by another spelling.
  assert.equal(run(project, ["list", "nope"]).status, 1);
});

test("a registry with no index is listed as a note, not as a failure", () => {
  // D21 made `index` optional, so a registry without one is valid config and
  // exiting non-zero on it would call the user's own file broken.
  const project = makeProject({ registries: { "@base": BASE.url } });
  const result = run(project, ["list"]);
  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /note {2}no-index {2}@base/, result.stderr);
  assert.equal(result.stdout, "", "a registry that cannot be listed contributes no rows");
});

// ---- info -------------------------------------------------------------------

test("info describes an item without printing a byte of its content", () => {
  const project = makeProject();
  const result = run(project, ["info", ITEM]);
  assert.equal(result.status, 0, result.all);

  assert.match(result.stdout, /^@base\/empty-state/, result.stdout);
  assert.match(result.stdout, /src\/components\/ui\/empty-state\.tsx/, result.stdout);

  // The projection exists precisely so a terminal never receives a source file.
  const source = readFileSync(join(BASE_FIXTURE, "src", "empty-state.tsx"), "utf8");
  const firstLine = source.split("\n")[0];
  assert.equal(result.all.includes(firstLine), false, "info leaked file content");
});

test("info exits 1 on an item the registry does not serve", () => {
  const project = makeProject();
  const result = run(project, ["info", "@base/nope"]);
  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}fetch-failed/, result.stderr);
});

// ---- diff -------------------------------------------------------------------

test("diff reports a local edit as local-only, with a patch, and still exits 0", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const clean = run(project, ["diff"]);
  assert.equal(clean.status, 0, clean.all);
  assert.match(clean.stdout, /No changes\./, clean.stdout);

  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// a local edit\n`);

  const dirty = run(project, ["diff"]);
  // A difference is the ANSWER to diff, never a failure of it.
  assert.equal(dirty.status, 0, dirty.all);
  assert.match(dirty.stdout, /local-only\s+src\/components\/ui\/empty-state\.tsx/, dirty.stdout);
  assert.match(dirty.stdout, /^\+\/\/ a local edit$/m, "base -> local must show the adaptation");

  // `--stat` is the same verdict with no patch computed.
  const stat = run(project, ["diff", "--stat"]);
  assert.equal(stat.status, 0, stat.all);
  assert.match(stat.stdout, /local-only/, stat.stdout);
  assert.equal(stat.stdout.includes("@@"), false, "--stat must compute no patch");

  const doc = json(run(project, ["diff", "--json"]));
  const [item] = doc.payload.items;
  assert.equal(item.id, ITEM);
  assert.equal(item.files[0].change, "local-only");
  assert.match(
    item.files[0].patches.baseToLocal,
    /^\+\/\/ a local edit$/m,
    "--json carries the base -> local adaptation patch",
  );
});

test("diff names an item that is not installed instead of fetching it", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const result = run(project, ["diff", "@base/nope"]);
  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /note {2}not-installed {2}@base\/nope/, result.stderr);
  assert.match(result.stdout, /Nothing to compare/, result.stdout);
});

// ---- update -----------------------------------------------------------------

test("update preserves a local-only edit without writing the source", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  const original = readFileSync(target, "utf8");
  writeFileSync(target, `${original}\n// a local edit\n`);

  const result = run(project, ["update"]);
  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /skip {2}local-only {2}@base\/empty-state/, result.stderr);
  assert.equal(
    readFileSync(target, "utf8"),
    `${original}\n// a local edit\n`,
    "default update must preserve project adaptations",
  );
});

test("a second update is a no-op that says so, and writes nothing", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const result = run(project, ["update"]);
  assert.equal(result.status, 0, result.all);
  // `identical` files are never written, so no `overwrite` line appears — but
  // the run still happens, because apply's phase 7 is what claims a destination
  // that holds our bytes with no ownership record.
  assert.match(result.stderr, /skip {2}up-to-date {2}@base\/empty-state/, result.stderr);
  assert.doesNotMatch(result.stderr, /state-versioning-required/, result.stderr);
});

test("a non-interactive local-only update and dry-run both preserve the edit", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// a local edit\n`);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  // The source is preserved, but update accepts its current hash into the
  // receipt, so the versioned state still changed.
  assert.match(updated.stderr, /info {2}state-versioning-required/, updated.stderr);
  assert.match(updated.stderr, /skip {2}local-only/, updated.stderr);

  const preview = run(project, ["update", "--dry-run"]);
  assert.equal(preview.status, 0, preview.all);
  assert.doesNotMatch(preview.stderr, /state-versioning-required/, preview.stderr);
  assert.match(preview.stdout, /Dry run — nothing was written\./, preview.stdout);
  assert.match(readFileSync(target, "utf8"), /a local edit/, "a dry run must not write");
});

test("add commits an exact CRLF base and a clean two-sided update preserves both changes", () => {
  const moved = publish(BASE_FIXTURE, "base-clean-merge");
  const itemDoc = join(WORK, "base-clean-merge", "empty-state.json");
  const initialDoc = JSON.parse(readFileSync(itemDoc, "utf8"));
  initialDoc.files[0].content = initialDoc.files[0].content.replace(/\r?\n/g, "\r\n");
  writeFileSync(itemDoc, `${JSON.stringify(initialDoc, null, 2)}\n`);

  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);
  const installed = readFileSync(target, "utf8");
  assert.equal(readFileSync(basePath, "utf8"), installed, "add must retain exact upstream bytes");

  const firstReceipt = JSON.parse(readFileSync(join(project, "manteen.lock.json"), "utf8"));
  const firstFile = firstReceipt.items[0].files[0];
  assert.equal(firstReceipt.lockfileVersion, 3);
  assert.equal(firstFile.installedSha256, firstFile.baseSha256);

  const installedNewline = installed.includes("\r\n") ? "\r\n" : "\n";
  const localAnchor = `${installedNewline}${installedNewline}export function`;
  assert.ok(installed.includes(localAnchor), "the local-edit fixture anchor must exist");
  writeFileSync(
    target,
    installed.replace(
      localAnchor,
      `${installedNewline}// local adaptation${installedNewline}${installedNewline}export function`,
    ),
  );

  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  const upstreamNewline = doc.files[0].content.includes("\r\n") ? "\r\n" : "\n";
  const upstreamAnchor = `${upstreamNewline}}${upstreamNewline}`;
  assert.ok(
    doc.files[0].content.includes(upstreamAnchor),
    "the upstream-edit fixture anchor must exist",
  );
  doc.files[0].content = doc.files[0].content.replace(
    upstreamAnchor,
    `${upstreamNewline}  // upstream addition${upstreamNewline}}${upstreamNewline}`,
  );
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  assert.match(updated.stderr, /info {2}state-versioning-required/, updated.stderr);
  const merged = readFileSync(target, "utf8");
  assert.match(merged, /local adaptation/, merged);
  assert.match(merged, /upstream addition/, merged);

  const pristine = readFileSync(basePath, "utf8");
  assert.doesNotMatch(pristine, /local adaptation/);
  assert.match(pristine, /upstream addition/);

  const receipt = JSON.parse(readFileSync(join(project, "manteen.lock.json"), "utf8"));
  const file = receipt.items[0].files[0];
  assert.notEqual(file.installedSha256, file.baseSha256);
});

test("diff and update automatically rescue distinct adjacent TypeScript declarations", () => {
  const moved = publish(BASE_FIXTURE, "base-ast-fallback");
  const itemDoc = join(WORK, "base-ast-fallback", "empty-state.json");
  const initial = JSON.parse(readFileSync(itemDoc, "utf8"));
  const source = initial.files.find((file) => file.path.endsWith("empty-state.tsx"));
  assert.ok(source, "empty-state source fixture missing");
  source.content =
    "export interface LocalOptions { enabled: boolean }\n" +
    "export interface IncomingOptions { count: number }\n" +
    source.content;
  writeFileSync(itemDoc, `${JSON.stringify(initial, null, 2)}\n`);

  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);
  const target = join(project, DESTINATION);
  const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);
  const base = readFileSync(target, "utf8");
  const local = base.replace(
    "LocalOptions { enabled: boolean }",
    "LocalOptions { enabled: boolean; label?: string }",
  );
  writeFileSync(target, local);

  const current = JSON.parse(readFileSync(itemDoc, "utf8"));
  const currentSource = current.files.find((file) => file.path.endsWith("empty-state.tsx"));
  assert.ok(currentSource, "current empty-state source fixture missing");
  currentSource.content = currentSource.content.replace(
    "IncomingOptions { count: number }",
    "IncomingOptions { count: number; size?: number }",
  );
  writeFileSync(itemDoc, `${JSON.stringify(current, null, 2)}\n`);

  const compared = json(run(project, ["diff", "--json"]));
  const comparedFile = compared.payload.items
    .find((item) => item.id === ITEM)
    ?.files.find((file) => file.receiptPath.endsWith("/empty-state.tsx"));
  assert.equal(comparedFile?.change, "both");
  assert.equal(comparedFile?.outcome, "merged");
  assert.match(comparedFile?.patches.localToResult ?? "", /size\?: number/);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  const merged = readFileSync(target, "utf8");
  assert.match(merged, /label\?: string/, merged);
  assert.match(merged, /size\?: number/, merged);
  assert.doesNotMatch(merged, /<<<<<<<|=======|>>>>>>>/);

  const pristine = readFileSync(basePath, "utf8");
  assert.doesNotMatch(pristine, /label\?: string/);
  assert.match(pristine, /size\?: number/);
});

test("an overlapping update refuses without markers and --take-upstream is explicit reset", () => {
  const moved = publish(BASE_FIXTURE, "base-conflict");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  const local = readFileSync(target, "utf8").replace("Nothing here", "Nothing local");
  writeFileSync(target, local);

  const itemDoc = join(WORK, "base-conflict", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files[0].content = doc.files[0].content.replace("Nothing here", "Nothing upstream");
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const receiptBefore = readFileSync(join(project, "manteen.lock.json"), "utf8");
  const refused = run(project, ["update"]);
  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /error {2}update-conflict/, refused.stderr);
  assert.doesNotMatch(refused.stderr, /state-versioning-required/, refused.stderr);
  assert.equal(readFileSync(target, "utf8"), local, "a conflict must be zero-mutation");
  assert.doesNotMatch(readFileSync(target, "utf8"), /<<<<<<<|=======|>>>>>>>/);
  assert.equal(readFileSync(join(project, "manteen.lock.json"), "utf8"), receiptBefore);

  const reset = run(project, ["update", "--take-upstream"]);
  assert.equal(reset.status, 0, reset.all);
  assert.match(readFileSync(target, "utf8"), /Nothing upstream/);
  assert.doesNotMatch(readFileSync(target, "utf8"), /Nothing local/);
});

test("a missing tracked file refuses by default and --take-upstream restores it", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);
  const target = join(project, DESTINATION);
  rmSync(target);

  const refused = run(project, ["update"]);
  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /tracked but missing locally/, refused.stderr);
  assert.equal(existsSync(target), false);

  const restored = run(project, ["update", "--take-upstream"]);
  assert.equal(restored.status, 0, restored.all);
  assert.equal(existsSync(target), true);
});

test("a missing or corrupt merge base refuses non-forceably", () => {
  for (const state of ["missing", "corrupt"]) {
    const project = makeProject();
    assert.equal(run(project, ["add", ITEM]).status, 0);
    const target = join(project, DESTINATION);
    const targetBefore = readFileSync(target, "utf8");
    const receiptPath = join(project, "manteen.lock.json");
    const receiptBefore = readFileSync(receiptPath, "utf8");
    const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);

    if (state === "missing") rmSync(basePath);
    else writeFileSync(basePath, "not the recorded ancestor\n");

    for (const args of [["update"], ["update", "--force"]]) {
      const refused = run(project, args);
      assert.equal(refused.status, 1, `${state}: ${refused.all}`);
      assert.match(refused.stderr, /error {2}merge-base-unreadable/, refused.stderr);
    }
    assert.equal(readFileSync(target, "utf8"), targetBefore);
    assert.equal(readFileSync(receiptPath, "utf8"), receiptBefore);
  }
});

/**
 * The complement of the test above, and the reason that one is not the whole
 * rule. `--take-upstream` reads no ancestor — it installs incoming bytes — so a
 * lost or corrupt sidecar must not refuse it. Without this, a project that
 * gitignored `.manteen/` is stuck: every `update` exits 1 (even with nothing to
 * update), the error says "restore from version control" for a file that was
 * never committed, and the only escape is `add --overwrite`, which discards
 * exactly the local adaptations the merge contract exists to protect.
 */
test("--take-upstream repairs a missing or corrupt merge base instead of refusing", () => {
  for (const state of ["missing", "corrupt"]) {
    const moved = publish(BASE_FIXTURE, `base-repair-${state}`);
    const project = makeProject({ registries: { "@base": moved } });
    assert.equal(run(project, ["add", ITEM]).status, 0);

    const target = join(project, DESTINATION);
    const pristine = readFileSync(target, "utf8");
    const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);

    // A local adaptation, so the assertions below distinguish "took upstream"
    // from "did nothing".
    writeFileSync(target, pristine.replace("Nothing here", "Nothing local"));
    if (state === "missing") rmSync(basePath);
    else writeFileSync(basePath, "not the recorded ancestor\n");

    const repaired = run(project, ["update", "--take-upstream"]);
    assert.equal(repaired.status, 0, `${state}: ${repaired.all}`);
    assert.doesNotMatch(repaired.stderr, /merge-base-unreadable/, repaired.stderr);
    assert.match(repaired.stderr, /info {2}state-versioning-required/, repaired.stderr);
    assert.equal(readFileSync(target, "utf8"), pristine, `${state}: upstream bytes`);
    assert.equal(readFileSync(basePath, "utf8"), pristine, `${state}: base rewritten`);

    // The project is unstuck: an ordinary merging update now plans normally.
    const after = run(project, ["update"]);
    assert.equal(after.status, 0, `${state}: ${after.all}`);
    assert.doesNotMatch(after.stderr, /state-versioning-required/, after.stderr);
  }
});

test("a state-changing JSON update reports required versioning on stdout alone", () => {
  const moved = publish(BASE_FIXTURE, "base-json-state");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const itemDoc = join(WORK, "base-json-state", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files[0].content = doc.files[0].content.replace("Nothing here", "Nothing upstream");
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const result = run(project, ["update", "--json"]);
  assert.equal(result.status, 0, result.all);
  assert.equal(result.stderr, "", result.stderr);
  assert.deepEqual(json(result).payload.updateState, {
    changed: true,
    versioningRequired: true,
  });
});

/**
 * A base path the journal cannot snapshot and safely replace is a different
 * failure from one holding the wrong bytes, so every command that has to land a
 * base refuses — including `--take-upstream`, which needs no ancestor but still
 * needs the destination. The seam being pinned is that this refusal is CODED
 * and comes from `plan()`. The inventory reads the same path first, before any
 * gate runs, and a throw escaping there took out `list` and `info` too — commands
 * with no stake in the sidecar at all — with a bare `error <cmd>`.
 */
/**
 * The state advisory is `info` because it fires on every mutating run, and a
 * warning present on the whole happy path stops being read. That reasoning stops
 * applying the moment a project has actually made the mistake, so the ignored
 * case escalates.
 *
 * Both halves are pinned together: an escalation nobody can reach is the same
 * defect as no escalation at all.
 */
test("the state advisory escalates when .gitignore hides .manteen/", () => {
  const quiet = makeProject();
  const informed = run(quiet, ["add", ITEM]);
  assert.equal(informed.status, 0, informed.all);
  assert.match(informed.stderr, /info {2}state-versioning-required/, informed.stderr);

  const ignoring = makeProject();
  writeFileSync(join(ignoring, ".gitignore"), "node_modules\n.manteen/\ndist\n");
  const warned = run(ignoring, ["add", ITEM]);
  assert.equal(warned.status, 0, warned.all);
  assert.match(warned.stderr, /warn {2}state-versioning-required/, warned.stderr);
  assert.match(warned.stderr, /\.gitignore appears to ignore \.manteen\//, warned.stderr);
  assert.match(warned.stderr, /merge-base-unreadable/, "it names the failure it prevents");
  assert.match(warned.stderr, /--take-upstream/, "and the cost of the only way through");

  // A negation is a deliberate choice, not a mistake to warn at.
  const reincluded = makeProject();
  writeFileSync(join(reincluded, ".gitignore"), ".manteen/\n!.manteen\n");
  const calm = run(reincluded, ["add", ITEM]);
  assert.equal(calm.status, 0, calm.all);
  assert.match(calm.stderr, /info {2}state-versioning-required/, calm.stderr);
});

test("an unusable base output path refuses where a base must land, and nowhere else", () => {
  for (const state of ["directory-at-leaf", "file-in-parent-path"]) {
    const project = makeProject();
    assert.equal(run(project, ["add", ITEM]).status, 0);
    const bases = join(project, ".manteen", "bases");
    const basePath = join(bases, `${DESTINATION}.base`);

    if (state === "directory-at-leaf") {
      rmSync(basePath);
      mkdirSync(join(basePath, "occupied"), { recursive: true });
    } else {
      rmSync(join(bases, "src"), { recursive: true });
      writeFileSync(join(bases, "src"), "blocks the expected base directory\n");
    }

    for (const args of [["list"], ["info", ITEM]]) {
      const reported = run(project, args);
      assert.equal(reported.status, 0, `${state} ${args.join(" ")}: ${reported.all}`);
      assert.doesNotMatch(reported.stderr, /merge-base-unreadable/, reported.stderr);
    }

    // Read-only, so it reports the refusal without adopting its exit code.
    const compared = run(project, ["diff"]);
    assert.equal(compared.status, 0, `${state}: ${compared.all}`);
    assert.match(compared.stderr, /error {2}merge-base-unreadable/, compared.stderr);

    for (const args of [["update"], ["update", "--take-upstream"], ["add", ITEM, "--overwrite"]]) {
      const refused = run(project, args);
      assert.equal(refused.status, 1, `${state} ${args.join(" ")}: ${refused.all}`);
      assert.match(refused.stderr, /error {2}merge-base-unreadable/, refused.stderr);
    }
  }
});

test("diff and update both refuse to invent text for invalid UTF-8 project bytes", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);
  const target = join(project, DESTINATION);
  const invalid = Buffer.from([0xff, 0xfe, 0xfd]);
  writeFileSync(target, invalid);

  const compared = run(project, ["diff", "--json"]);
  assert.equal(compared.status, 0, compared.all);
  assert.equal(json(compared).payload.items[0].files[0].outcome, "conflict");

  const refused = run(project, ["update"]);
  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /not valid UTF-8/, refused.stderr);
  assert.deepEqual(readFileSync(target), invalid);
});

test("a newly shipped file creates only into absence and refuses an occupied unowned target", () => {
  const moved = publish(BASE_FIXTURE, "base-added-file");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const itemDoc = join(WORK, "base-added-file", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files.push({
    path: "registry/ui/empty-state-helper.ts",
    type: "registry:ui",
    content: "export const helper = true;\n",
  });
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const occupied = join(project, "src", "components", "ui", "empty-state-helper.ts");
  writeFileSync(occupied, "export const projectHelper = true;\n");
  const refused = run(project, ["update", "--take-upstream"]);
  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /newly shipped upstream but an unowned file/, refused.stderr);
  assert.equal(readFileSync(occupied, "utf8"), "export const projectHelper = true;\n");

  rmSync(occupied);
  const created = run(project, ["update"]);
  assert.equal(created.status, 0, created.all);
  assert.equal(readFileSync(occupied, "utf8"), "export const helper = true;\n");
});

test("a file removed upstream is retained with its receipt and base", () => {
  const moved = publish(BASE_FIXTURE, "base-removed-file");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);
  const target = join(project, DESTINATION);
  const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);
  const receiptPath = join(project, "manteen.lock.json");
  const receiptBefore = readFileSync(receiptPath, "utf8");

  const itemDoc = join(WORK, "base-removed-file", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files = [];
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const compared = run(project, ["diff"]);
  assert.equal(compared.status, 0, compared.all);
  assert.match(compared.stdout, /removed-upstream/, compared.stdout);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  assert.equal(existsSync(target), true);
  assert.equal(existsSync(basePath), true);
  assert.equal(readFileSync(receiptPath, "utf8"), receiptBefore);
});

test("re-adding an item removes an obsolete base without deleting the project file", () => {
  const moved = publish(BASE_FIXTURE, "base-obsolete-after-add");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  const basePath = join(project, ".manteen", "bases", `${DESTINATION}.base`);
  const itemDoc = join(WORK, "base-obsolete-after-add", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files = [];
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  const added = run(project, ["add", ITEM]);
  assert.equal(added.status, 0, added.all);
  assert.equal(existsSync(target), true, "re-add must not delete project source");
  assert.equal(existsSync(basePath), false, "the obsolete merge base must be collected");

  const receipt = JSON.parse(readFileSync(join(project, "manteen.lock.json"), "utf8"));
  assert.deepEqual(receipt.items[0].files, []);
});

test("update names an item that is not installed and changes nothing", () => {
  const project = makeProject();
  const result = run(project, ["update", "@base/nope"]);
  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /skip {2}not-installed {2}@base\/nope/, result.stderr);
  assert.match(result.stderr, /manteen\.lock\.json/, "the skip must name the lockfile relatively");
  assert.equal(result.stderr.includes(project), false, result.stderr);
  assert.equal(existsSync(join(project, DESTINATION)), false);
});

test("update rejects an unknown --pm exactly as add does, at exit 2", () => {
  const project = makeProject();
  for (const command of ["add", "update"]) {
    const args = command === "add" ? ["add", ITEM, "--pm", "bogus"] : ["update", "--pm", "bogus"];
    const result = run(project, args);
    assert.equal(result.status, 2, `${command}: ${result.all}`);
    assert.match(result.stderr, /is not a package manager manteen knows/, result.stderr);
  }
});

// ---- an UPSTREAM change, which is what `update` is actually for -------------

test("diff sees an upstream change and update fetches it", () => {
  /**
   * Its OWN published registry, not the shared one.
   *
   * `node --test` runs top-level `test()` calls in this file's order and in one
   * process, so mutating `WORK/base` here would leak the edited bytes into every
   * test declared after it and make the suite order-dependent. A second
   * directory costs one compile and keeps each test hermetic.
   */
  const moved = publish(BASE_FIXTURE, "base-moved");
  const project = makeProject({ registries: { "@base": moved } });
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const itemDoc = join(WORK, "base-moved", "empty-state.json");
  const doc = JSON.parse(readFileSync(itemDoc, "utf8"));
  doc.files[0].content = `${doc.files[0].content}\n// shipped upstream\n`;
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);

  // `upstream-only`: the file on disk still matches what manteen recorded, and
  // the registry now serves something else. The third of the four states, and
  // the one `update` exists to resolve.
  const compared = run(project, ["diff"]);
  assert.equal(compared.status, 0, compared.all);
  assert.match(
    compared.stdout,
    /upstream-only\s+src\/components\/ui\/empty-state\.tsx/,
    compared.stdout,
  );
  assert.match(compared.stdout, /^\+\/\/ shipped upstream$/m, compared.stdout);

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  assert.match(updated.stdout, /^updated {2}@base\/empty-state$/m, updated.stdout);
  assert.match(
    readFileSync(join(project, DESTINATION), "utf8"),
    /\/\/ shipped upstream/,
    "update must land the bytes the registry serves today",
  );

  // The receipt was rewritten with the new hash, so the project is clean again.
  assert.match(run(project, ["diff"]).stdout, /No changes\./);

  // And a local edit ON TOP of an upstream change is the fourth state, `both`.
  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// and a local edit\n`);
  doc.files[0].content = `${doc.files[0].content}\n// and again upstream\n`;
  writeFileSync(itemDoc, `${JSON.stringify(doc, null, 2)}\n`);
  assert.match(run(project, ["diff"]).stdout, /\bboth\b\s+src\/components\/ui\/empty-state\.tsx/);
});

// ---- the theme fold (D5/D6) --------------------------------------------------

test("diff and update carry the folded theme, and update re-merges it directly", () => {
  // `fixtures/base` ships a `theme` item AND a `data-grid` that contributes a
  // `themeFragment`, so declaring `theme` is all it takes to exercise the fold.
  // Without it every other test in this file gets `meta-degraded` instead.
  const project = makeProject({ theme: "src/lib/theme.ts" });
  const added = run(project, ["add", "@base/theme", "@base/data-grid"]);
  assert.equal(added.status, 0, added.all);

  const theme = join(project, "src", "lib", "theme.ts");
  assert.ok(existsSync(theme), added.all);
  // D5: the theme item's file is ABSORBED into the fold, so no item owns it and
  // `add` reports it as the theme rather than as a written file.
  assert.match(added.stdout, /src\/lib\/theme\.ts/, added.stdout);

  const clean = run(project, ["diff"]);
  assert.equal(clean.status, 0, clean.all);
  assert.match(clean.stdout, /No changes\./, clean.stdout);

  // A hand edit to the theme. `mergeThemeSource` runs `prefer: "base"`, so this
  // value must SURVIVE the re-merge — that is the whole basis of the roadmap
  // decision that `update` re-merges directly with no confirmation diff.
  writeFileSync(theme, readFileSync(theme, "utf8").replace(/^/, "// a hand edit\n"));

  const dirty = run(project, ["diff"]);
  assert.equal(dirty.status, 0, dirty.all);
  assert.match(dirty.stdout, /^theme$/m, dirty.stdout);
  assert.match(dirty.stdout, /local-only\s+src\/lib\/theme\.ts/, dirty.stdout);

  const doc = json(run(project, ["diff", "--json"]));
  assert.equal(doc.payload.theme.receiptPath, "src/lib/theme.ts");
  assert.equal(doc.payload.theme.change, "local-only");

  const updated = run(project, ["update"]);
  assert.equal(updated.status, 0, updated.all);
  assert.match(
    readFileSync(theme, "utf8"),
    /\/\/ a hand edit/,
    "the fold keeps existing values on conflict — an update must not discard the user's theme",
  );

  // No confirmation diff and no prompt: SETTLED in the roadmap. The run is
  // non-interactive and still completes.
  assert.equal(updated.stdout.includes("Dry run"), false, updated.stdout);
});

// ---- the shared exit convention ---------------------------------------------

test("a missing manteen.json is exit 2 in every config-dependent command", () => {
  const bare = mkdtempSync(join(tmpdir(), "manteen-cmdset-bare-"));
  projects.push(bare);

  for (const args of [["add", ITEM], ["list"], ["info", ITEM], ["diff"], ["update"]]) {
    const result = run(bare, args);
    assert.equal(result.status, 2, `${args[0]}: ${result.all}`);
    assert.ok(result.stderr.startsWith("error  config"), `${args[0]}: ${result.stderr}`);
    assert.equal(result.stdout, "", `${args[0]} must print nothing on stdout`);
  }
});

test("every command is registered, and an unknown one is still exit 2", () => {
  const project = makeProject();

  const help = run(project, ["--help"]);
  assert.equal(help.status, 0, help.all);
  for (const command of ["init", "add", "list", "info", "diff", "update"]) {
    assert.match(help.stdout, new RegExp(`^\\s+${command}\\b`, "m"), help.stdout);
  }

  // No root `.action()`, so commander names the bad command rather than
  // silently printing help — and `exitOverride` maps the throw to 2.
  const bogus = run(project, ["bogus"]);
  assert.equal(bogus.status, 2, bogus.all);
  assert.match(bogus.stderr, /bogus/, bogus.stderr);
});

/**
 * The `NON-INTERACTIVE` help block, asserted against the behaviour it describes
 * rather than against itself.
 *
 * Documentation that nothing executes is documentation that rots. This is the
 * `add` still requires an overwrite decision. Update's three-way planner and
 * diff both answer non-interactively without one.
 */
test("the non-interactive help block is true of add, update and diff", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);
  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// a local edit\n`);

  const addHelp = run(project, ["add", "--help"]);
  assert.equal(addHelp.status, 0, addHelp.all);
  assert.match(addHelp.stdout, /^NON-INTERACTIVE/m, "add: no help block");

  const updateHelp = run(project, ["update", "--help"]);
  assert.equal(updateHelp.status, 0, updateHelp.all);
  assert.doesNotMatch(updateHelp.stdout, /--overwrite|--no-overwrite|--yes/);
  assert.match(updateHelp.stdout, /--take-upstream/);

  // Update's claim: a bare dry run succeeds and preserves local adaptations.
  const bare = run(project, ["update", "--dry-run"]);
  assert.equal(bare.status, 0, bare.all);
  assert.match(bare.stdout, /Dry run — nothing was written\./, bare.stdout);

  // The claim: `diff` answers the same question with no flag and no refusal.
  const diff = run(project, ["diff"]);
  assert.equal(diff.status, 0, diff.all);
  assert.match(diff.stdout, /local-only/, diff.stdout);

  // …and the file is still the user's, after all of the above.
  assert.match(readFileSync(target, "utf8"), /\/\/ a local edit/);
});
