/**
 * W4 — the apply surface, end to end under real `node`.
 *
 * Two tiers, because the seam has two halves and only one of them is reachable
 * through a spawned process:
 *
 *   SPAWNED   the NON-INTERACTIVE matrix against the built `dist/cli.mjs`. This
 *             is where CI users live, it is the only tier that exercises
 *             commander's three-states-out-of-two-flags reading of
 *             `--overwrite` / `--no-overwrite` / `--yes`, and it is the tier
 *             that proves a conflicting run cannot hang.
 *
 *   IN-PROCESS the PROMPT itself, by importing the built `dist/index.mjs` and
 *             calling `apply(plan, options, { prompt })` with a scripted port.
 *             Phase 1's question is an injected port precisely so this tier can
 *             exist: driving clack needs a pseudo-terminal, and a prompt that
 *             can only be tested through a pty does not get tested.
 *
 * REAL PTY coverage now lives in `pty-prompt.node-e2e.mjs`. It drives the
 * shipped `clackOverwritePrompt` through util-linux/BSD `script(1)` and asserts
 * keep, select and Ctrl-C using output quiescence as readiness. This file keeps
 * the injected-port matrix because it can reach phase-ordering failures without
 * making every case depend on terminal rendering.
 *
 * NETWORK DISCIPLINE. The registry is served over `file:`, so `loader-http.ts`
 * is never entered. npm is the live one: D17 drops a dependency only when the
 * installed version satisfies its range AND package.json declares it, so every
 * project below declares `@mantine/core@^9.5.0` in BOTH package.json and
 * node_modules — which is every npm dep the `@base` catalog asks for. Unlike the
 * gates tier, most cases here are real applies that reach phase 2, so
 * `assertNoInstallerRan` is checked rather than reasoned about.
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.node-e2e.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { compileRegistry, writeRegistry } from "manteen-kit";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const API = join(PKG_ROOT, "dist", "index.mjs");
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");

assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);
assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);
assert.ok(existsSync(API), `${API} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

// The BUILT programmatic surface, not `src`. A port that only works when the
// bundler has not seen it is not a port. Dynamic so the two asserts above report
// a missing build instead of ERR_MODULE_NOT_FOUND.
const { apply, loadConfig, plan } = await import(pathToFileURL(API).href);

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

/** `@base/theme`'s only file resolves here, which is what makes D5 reachable. */
const THEME_REL = "src/lib/theme.ts";
const RECEIPT = "manteen.lock.json";

/** The three destinations `@base/data-grid` produces, including its `uses` dep. */
const EMPTY_STATE = "src/components/ui/empty-state.tsx";
const DATA_GRID = "src/components/ui/data-grid.tsx";
const USE_DATA_GRID = "src/hooks/use-data-grid.ts";

const WORK = mkdtempSync(join(tmpdir(), "manteen-apply-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

function publish(catalogPath, outName) {
  const outDir = join(WORK, outName);
  const result = compileRegistry(catalogPath);
  assert.deepEqual(result.failures, [], `the ${outName} catalog does not compile`);
  writeRegistry(result, outDir);
  // `pathToFileURL` on the DIRECTORY, then the template appended as text — URL
  // encoding would turn the literal `{name}` into `%7Bname%7D`.
  return { url: `${pathToFileURL(outDir).href}/{name}.json`, dir: outDir };
}

const BASE = publish(join(BASE_FIXTURE, "manteen.registry.json"), "base");

/**
 * The exact bytes the registry ships for one of an item's files.
 *
 * Read off the COMPILED wire document rather than off the fixture source, so an
 * "identical" fixture stays identical if the compiler ever normalizes anything.
 * A hand-copied approximation would silently become an `overwrite` and the
 * "identical is never offered" assertion would pass for the wrong reason.
 */
function wireContent(itemName, sourcePath) {
  const doc = JSON.parse(readFileSync(join(BASE.dir, `${itemName}.json`), "utf8"));
  const file = doc.files.find((entry) => entry.path === sourcePath);
  assert.ok(file, `${itemName} has no file at ${sourcePath}`);
  return file.content;
}

/**
 * `declareMantine: false` is the ONE case that wants phase 2 to spawn a package
 * manager — the install-failure report. Dropping the declaration leaves
 * `@mantine/core` on the plan (D17 filters a dependency out only when the
 * installed version satisfies the range AND package.json declares it), so npm
 * runs. Every other project keeps it and the suite stays hermetic.
 */
function makeProject({ theme = null, themeText = null, files = {}, declareMantine = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "manteen-apply-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "apply-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        // D15: without one of these, detection returns `undefined` and every run
        // exits 2 on `no-package-manager` instead of measuring its subject.
        packageManager: "npm@10.9.2",
        // Half of D17's filter. The other half is node_modules below; both are
        // required or `@mantine/core` survives onto the plan and phase 2 spawns
        // npm for real.
        ...(declareMantine ? { dependencies: { "@mantine/core": "^9.5.0" } } : {}),
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
      { registries: { "@base": BASE.url }, aliases: ALIASES, ...(theme ? { theme } : {}) },
      null,
      2,
    )}\n`,
  );

  if (themeText !== null) write(dir, theme ?? THEME_REL, themeText);
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);

  return dir;
}

function write(dir, rel, text) {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
const receiptOf = (dir) => JSON.parse(read(dir, RECEIPT));

/** Every destination the receipt currently claims, across all items. */
function ownedPaths(dir) {
  return receiptOf(dir)
    .items.flatMap((item) => item.files.map((file) => file.destination))
    .sort();
}

function run(project, args, env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: "utf8",
    // `CI=true`, not `CI=1`: D14's predicate is an exact string comparison.
    env: childEnv(env),
    // A prompt reached in a non-interactive run would block forever; the timeout
    // turns "it hung" into a failed assertion instead of a dead test run.
    timeout: 60_000,
  });
  assert.notEqual(result.signal, "SIGTERM", `manteen ${args.join(" ")} timed out — it prompted`);
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    get all() {
      return `${this.stdout}${this.stderr}`;
    },
  };
}

/** Every file under `dir` except `node_modules`, keyed by POSIX relative path. */
function manifest(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        out[relative(dir, full).split(sep).join("/")] = createHash("sha256")
          .update(readFileSync(full))
          .digest("hex");
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * No package manager was spawned. A lockfile is the artifact npm leaves behind
 * even when it fails, so its absence is the cheap check that the suite stayed
 * hermetic — and the D17 reasoning that keeps it true is two rules deep.
 */
function assertNoInstallerRan(project) {
  for (const lockfile of ["package-lock.json", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]) {
    assert.equal(existsSync(join(project, lockfile)), false, `${lockfile} must not appear`);
  }
}

const USER_TEXT = "// hand-written by the user, not by manteen\nexport const mine = 1;\n";

const BASE_THEME = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "teal",
  components: {
    Button: Button.extend({ defaultProps: { variant: "outline" } }),
  },
});
`;

// =============================================================================
// TIER 1 — the non-interactive matrix, through the built binary
// =============================================================================

test("non-interactive + conflict + neither flag refuses, naming both flags", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const before = manifest(project);

  const result = run(project, ["add", "@base/empty-state"]);

  assert.equal(result.status, 1, result.all);
  // The code is the stable handle; the prose is free to be reworded, but the two
  // flag spellings are the only actionable content a CI user gets and are
  // asserted literally.
  assert.match(result.stderr, /destination-exists/, result.all);
  assert.match(result.stderr, /--overwrite/, result.all);
  assert.match(result.stderr, /--no-overwrite/, result.all);

  // Zero mutation as WHOLE-TREE equality. Per-file existence checks would miss a
  // receipt written for a run that refused.
  assert.deepEqual(manifest(project), before, "a refusal must not touch the tree");
  assertNoInstallerRan(project);
});

test("--force does not answer the overwrite question — it is a different axis", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const before = manifest(project);

  // `destination-exists` is `forceable: false` (plan/diagnostics.ts). --force
  // downgrades forceable ERRORS to warnings; it is not a consent to overwrite,
  // and the two flags never imply each other. If this ever exits 0, --force has
  // quietly become a destructive flag.
  const result = run(project, ["add", "@base/empty-state", "--force"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /destination-exists/, result.all);
  assert.deepEqual(manifest(project), before, "--force must not have written anything");
});

test("--no-overwrite keeps the file, exits 0, and claims no ownership of it", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  const result = run(project, ["add", "@base/empty-state", "--no-overwrite"]);

  assert.equal(result.status, 0, result.all);
  assert.match(result.stdout, /skipped\s+src\/components\/ui\/empty-state\.tsx/, result.all);
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "the user's file survived byte for byte");

  // The receipt is still written — it records the run — but a declined
  // destination must NOT appear in it. Recording it would authorize a LATER run
  // to replace the user's file silently on an ownership match, which is the
  // exact failure the receipt exists to prevent.
  assert.deepEqual(ownedPaths(project), [], "a skipped destination is not owned");
  assertNoInstallerRan(project);
});

test("--overwrite replaces the file and records ownership", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  const result = run(project, ["add", "@base/empty-state", "--overwrite"]);

  assert.equal(result.status, 0, result.all);
  assert.match(result.stdout, /written\s+src\/components\/ui\/empty-state\.tsx/, result.all);
  assert.equal(read(project, EMPTY_STATE), wireContent("empty-state", "src/empty-state.tsx"));
  assert.deepEqual(ownedPaths(project), [EMPTY_STATE]);
  assertNoInstallerRan(project);
});

test("--yes implies --overwrite", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  // D14. Without the implication `--yes` makes the run non-interactive with no
  // overwrite answer — precisely the state the refusal table exits 1 on, so
  // `--yes` would mean "refuse", the opposite of what it says.
  const result = run(project, ["add", "@base/empty-state", "--yes"]);

  assert.equal(result.status, 0, result.all);
  assert.equal(read(project, EMPTY_STATE), wireContent("empty-state", "src/empty-state.tsx"));
});

test("an explicit --no-overwrite beats --yes", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  const result = run(project, ["add", "@base/empty-state", "--yes", "--no-overwrite"]);

  assert.equal(result.status, 0, result.all);
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "the typed flag wins over the implication");
});

test("CI=1 does not hang — the composite predicate, not just the CI term", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  // D14's trap: clack's `isCI` is `process.env.CI === "true"` EXACTLY, so `CI=1`
  // reads as NOT ci. What saves this case is the OTHER term — stdin is a pipe
  // under spawnSync, so `isTTY` is false and the run is non-interactive anyway.
  //
  // Be precise about what this proves and what it does not: it pins the
  // composite against a regression that re-derives interactivity from `CI`
  // alone. It cannot exercise TTY-present + `CI=1`, which is the arm that would
  // actually hang, because a spawned child has no controlling terminal here. The
  // `run` helper's timeout is the assertion; a hang fails instead of stalling.
  const result = run(project, ["add", "@base/empty-state"], { CI: "1" });

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /destination-exists/, result.all);
});

test("--dry-run with a conflict and neither flag still refuses, and writes nothing", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const before = manifest(project);

  // The refusal is plan-stage, so `--dry-run` never even reaches apply. A
  // preview that exited 0 here would tell a CI user the real run will succeed.
  const result = run(project, ["add", "@base/empty-state", "--dry-run"]);

  assert.equal(result.status, 1, result.all);
  assert.deepEqual(manifest(project), before);
});

test("--dry-run --overwrite previews the disposition and writes nothing", () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const before = manifest(project);

  const result = run(project, ["add", "@base/empty-state", "--dry-run", "--overwrite"]);

  assert.equal(result.status, 0, result.all);
  // `overwrite`, the plan's Disposition — not `written`, apply's WriteResult.
  // The dry-run reporter reads the plan on purpose; printing a WriteResult here
  // would read as a real install.
  assert.match(result.stdout, /overwrite\s+src\/components\/ui\/empty-state\.tsx/, result.all);
  assert.match(result.stdout, /Dry run — nothing was written\./, result.all);
  assert.deepEqual(manifest(project), before);
  assertNoInstallerRan(project);
});

test("--no-overwrite answers every conflict in a multi-file block at once", () => {
  const project = makeProject({
    files: { [EMPTY_STATE]: USER_TEXT, [DATA_GRID]: USER_TEXT, [USE_DATA_GRID]: USER_TEXT },
  });

  const result = run(project, ["add", "@base/data-grid", "--no-overwrite"]);

  assert.equal(result.status, 0, result.all);
  for (const rel of [EMPTY_STATE, DATA_GRID, USE_DATA_GRID]) {
    assert.match(
      result.stdout,
      new RegExp(`skipped\\s+${rel.replace(/[/.]/g, "\\$&")}`),
      result.all,
    );
    assert.equal(read(project, rel), USER_TEXT, `${rel} survived`);
  }
  assert.deepEqual(ownedPaths(project), []);
});

// -----------------------------------------------------------------------------
// The write report is an OBSERVATION, not a plan
// -----------------------------------------------------------------------------
// `renderOutcome` prints `ApplyOutcome.files`, documented as "what apply()
// OBSERVED". Phase 1's decisions used to ride out onto every failure return, so
// a run that wrote nothing printed three `written` lines on stdout while its own
// stderr said the tree had been restored — and `manteen add … > report.txt`
// captured only the half that lied. These two cases pin the two ways a real run
// can fail after phase 1 has decided.

/**
 * 0o555 does not stop root, and Windows ignores the mode bits entirely — in
 * either case the write SUCCEEDS and the case would assert against a passing
 * run. Skipped rather than adapted: there is no second way to make one
 * destination unwritable that does not also break the rest of the plan.
 */
const CAN_DENY_WRITES = process.platform !== "win32" && process.getuid?.() !== 0;

test("a rolled-back run reports nothing as written", { skip: !CAN_DENY_WRITES }, () => {
  const project = makeProject();
  // `@base/data-grid` writes three files across two directories; making the
  // second unwritable fails phase 3 mid-list, so the journal has real entries to
  // unwind rather than none.
  mkdirSync(join(project, "src", "hooks"), { recursive: true });
  chmodSync(join(project, "src", "hooks"), 0o555);

  const before = manifest(project);
  let result;
  try {
    result = run(project, ["add", "@base/data-grid", "--overwrite"]);
  } finally {
    // Before any assertion — a throw here would leave a directory `after()`
    // cannot remove.
    chmodSync(join(project, "src", "hooks"), 0o755);
  }

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /write-failed/, result.all);
  assert.doesNotMatch(result.stderr, /state-versioning-required/, result.all);
  // THE ASSERTION. Not "the right verb" — no file verb at all, because the
  // journal put every pre-image back and `WriteResult` has no value meaning
  // "attempted, then unwound". `skipped` was the rejected alternative: it is
  // defined as the user declining, so it would trade a false `written` for a
  // false "you said no".
  assert.doesNotMatch(result.stdout, /written/, result.all);
  assert.doesNotMatch(result.stdout, /skipped/, result.all);

  // The report and the disk agree, which is the property that was broken.
  assert.deepEqual(manifest(project), before, "the unwind restored the whole tree");
});

test("a failed ROLLBACK reports nothing as written either", { skip: !CAN_DENY_WRITES }, () => {
  const project = makeProject();
  assert.equal(run(project, ["add", "@base/empty-state", "--overwrite"]).status, 0);
  write(project, EMPTY_STATE, USER_TEXT);

  // Denying writes to the directory holding the ONLY destination fails the write
  // and then fails the unwind, which is the `rollback-failed` arm.
  chmodSync(join(project, "src", "components", "ui"), 0o555);
  let result;
  try {
    result = run(project, ["add", "@base/empty-state", "--overwrite"]);
  } finally {
    chmodSync(join(project, "src", "components", "ui"), 0o755);
  }

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /rollback-failed/, result.all);
  assert.doesNotMatch(result.stderr, /state-versioning-required/, result.all);

  // The trap this case exists for. `journal.write` records its entry BEFORE
  // attempting the write, so a write that failed outright is still journalled
  // and still lands in `unrestored` — reporting the unrestored set as `written`
  // therefore claims a write that provably did not happen. It did not: the
  // user's file is here, byte for byte.
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "the file was never replaced");
  assert.doesNotMatch(result.stdout, /written/, result.all);

  // What the run DOES owe the user: which path is now indeterminate, and the
  // remedy. That sentence has no `WriteResult` — only the failure channel.
  assert.match(result.stderr, /git checkout --/, result.all);
  assert.match(result.stderr, /empty-state\.tsx/, result.all);
});

test("a failed install reports nothing as written", () => {
  const project = makeProject({ declareMantine: false, files: { [EMPTY_STATE]: USER_TEXT } });
  const before = manifest(project);

  // Hermetic despite spawning npm: port 9 (discard) refuses immediately on
  // loopback, and zero retries keeps the failure fast. The point is the shape of
  // the report on a phase-2 failure, not npm's error text.
  const result = run(project, ["add", "@base/empty-state", "--overwrite"], {
    npm_config_registry: "http://127.0.0.1:9/",
    npm_config_fetch_retries: "0",
    npm_config_audit: "false",
    npm_config_fund: "false",
  });

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /install-failed/, result.all);
  assert.doesNotMatch(result.stderr, /state-versioning-required/, result.all);
  // Phase 2 sits above the journal, so not one destination was touched — which
  // is exactly what this failure's own message promises the user.
  assert.doesNotMatch(result.stdout, /written/, result.all);
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "the file the run would have replaced");

  // npm may leave a lockfile behind even on a failure, so compare the source
  // tree rather than the whole manifest.
  for (const rel of [EMPTY_STATE, DATA_GRID, USE_DATA_GRID, RECEIPT]) {
    assert.equal(manifest(project)[rel], before[rel], `${rel} unchanged`);
  }
});

test("a directory at a planned destination refuses with a code and a path", () => {
  const project = makeProject();
  mkdirSync(join(project, EMPTY_STATE), { recursive: true });
  const before = manifest(project);

  // It used to reach `hashFileBytes`, throw a raw EISDIR, and print under a bare
  // `error  plan` head — no DiagnosticCode to grep for and no hint as to WHICH
  // destination was the directory. Every other plan-stage refusal carries both.
  const result = run(project, ["add", "@base/empty-state", "--overwrite"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /destination-exists/, result.all);
  assert.match(result.stderr, /empty-state\.tsx/, result.all);
  assert.match(result.stderr, /is a directory/, result.all);
  // The advice `checkDestinations` gives is false here: neither flag can replace
  // a directory, and the message must not offer them as if they could.
  assert.doesNotMatch(result.stderr, /Pass --overwrite to replace it/, result.all);
  assert.deepEqual(manifest(project), before);
});

test("a directory at a planned destination refuses under --force too", () => {
  const project = makeProject();
  mkdirSync(join(project, EMPTY_STATE), { recursive: true });

  // `destination-exists` is `forceable: false`, so the refusal holds on every
  // axis: --overwrite above, --force here.
  const result = run(project, ["add", "@base/empty-state", "--force"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /destination-exists/, result.all);
});

// =============================================================================
// TIER 2 — the prompt, through the injected port
// =============================================================================

/**
 * A scripted `OverwritePrompt` plus the requests it received.
 *
 * `answer` is either an `OverwriteAnswer` or a function of the request, so a
 * case can select by label without hardcoding a tmpdir path.
 */
function scriptPrompt(answer) {
  const calls = [];
  return {
    calls,
    prompt: async (request) => {
      calls.push(request);
      return typeof answer === "function" ? answer(request) : answer;
    },
  };
}

/** plan() the way an interactive session would: conflicts are a question, not a refusal. */
async function planFor(project, refs, options = {}) {
  const loaded = loadConfig(project);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors ?? null, null, 2));
  const planned = await plan(loaded.config, refs, { interactive: true, ...options });
  // With `interactive: true` the destination-exists diagnostic is downgraded to
  // info, so the plan stays ok and phase 1 is reachable. If this ever fails, the
  // gate has stopped distinguishing "ask" from "refuse" and every case below is
  // measuring a plan that never reached apply.
  assert.equal(planned.ok, true, JSON.stringify(planned.diagnostics, null, 2));
  return planned;
}

const labelsOf = (request) => request.candidates.map((candidate) => candidate.label).sort();

test("one grouped prompt for a three-file conflict, not three prompts", async () => {
  const project = makeProject({
    files: { [EMPTY_STATE]: USER_TEXT, [DATA_GRID]: USER_TEXT, [USE_DATA_GRID]: USER_TEXT },
  });
  const planned = await planFor(project, ["@base/data-grid"]);
  const script = scriptPrompt({ cancelled: false, overwrite: [] });

  await apply(planned, { interactive: true }, { prompt: script.prompt });

  assert.equal(script.calls.length, 1, "the whole conflict set is one question");
  assert.deepEqual(labelsOf(script.calls[0]), [DATA_GRID, EMPTY_STATE, USE_DATA_GRID].sort());
  // Root-relative POSIX, so the prompt is readable and platform-stable. An
  // absolute tmpdir here would be unreadable in a terminal and unassertable
  // across machines.
  for (const candidate of script.calls[0].candidates) {
    assert.ok(!candidate.label.includes(project), "labels are relative, not absolute");
    assert.ok(candidate.destination.startsWith(project), "destinations are absolute");
  }
});

test("cancelling exits with zero mutation — no deps, no files, no receipt", async () => {
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });
  // A conflict AND a theme merge AND two files that would be created. If cancel
  // leaked past phase 1, at least one of the three would land.
  write(project, EMPTY_STATE, USER_TEXT);

  const planned = await planFor(project, ["@base/data-grid"]);
  const before = manifest(project);
  const script = scriptPrompt({ cancelled: true });

  const outcome = await apply(planned, { interactive: true }, { prompt: script.prompt });

  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.ok, false, "a cancelled run did not apply");
  assert.equal(outcome.dependencies.installed, false);
  assert.equal(outcome.dependencies.command, null, "phase 2 is below the cancel return");
  assert.equal(outcome.theme.written, false);
  assert.equal(outcome.receipt.written, false);
  assert.equal(outcome.updateState.changed, false);
  assert.deepEqual(outcome.files, [], "no decisions ride out of a cancelled phase 1");

  assert.deepEqual(manifest(project), before, "cancel is zero-mutation, whole-tree");
  assert.equal(existsSync(join(project, RECEIPT)), false, "no receipt");
  assertNoInstallerRan(project);
});

test("selecting nothing is a complete answer, not a cancellation", async () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const planned = await planFor(project, ["@base/data-grid"]);
  const script = scriptPrompt({ cancelled: false, overwrite: [] });

  const outcome = await apply(planned, { interactive: true }, { prompt: script.prompt });

  // The distinction the port's union exists for: exit 0 with the file kept, NOT
  // exit 130. Collapsing "I decline all of them" onto "I walked away" would
  // throw away the two files the user did ask for.
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.updateState.changed, true);
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "declined file untouched");
  assert.ok(existsSync(join(project, DATA_GRID)), "the non-conflicting files still landed");
  assert.ok(existsSync(join(project, USE_DATA_GRID)));
  assert.deepEqual(ownedPaths(project), [DATA_GRID, USE_DATA_GRID].sort());
  assertNoInstallerRan(project);
});

test("selecting a subset writes exactly that subset", async () => {
  const project = makeProject({
    files: { [EMPTY_STATE]: USER_TEXT, [DATA_GRID]: USER_TEXT, [USE_DATA_GRID]: USER_TEXT },
  });
  const planned = await planFor(project, ["@base/data-grid"]);
  const script = scriptPrompt((request) =>
    Promise.resolve({
      cancelled: false,
      overwrite: request.candidates
        .filter((candidate) => candidate.label !== EMPTY_STATE)
        .map((candidate) => candidate.destination),
    }),
  );

  const outcome = await apply(planned, { interactive: true }, { prompt: script.prompt });

  assert.equal(outcome.ok, true);
  assert.equal(read(project, EMPTY_STATE), USER_TEXT, "the unselected one is kept");
  assert.equal(read(project, DATA_GRID), wireContent("data-grid", "src/data-grid.tsx"));
  assert.equal(read(project, USE_DATA_GRID), wireContent("data-grid", "src/use-data-grid.ts"));

  const byDestination = new Map(outcome.files.map((file) => [file.destination, file.result]));
  assert.equal(byDestination.get(join(project, EMPTY_STATE)), "skipped");
  assert.equal(byDestination.get(join(project, DATA_GRID)), "written");
  // Ownership follows the write, not the plan: the declined destination must not
  // be claimed even though it was planned.
  assert.deepEqual(ownedPaths(project), [DATA_GRID, USE_DATA_GRID].sort());
});

test("an identical destination is never offered — there is nothing to decide", async () => {
  const project = makeProject({
    files: {
      // Byte-for-byte what the registry ships, so its disposition is `identical`.
      [EMPTY_STATE]: wireContent("empty-state", "src/empty-state.tsx"),
      [DATA_GRID]: USER_TEXT,
    },
  });
  const planned = await planFor(project, ["@base/data-grid"]);
  const script = scriptPrompt({ cancelled: false, overwrite: [] });

  const outcome = await apply(planned, { interactive: true }, { prompt: script.prompt });

  assert.deepEqual(labelsOf(script.calls[0]), [DATA_GRID], "only the real conflict is asked about");

  const byDestination = new Map(outcome.files.map((file) => [file.destination, file.result]));
  assert.equal(byDestination.get(join(project, EMPTY_STATE)), "identical");
  // `identical` still transfers ownership — an all-identical project is the one
  // that most needs its ownership recorded.
  assert.ok(ownedPaths(project).includes(EMPTY_STATE));
});

test("a changed theme is not on the list, and is written anyway", async () => {
  const project = makeProject({
    theme: THEME_REL,
    themeText: BASE_THEME,
    files: { [EMPTY_STATE]: USER_TEXT },
  });
  const planned = await planFor(project, ["@base/data-grid"]);
  assert.equal(planned.theme.changed, true, "the fixture must produce a real theme merge");

  const script = scriptPrompt({ cancelled: false, overwrite: [] });
  const outcome = await apply(planned, { interactive: true }, { prompt: script.prompt });

  // The theme is FOLDED, not overwritten: `prefer: "base"` keeps the user's
  // values, so there is no destruction to consent to and no `skipped` channel on
  // `ApplyOutcome.theme` to report a decline through. Phase 4 owns it.
  assert.deepEqual(labelsOf(script.calls[0]), [EMPTY_STATE], "the theme is not a checkbox");
  assert.equal(outcome.theme.written, true);

  const themeText = read(project, THEME_REL);
  assert.match(themeText, /primaryColor: "teal"/, "the user's base survived the merge");
  assert.match(themeText, /Table: Table\.extend/, "the fragment landed");
});

test("the prompt's attribution says which of the four true things happened", async () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });

  // 1. Never installed by manteen — no receipt, no owner.
  const first = await planFor(project, ["@base/empty-state"]);
  const unowned = scriptPrompt({ cancelled: false, overwrite: [] });
  await apply(first, { interactive: true }, { prompt: unowned.prompt });
  assert.equal(unowned.calls[0].candidates[0].hint, "not installed by manteen");

  // Install it for real, then edit it behind manteen's back.
  assert.equal(run(project, ["add", "@base/empty-state", "--overwrite"]).status, 0);
  write(project, EMPTY_STATE, `${wireContent("empty-state", "src/empty-state.tsx")}// edited\n`);

  // 2. Same item, hash no longer matches what the receipt records.
  const second = await planFor(project, ["@base/empty-state"]);
  const drifted = scriptPrompt({ cancelled: false, overwrite: [] });
  await apply(second, { interactive: true }, { prompt: drifted.prompt });
  assert.equal(
    drifted.calls[0].candidates[0].hint,
    "installed by @base/empty-state from @base, edited since",
  );
});

/**
 * INVERTED, not deleted — the earlier version of this case asserted
 * `calls.length === 1` and is the decision this one replaces.
 *
 * A dry run reached the prompt, then discarded the answer: `renderDryRun` reads
 * `plan.files[].disposition`, so both answers printed byte-identical stdout and
 * left byte-identical trees. What the question cost was termination — under a
 * pty with nobody at the keyboard the preview sat on a rendered multiselect
 * forever, having asked for consent to a replacement that cannot happen.
 *
 * This guard can only live in this tier. Tier 1's `run()` spawns a child with no
 * controlling terminal, so `isTTY` is false and the plan-stage refusal carries
 * every dry-run case there regardless of what phase 1 does.
 */
test("--dry-run does NOT ask — a preview that blocks is not a preview", async () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const planned = await planFor(project, ["@base/empty-state"]);
  const before = manifest(project);
  const script = scriptPrompt({ cancelled: true });

  const outcome = await apply(
    planned,
    { interactive: true, dryRun: true },
    { prompt: script.prompt },
  );

  assert.equal(script.calls.length, 0, "a dry run must not reach the prompt");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.dryRun, true);
  // Not `cancelled`, even though the scripted port would have cancelled if it
  // had been called — proof the port was never consulted rather than consulted
  // and ignored.
  assert.equal(outcome.cancelled, false);
  // `skipped`, the conservative forecast: nothing is replaced until someone
  // answers, and a dry run never asks. Under `dryRun` this field is a forecast
  // either way — a `create` destination reports `written` here and nothing is
  // written.
  assert.deepEqual(outcome.files, [{ destination: join(project, EMPTY_STATE), result: "skipped" }]);

  assert.deepEqual(manifest(project), before, "a dry run mutates nothing");
  assert.equal(outcome.dependencies.command, null);
  assert.equal(outcome.updateState.changed, false);
  assertNoInstallerRan(project);
});

test("--dry-run needs no prompt port at all", async () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const planned = await planFor(project, ["@base/empty-state"]);
  const before = manifest(project);

  // The read-only phases must not require a terminal OR a port. A programmatic
  // caller previewing a conflicting install gets an answer, not a throw — and
  // the `no prompt port was provided` refusal below stays for the real run,
  // where guessing would destroy or drop a file.
  const outcome = await apply(planned, { interactive: true, dryRun: true }, { prompt: undefined });

  assert.equal(outcome.ok, true);
  assert.deepEqual(manifest(project), before);
});

test("an interactive conflict with no prompt port refuses instead of guessing", async () => {
  const project = makeProject({ files: { [EMPTY_STATE]: USER_TEXT } });
  const planned = await planFor(project, ["@base/empty-state"]);
  const before = manifest(project);

  // Unreachable through the CLI — `apply()` defaults the port. It is asserted
  // because the failure mode of the alternative is silent: a phase 1 that fell
  // through to "written" would destroy the file, and one that fell through to
  // "skipped" would silently drop a file the user asked for.
  await assert.rejects(
    () => apply(planned, { interactive: true }, { prompt: undefined }),
    /no prompt port was provided/,
  );
  assert.deepEqual(manifest(project), before);
});
