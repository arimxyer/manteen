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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { compileRegistry, writeRegistry } from "manteen-kit";

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
function makeProject({ registries = { "@base": BASE }, aliases = ALIASES, theme } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "manteen-cmdset-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "cmdset-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
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
    `${JSON.stringify({ registries, aliases, ...(theme === undefined ? {} : { theme }) }, null, 2)}\n`,
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
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    get all() {
      return `${this.stdout}${this.stderr}`;
    },
  };
}

/** stdout, parsed. Asserts the `--json` contract in the act of using it: the
 *  document is on STDOUT ALONE and is the whole of it. */
function json(result) {
  assert.equal(result.status === 2, false, `config failure, not a document: ${result.all}`);
  return JSON.parse(result.stdout);
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

test("every --json document carries the same three envelope keys on stdout alone", () => {
  const project = makeProject();
  run(project, ["add", ITEM]);

  for (const [command, args] of [
    ["list", ["list", "--json"]],
    ["info", ["info", ITEM, "--json"]],
    ["diff", ["diff", "--json"]],
    ["update", ["update", "--json", "--overwrite"]],
  ]) {
    const result = run(project, args);
    const doc = json(result);

    assert.equal(doc.command, command, `${command}: wrong discriminator`);
    assert.equal(typeof doc.root, "string", `${command}: no root`);
    assert.equal(doc.root, project, `${command}: root must be the absolute project root`);
    assert.equal(typeof doc.ok, "boolean", `${command}: no ok`);
    assert.equal(doc.ok, result.status === 0, `${command}: ok must equal exit === 0`);

    // Notes travel INSIDE the document, never on the other stream — otherwise a
    // consumer parsing stdout silently sees a partial answer.
    assert.ok(Array.isArray(doc.notes), `${command}: notes must always be present`);
    assert.equal(result.stderr, "", `${command}: --json must leave stderr empty`);
  }
});

// ---- list -------------------------------------------------------------------

test("list marks an installed item, and its JSON says so with a root-relative path", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const text = run(project, ["list"]);
  assert.equal(text.status, 0, text.all);
  assert.match(text.stdout, /installed\s+empty-state/, text.stdout);

  const doc = json(run(project, ["list", "--json"]));
  const [registry] = doc.registries;
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
  assert.match(dirty.stdout, /^-\/\/ a local edit$/m, "the patch must show the edit reverted");

  // `--stat` is the same verdict with no patch computed.
  const stat = run(project, ["diff", "--stat"]);
  assert.equal(stat.status, 0, stat.all);
  assert.match(stat.stdout, /local-only/, stat.stdout);
  assert.equal(stat.stdout.includes("@@"), false, "--stat must compute no patch");

  const doc = json(run(project, ["diff", "--json"]));
  const [item] = doc.items;
  assert.equal(item.id, ITEM);
  assert.equal(item.files[0].change, "local-only");
  assert.match(
    item.files[0].patch,
    /^-\/\/ a local edit$/m,
    "--json without --stat still carries the patch text",
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

test("update restores a locally edited file, and reports what moved", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  const original = readFileSync(target, "utf8");
  writeFileSync(target, `${original}\n// a local edit\n`);

  const result = run(project, ["update", "--overwrite"]);
  assert.equal(result.status, 0, result.all);
  // `written`, not `overwrite`: `renderOutcome` prints the `WriteResult` apply
  // OBSERVED, while `renderDryRun` prints the `Disposition` plan PREDICTED. The
  // two vocabularies are deliberate and `add` has the same split.
  assert.match(result.stdout, /written\s+src\/components\/ui\/empty-state\.tsx/, result.stdout);
  assert.match(result.stdout, /^updated {2}@base\/empty-state$/m, result.stdout);
  assert.equal(readFileSync(target, "utf8"), original, "update must restore the recorded bytes");

  assert.match(run(project, ["diff"]).stdout, /No changes\./);
});

test("a second update is a no-op that says so, and writes nothing", () => {
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const result = run(project, ["update", "--overwrite"]);
  assert.equal(result.status, 0, result.all);
  // `identical` files are never written, so no `overwrite` line appears — but
  // the run still happens, because apply's phase 5 is what claims a destination
  // that holds our bytes with no ownership record.
  assert.match(result.stderr, /skip {2}up-to-date {2}@base\/empty-state/, result.stderr);
});

test("a NON-INTERACTIVE update with a changed file refuses, and --dry-run does not exempt it", () => {
  // §1's refusal table working as specified, not a defect: every file an update
  // would change is a `destination-exists` error, `plan()` never sees `dryRun`,
  // and the help text says both. This is the assertion that keeps the help text
  // honest.
  const project = makeProject();
  assert.equal(run(project, ["add", ITEM]).status, 0);

  const target = join(project, DESTINATION);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// a local edit\n`);

  const refused = run(project, ["update"]);
  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /error {2}destination-exists/, refused.stderr);

  const preview = run(project, ["update", "--dry-run"]);
  assert.equal(preview.status, 1, preview.all);

  // With `--overwrite`, the same preview works and writes nothing.
  const dry = run(project, ["update", "--dry-run", "--overwrite"]);
  assert.equal(dry.status, 0, dry.all);
  assert.match(dry.stdout, /Dry run — nothing was written\./, dry.stdout);
  assert.match(readFileSync(target, "utf8"), /a local edit/, "a dry run must not write");
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

// ---- the shared exit convention ---------------------------------------------

test("a missing manteen.json is exit 2 with one config error, in all five commands", () => {
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
  for (const command of ["add", "list", "info", "diff", "update"]) {
    assert.match(help.stdout, new RegExp(`^\\s+${command}\\b`, "m"), help.stdout);
  }

  // No root `.action()`, so commander names the bad command rather than
  // silently printing help — and `exitOverride` maps the throw to 2.
  const bogus = run(project, ["bogus"]);
  assert.equal(bogus.status, 2, bogus.all);
  assert.match(bogus.stderr, /bogus/, bogus.stderr);
});
