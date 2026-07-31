/**
 * Phase 3 — the gates, end to end, under real `node` against the BUILT CLI.
 *
 * This tier exists because of a gap nothing else can close. `bun test` proves a
 * gate module computes the right diagnostics from hand-built inputs, and
 * `scripts/guard-diagnostics.mjs` proves every `DiagnosticCode` has a
 * construction site somewhere in `src` — but the guard is a regex scan of the
 * source corpus, so it goes green the moment a gate module exists on disk,
 * whether or not `plan()` ever calls it. A gate that is written, exported,
 * typechecked and never invoked passes both. Only spawning the real binary
 * against a real project proves the wire.
 *
 * So every assertion here is about WIRING, not about a gate's internal logic:
 *
 *   theme fold (D5, D6, D7)  — the fragment merged, the base survived, the
 *                              absorbed file did not overwrite, an unmergeable
 *                              base refused with nothing on disk, a re-run is
 *                              byte-identical
 *   styles-api               — the selector line reaches the user's terminal
 *   provider-missing (D13)   — warns AND exits 0; a mounted provider silences it
 *   mantine-version (D11)    — refuses on a real mismatch, and `--force` clears it
 *
 * NETWORK DISCIPLINE. Two independent things could reach out: the registry
 * (served over `file:`, so `loader-http.ts` is never entered) and npm. The
 * second is the live one. D17 drops a dependency only when the installed version
 * satisfies its range AND package.json declares it, so the moment a project's
 * `node_modules/@mantine/core` does NOT satisfy `^9` — which is exactly what the
 * version-gate cases construct — `@mantine/core` survives the filter and phase 2
 * would spawn a package manager. Those cases therefore run under `--dry-run`,
 * which D19 stops above phase 2. `assertNoInstallerRan` checks the outcome
 * rather than trusting the reasoning.
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
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");

// Under bun every runtime API `scripts/guard-runtime-apis.mjs` bans resolves
// happily, so running this tier under the wrong runtime makes it pass while the
// published CLI stays broken.
assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);

assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

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

/**
 * `@base/theme`'s only file is `src/theme.ts` with `as: "lib"`, which the alias
 * table resolves to exactly this path — so declaring it as `config.theme` is
 * what makes D5's absorption case reachable at all.
 */
const THEME_REL = "src/lib/theme.ts";
const RECEIPT = "manteen.lock.json";

const WORK = mkdtempSync(join(tmpdir(), "manteen-gates-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

/** Compile an authoring catalog to the wire format and serve it over `file:`. */
function publish(catalogPath, outName) {
  const outDir = join(WORK, outName);
  const result = compileRegistry(catalogPath);
  assert.deepEqual(result.failures, [], `the ${outName} catalog does not compile`);
  writeRegistry(result, outDir);
  // `pathToFileURL` on the DIRECTORY, then the template appended as text — URL
  // encoding would turn the literal `{name}` into `%7Bname%7D`.
  return `${pathToFileURL(outDir).href}/{name}.json`;
}

const BASE_URL = publish(join(BASE_FIXTURE, "manteen.registry.json"), "base");

/**
 * `@house` — the repo-root catalog, compiled at test setup exactly as phase 2's
 * criteria describe.
 *
 * Phase 3's done-when lines are phrased against THIS catalog by name
 * (`@house/data-table`, `@house/stat-card`, `registry/lib/theme.ts`'s
 * `Button`/`Card`/`Paper`/`Modal`), so they are asserted against it rather than
 * against an equivalent fixture. `@base` covers the same mechanisms with a
 * smaller surface; the `@house` cases below are the literal criteria.
 */
const HOUSE_URL = publish(join(REPO_ROOT, "manteen.registry.json"), "house");
const HOUSE_THEME = readFileSync(join(REPO_ROOT, "registry", "lib", "theme.ts"), "utf8");

/**
 * A consumer project.
 *
 * `mantineVersion` writes `node_modules/@mantine/core/package.json` — the one
 * file `resolve-mantine-install.ts` reads. `null` writes no node_modules at all,
 * which is how the not-installed / no-node-modules arm is reached.
 *
 * `theme` declares `config.theme`; `themeText` seeds the file at that path.
 * Declaring the key without seeding the file is D6's adopt-the-first-source
 * case, and is used deliberately below.
 */
function makeProject({
  theme = null,
  themeText = null,
  mantineVersion = "9.5.0",
  files = {},
  registries = { "@base": BASE_URL },
  /** D12: an `exports` map on the installed manifest, verbatim. */
  mantineExports = null,
  /** Yarn PnP's marker, which is what `resolve-mantine-install.ts` detects. */
  pnp = false,
}) {
  const dir = mkdtempSync(join(tmpdir(), "manteen-gates-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "gates-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        // D15: without one of these, detection returns `undefined` and every run
        // here exits 2 on `no-package-manager` instead of measuring its subject.
        packageManager: "npm@10.9.2",
        dependencies: { "@mantine/core": "^9.5.0" },
      },
      null,
      2,
    )}\n`,
  );

  if (mantineVersion !== null) {
    mkdirSync(join(dir, "node_modules", "@mantine", "core"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "@mantine", "core", "package.json"),
      `${JSON.stringify(
        {
          name: "@mantine/core",
          version: mantineVersion,
          ...(mantineExports ? { exports: mantineExports } : {}),
        },
        null,
        2,
      )}\n`,
    );
  }

  // Content is irrelevant — the gate detects the marker by NAME and never loads
  // it, which is the whole reason a PnP project is `undeterminable` rather than
  // resolvable.
  if (pnp) writeFileSync(join(dir, ".pnp.cjs"), "// yarn pnp loader\n");

  writeFileSync(join(dir, "tsconfig.json"), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  writeFileSync(
    join(dir, "manteen.json"),
    `${JSON.stringify({ registries, aliases: ALIASES, ...(theme ? { theme } : {}) }, null, 2)}\n`,
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

function run(project, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: "utf8",
    // `CI=true`, not `CI=1`: D14's predicate is an exact string comparison, and
    // `CI=1` leaves the child on the interactive branch, where a prompt against
    // a piped stdin hangs until the test times out.
    env: childEnv(),
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

const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
const receiptOf = (dir) => JSON.parse(read(dir, RECEIPT));

/**
 * No package manager was spawned.
 *
 * A lockfile is the artifact npm leaves behind even when it fails, so its
 * absence is the cheap check that the suite stayed hermetic. Asserted rather
 * than reasoned about: the D17 argument that keeps it true is two rules deep and
 * the failure mode is a test suite that quietly needs the network.
 */
function assertNoInstallerRan(project) {
  for (const lockfile of ["package-lock.json", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]) {
    assert.equal(existsSync(join(project, lockfile)), false, `${lockfile} must not appear`);
  }
}

/** A theme the kit can merge: `primaryColor` plus one component entry. */
const BASE_THEME = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "teal",
  components: {
    Button: Button.extend({ defaultProps: { variant: "outline" } }),
  },
});
`;

/** A root that mounts a provider, in the shape the vite template ships. */
const APP_WITH_PROVIDER = `import { MantineProvider } from "@mantine/core";

export function App() {
  return <MantineProvider>{null}</MantineProvider>;
}
`;

// ---- D5 / D6 / D7: the theme fold -------------------------------------------
// One project, two runs. The second assertion is about what the first left
// behind, so they must stay in this order and in this file.

const folded = makeProject({ theme: THEME_REL, themeText: BASE_THEME });

test("a themeFragment folds into the project's theme without disturbing it", () => {
  const result = run(folded, ["add", "@base/data-grid"]);
  assert.equal(result.status, 0, result.all);

  // `ApplyOutcome.theme.written` is not bookkeeping — the reporter renders it as
  // the verb beside the path. `emptyOutcome` hardcodes `written: false` and the
  // success return spreads it, so an apply that forgot to override it prints
  // "unchanged" over a file it had just rewritten. Asserted on the summary line
  // rather than on the field because that is where a user would be misled.
  assert.match(result.stdout, /written\s+src\/lib\/theme\.ts/, result.all);

  const text = read(folded, THEME_REL);

  // The fragment arrived. `Table` is the only entry `src/data-grid.theme.ts`
  // contributes, and `syncMantineImports` has to add the import for it — a merge
  // that produced the entry without the import writes a file that does not
  // compile, which no `changed` flag would report.
  assert.match(text, /Table: Table\.extend/, text);
  assert.match(text, /import \{[^}]*\bTable\b[^}]*\} from "@mantine\/core"/, text);

  // The base survived. This is the whole of D5: `manteen add` on a project with
  // a theme must MERGE, and the failure it prevents is a wholesale overwrite
  // that silently drops these two.
  assert.match(text, /primaryColor: "teal"/, text);
  assert.match(text, /Button: Button\.extend/, text);

  // The other files landed normally — the theme path is special, the rest is not.
  // (`as: "component"` compiles to the wire type `registry:ui`, which the alias
  // table routes to `ui` → `@/components/ui`, not to `components`.)
  assert.ok(existsSync(join(folded, "src/components/ui/data-grid.tsx")), "the block's component");
  assert.ok(existsSync(join(folded, "src/hooks/use-data-grid.ts")), "the block's hook");
  assert.ok(existsSync(join(folded, "src/components/ui/empty-state.tsx")), "its `uses` dependency");

  // Provenance, and the receipt half of D5: the theme is FOLDED, never OWNED.
  // A `ReceiptFile` at the theme destination would authorize a later run to
  // replace the user's theme wholesale on an ownership match.
  const receipt = receiptOf(folded);
  assert.equal(receipt.theme.destination, THEME_REL, JSON.stringify(receipt, null, 2));
  assert.deepEqual(
    receipt.theme.sources,
    [{ itemId: "@base/data-grid", kind: "meta-fragment", path: "src/data-grid.theme.ts" }],
    JSON.stringify(receipt, null, 2),
  );
  for (const item of receipt.items) {
    for (const file of item.files) {
      assert.notEqual(
        file.destination,
        THEME_REL,
        `${item.id} claims ownership of the theme destination; D5 folds it instead`,
      );
    }
  }

  assertNoInstallerRan(folded);
});

test("re-running the same install rewrites nothing at all", () => {
  const before = manifest(folded);

  const result = run(folded, ["add", "@base/data-grid"]);
  assert.equal(result.status, 0, result.all);

  // The other side of the verb. `PlannedTheme.changed === false` means apply
  // skips phase 4 entirely, and the summary has to say so — the same field that
  // must read "written" above must read "unchanged" here, or it is not tracking
  // anything.
  assert.match(result.stdout, /unchanged\s+src\/lib\/theme\.ts/, result.all);

  // The whole tree, not just the theme. `PlannedTheme.changed` is computed
  // textually — the folded text against the base's text — so a second fold that
  // re-added the same entry, or one that appended an import a second time, shows
  // up here as a changed hash rather than as a passing test.
  assert.deepEqual(manifest(folded), before, "a repeat install must be a no-op");
});

/**
 * Mode-bit denial is meaningful only for a non-root Unix process. Windows
 * ignores these POSIX bits, while root can write through them; calling either
 * outcome a pass would claim rollback coverage the runner did not execute.
 */
const CAN_DENY_WRITES = process.platform !== "win32" && process.getuid?.() !== 0;

test("a failed receipt write unwinds the folded theme", { skip: !CAN_DENY_WRITES }, () => {
  // THE discriminating test for "phase 4 is joined to the same pre-image journal
  // as phase 3". A theme written through a journal of its own would satisfy
  // every other assertion in this file — including the one below it — because a
  // separate journal still unwinds its own entry. Only a failure LATER than the
  // theme write can tell the two apart: phase 6 throws, and the theme has to
  // come back.
  //
  // Injected from the outside rather than with a mock: the project ROOT drops to
  // r-x, so `manteen.lock.json`'s temp+rename hits EACCES while every writable
  // subdirectory (`src/lib`, `src/components`, `src/hooks`) lets phases 3 and 4
  // through first.
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });
  const before = manifest(project);

  chmodSync(project, 0o555);
  let result;
  try {
    result = run(project, ["add", "@base/data-grid"]);
  } finally {
    chmodSync(project, 0o755);
  }

  if (result.status === 0) {
    assert.equal(process.getuid?.(), 0, `the receipt write should have failed:\n${result.all}`);
    return;
  }

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}(write-failed|rollback-failed)/, result.all);

  // The theme WAS folded and written — `Table` reached the file — and then had to
  // be put back. A separately-journalled theme would still hold the merged text
  // here, which is the whole failure being ruled out.
  assert.equal(read(project, THEME_REL), BASE_THEME, "the folded theme must be unwound");
  assert.doesNotMatch(read(project, THEME_REL), /Table/, "no trace of the fragment may survive");
  assert.deepEqual(manifest(project), before, "an unwound run leaves the tree as it found it");
});

test("a failed theme write unwinds the component files with it", { skip: !CAN_DENY_WRITES }, () => {
  // The other direction: phase 4 throws and phase 3's writes must not survive.
  // Weaker than the test above on its own — a separate theme journal would also
  // pass this one, since the outer journal still unwinds the components — but it
  // pins the ordering, and the theme is the file most likely to be in the user's
  // git history, so "phase 4 threw and the components stayed" is the specific
  // inconsistency worth naming.
  //
  // `src/lib` is dropped to r-x, so `plan()` still reads the base fine and the
  // journal's temp+rename inside that directory is what hits EACCES.
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });
  const before = manifest(project);
  const themeDir = join(project, "src", "lib");

  chmodSync(themeDir, 0o555);
  let result;
  try {
    result = run(project, ["add", "@base/data-grid"]);
  } finally {
    // Before any assertion: a failure here must not leave a directory the
    // `after` hook cannot remove.
    chmodSync(themeDir, 0o755);
  }

  // Root ignores mode bits, so the write would succeed and this test would
  // quietly assert nothing. Skipping is honest; passing would not be.
  if (result.status === 0) {
    assert.equal(process.getuid?.(), 0, `the theme write should have failed:\n${result.all}`);
    return;
  }

  assert.equal(result.status, 1, result.all);
  // Either failure kind is honest here, and which one appears is a property of
  // the journal rather than of the theme phase. `unwind()` restores by writing
  // the pre-image back, and this injection makes the theme's own directory
  // unwritable — so the restore of a file that was never actually modified
  // fails too, and the run reports `rollback-failed` rather than `write-failed`.
  // That over-states the damage (the theme still holds its original bytes,
  // asserted below) but it errs toward telling the user to check, which is the
  // safe direction. Pinning one kind here would be asserting journal.ts's
  // internals from the outside.
  assert.match(result.stderr, /error {2}(write-failed|rollback-failed)/, result.all);

  // The whole point, and it does not depend on which kind was reported.
  // `src/components/ui/data-grid.tsx` was written by phase 3 and must be gone
  // again — that only happens if phase 4's failure unwound phase 4's journal,
  // which is to say: the same one. The theme must hold its original bytes, and
  // the receipt — phase 6, which never ran — must not exist.
  assert.deepEqual(manifest(project), before, "phase 3's writes must unwind with phase 4's");
  assert.equal(read(project, THEME_REL), BASE_THEME, "the theme was never modified");
  assert.equal(existsSync(join(project, RECEIPT)), false, "the receipt is the last mutation");

  // No `.manteen-tmp-*` survivors, in the one directory where the write failed.
  assert.deepEqual(
    readdirSync(themeDir).filter((name) => name.startsWith(".manteen-tmp-")),
    [],
    "the journal must sweep its own temp files",
  );
});

test("a theme file that lands on config.theme is folded, not written over", () => {
  // `@base/theme` ships `src/theme.ts` as a `lib` file, which resolves to exactly
  // `config.theme`. Without D5's absorption this is a plain file write and the
  // user's theme is gone.
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });

  const result = run(project, ["add", "@base/theme"]);
  assert.equal(result.status, 0, result.all);

  const text = read(project, THEME_REL);

  // `prefer: "base"` — the project's own value wins over the registry's. The
  // fixture's theme declares `primaryColor: "indigo"`; the project declares
  // "teal". A wholesale write would leave "indigo" here.
  assert.match(text, /primaryColor: "teal"/, text);
  assert.doesNotMatch(text, /primaryColor: "indigo"/, text);

  // …and the loss is REPORTED rather than silent. `theme-conflict` is a warning,
  // so the run still exits 0.
  assert.match(result.stderr, /warn {2}theme-conflict/, result.all);

  const receipt = receiptOf(project);
  assert.deepEqual(
    receipt.theme.sources,
    [{ itemId: "@base/theme", kind: "absorbed-file", path: "src/theme.ts" }],
    JSON.stringify(receipt, null, 2),
  );
});

test("an unmergeable theme base refuses at plan time with nothing written", () => {
  // Structurally a theme, and completely unmergeable: `mergeThemeSource` finds no
  // `createTheme(...)` call and throws. D7 is the reason this must surface as a
  // refusal rather than as a crash — the throw would otherwise land in apply(),
  // after the block's three component files were already on disk.
  const project = makeProject({
    theme: THEME_REL,
    themeText: 'export const theme = { primaryColor: "teal" };\n',
  });
  const before = manifest(project);

  const result = run(project, ["add", "@base/data-grid"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}theme-base-unmergeable/, result.all);
  // The phase-3 criterion: the message names the file and prints the shape.
  assert.match(result.stderr, /src\/lib\/theme\.ts/, result.all);
  assert.match(result.stderr, /createTheme\(\{ \.\.\. \}\)/, result.all);

  // The assertion the whole decision exists for. Not "the theme was not written"
  // — NOTHING was, including `src/components/ui/data-grid.tsx`, which a fold that
  // ran during apply() would have left behind.
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

test("no theme is folded when config declares none, and the drop is reported", () => {
  const project = makeProject({});

  const result = run(project, ["add", "@base/data-grid"]);
  assert.equal(result.status, 0, result.all);

  assert.match(result.stderr, /warn {2}meta-degraded/, result.all);
  assert.match(result.stderr, /theme contribution\(s\) were dropped/, result.all);
  assert.equal(
    existsSync(join(project, THEME_REL)),
    false,
    "nothing may be invented at the default path",
  );
  assert.equal(receiptOf(project).theme, null, "a dropped contribution owns no theme");
});

// ---- styles-api --------------------------------------------------------------

test("--dry-run prints the item's Styles API selectors", () => {
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });
  const before = manifest(project);

  const result = run(project, ["add", "@base/data-grid", "--dry-run"]);
  assert.equal(result.status, 0, result.all);

  // The phase-3 done-when line, verbatim from `meta.mantine.stylesApi`:
  // declaration order for the selectors, which is why this is a literal rather
  // than a regex over a set.
  assert.ok(
    result.all.includes("DataGrid: root, header, row"),
    `the Styles API selectors must reach the terminal:\n${result.all}`,
  );
  // Severity info — it may never contribute to the verdict.
  assert.match(result.stderr, /info {2}styles-api/, result.all);

  assert.deepEqual(manifest(project), before, "a dry run must write nothing");
});

// ---- provider-missing (D13) ---------------------------------------------------

test("a project with no provider mounted warns and still exits 0", () => {
  const project = makeProject({});

  const result = run(project, ["add", "@base/empty-state"]);

  // Both halves. A silent exit 0 and an exit 1 are each regressions: D13's whole
  // point is that a check which can report satisfied falsely must never block.
  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /warn {2}provider-missing/, result.all);
  assert.match(result.stderr, /MantineProvider/, result.all);

  // The item was installed anyway — the warning is advisory, not a skip.
  assert.ok(existsSync(join(project, "src/components/ui/empty-state.tsx")), result.all);
});

test("a provider mounted anywhere in the tree silences the warning", () => {
  // The pair matters more than either half: without this, a gate that had been
  // wired to emit unconditionally would pass the test above and be useless.
  const project = makeProject({ files: { "src/App.tsx": APP_WITH_PROVIDER } });

  const result = run(project, ["add", "@base/empty-state"]);

  assert.equal(result.status, 0, result.all);
  assert.doesNotMatch(result.stderr, /provider-missing/, result.all);
});

test("HeadlessMantineProvider does not count as a mount", () => {
  // The scan is `\bMantineProvider\b`, not a substring test.
  // `"HeadlessMantineProvider".includes("MantineProvider")` is true, and that
  // provider installs no styles — so a substring match would go quiet on exactly
  // the project whose components render unstyled.
  const project = makeProject({
    files: {
      "src/App.tsx": `import { HeadlessMantineProvider } from "@mantine/core";

export function App() {
  return <HeadlessMantineProvider>{null}</HeadlessMantineProvider>;
}
`,
    },
  });

  const result = run(project, ["add", "@base/empty-state"]);

  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /warn {2}provider-missing/, result.all);
});

// ---- the version gate (D11) ---------------------------------------------------

test("an installed Mantine below the declared range refuses, and --force clears it", () => {
  // `@base/data-grid` declares `mantine: ">=9"` and `npm: ["@mantine/core@^9"]`,
  // so both range sources are unsatisfied by 8.2.1 and both must be named.
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME, mantineVersion: "8.2.1" });
  const before = manifest(project);

  const refused = run(project, ["add", "@base/data-grid"]);

  assert.equal(refused.status, 1, refused.all);
  assert.match(refused.stderr, /error {2}mantine-version-mismatch/, refused.all);
  assert.match(refused.stderr, /8\.2\.1/, refused.all);
  // Both sources, distinguished. They are different claims — `requires` is what
  // the item needs from what is installed, the npm dependency is what this run
  // would install OVER what is installed — and collapsing them would print one
  // range under a heading that is wrong for the other.
  assert.match(refused.stderr, /requires/, refused.all);
  assert.match(refused.stderr, /npm dependency/, refused.all);
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");

  // `--force` under `--dry-run`. The dry run is not incidental: with 8.2.1
  // installed, D17 no longer drops `@mantine/core` (the installed version fails
  // the range), so a forced full run would reach phase 2 and spawn npm. D19
  // stops above it, and what is being proved here is the plan-stage half — that
  // `mantine-version-mismatch` is FORCEABLE, so `plan.ok` flips and the run gets
  // past the refusal.
  const forced = run(project, ["add", "@base/data-grid", "--force", "--dry-run"]);

  assert.equal(forced.status, 0, forced.all);
  // Downgraded, never silenced: `--force` turns the error into a warning and it
  // is still printed.
  assert.match(forced.stderr, /warn {2}mantine-version-mismatch/, forced.all);
  assert.deepEqual(manifest(project), before, "a dry run must write nothing");
  assertNoInstallerRan(project);
});

test("a satisfied Mantine version says nothing at all", () => {
  const project = makeProject({ theme: THEME_REL, themeText: BASE_THEME });

  const result = run(project, ["add", "@base/data-grid"]);

  assert.equal(result.status, 0, result.all);
  assert.doesNotMatch(result.stderr, /mantine-version-mismatch/, result.all);
  assert.doesNotMatch(result.stderr, /mantine-version-unknown/, result.all);
});

test("an uninstalled Mantine warns rather than refusing", () => {
  // The load-bearing non-refusal. Every catalog item declares `@mantine/core`,
  // so the plan installs it — refusing here would break the greenfield flow
  // outright. It warns because the same state is reached by a pnpm/bun workspace
  // whose Mantine is linked into a leaf package, where the check is silently
  // skipped rather than genuinely satisfied.
  //
  // `--dry-run` for the same reason as above: with nothing installed, D17 keeps
  // `@mantine/core` and a full run would spawn a package manager.
  const project = makeProject({ mantineVersion: null });

  const result = run(project, ["add", "@base/data-grid", "--dry-run"]);

  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /warn {2}mantine-version-unknown/, result.all);
  assert.doesNotMatch(result.stderr, /error {2}mantine-version/, result.all);
  assertNoInstallerRan(project);
});

// ---- the phase-3 done-when criteria, verbatim ---------------------------------
// The cases above prove the mechanisms against the small `@base` fixture. These
// prove the exact criteria the build plan states, against the catalog it names.
// `--dry-run` throughout: `@house/data-table` pulls `@tabler/icons-react@^3`,
// which no temp project has installed, so D17 keeps it and a full run would
// spawn a package manager. D19 stops above phase 2.

const HOUSE = { registries: { "@house": HOUSE_URL }, theme: THEME_REL, themeText: HOUSE_THEME };

test("criterion: @mantine/core 8.2.1 against a conflicting ^9 exits 1 with ONE grouped block", () => {
  const project = makeProject({ ...HOUSE, mantineVersion: "8.2.1" });

  const result = run(project, ["add", "@house/data-table", "--dry-run"]);

  assert.equal(result.status, 1, result.all);

  // "one grouped block" is the criterion's own word and the assertion is a count,
  // not a match: a gate emitting one diagnostic per range would satisfy every
  // other check here and bury the single fact the user needs.
  const blocks = result.stderr.match(/error {2}mantine-version-mismatch/g) ?? [];
  assert.equal(blocks.length, 1, `expected exactly one block:\n${result.all}`);

  // The three parts the criterion enumerates, in order.
  assert.match(result.stderr, / {2}installed {2}8\.2\.1/, result.all);
  assert.match(
    result.stderr,
    / {2}read from {2}\S*node_modules[\\/]@mantine[\\/]core[\\/]package\.json/,
    result.all,
  );
  assert.match(result.stderr, /^ {4}>=9\s+requires\s+.*@house\/data-table/m, result.all);

  // "Proves the gate reads the installed version, not the range." The consumer's
  // own package.json declares `^9`, which 8.2.1 also fails — so a gate that read
  // the declared range instead would refuse here too and look identical. What
  // separates them is that the message reports 8.2.1 as INSTALLED, which is a
  // fact only a manifest read can produce.
  assert.match(result.stderr, /@mantine\/core 8\.2\.1 does not satisfy/, result.all);
});

test("criterion: the same project at 9.5.0 exits 0 and prints a unified theme diff", () => {
  const project = makeProject({ ...HOUSE });

  const result = run(project, ["add", "@house/data-table", "--dry-run"]);
  assert.equal(result.status, 0, result.all);

  // A unified diff — the `---`/`+++`/`@@` triple, not a summary line.
  assert.match(result.stdout, /^--- src\/lib\/theme\.ts/m, result.all);
  assert.match(result.stdout, /^\+\+\+ src\/lib\/theme\.ts/m, result.all);
  assert.match(result.stdout, /^@@ /m, result.all);

  // "showing `Skeleton` and `Table` added" — as ADDITIONS, which is what the
  // leading `+` asserts and what a diff of the wrong two files would not produce.
  assert.match(result.stdout, /^\+ {4}Table: Table\.extend\(\{/m, result.all);
  assert.match(result.stdout, /^\+ {4}Skeleton: Skeleton\.extend\(\{/m, result.all);

  // "with `Button`/`Card`/`Paper`/`Modal` entries still present" — as CONTEXT
  // lines (leading space), which is the diff saying they were neither added nor
  // removed. This is what the full-context render exists for: at three lines of
  // context none of the four would appear at all.
  for (const component of ["Button", "Card", "Paper", "Modal"]) {
    assert.match(
      result.stdout,
      new RegExp(`^ {5}${component}: ${component}\\.extend\\(\\{`, "m"),
      `${component} must survive the merge and be visible in the diff:\n${result.all}`,
    );
  }
  // …and nothing was removed.
  assert.doesNotMatch(result.stdout, /^-\s+(Button|Card|Paper|Modal):/m, result.all);
});

test("criterion: @house/stat-card --dry-run prints its Styles API selectors", () => {
  const project = makeProject({ registries: { "@house": HOUSE_URL } });
  const before = manifest(project);

  const result = run(project, ["add", "@house/stat-card", "--dry-run"]);

  assert.equal(result.status, 0, result.all);
  assert.ok(
    result.all.includes("StatCard: root, label, value, trend"),
    `the criterion's literal line must appear:\n${result.all}`,
  );
  // "and contributes nothing to `refused`" — info severity, exit 0, nothing
  // written.
  assert.match(result.stderr, /info {2}styles-api/, result.all);
  assert.deepEqual(manifest(project), before, "a dry run must write nothing");
});

test("criterion: .pnp.cjs reports Yarn PnP, exits 0, and never says 'not installed'", () => {
  // Under PnP the packages ARE installed — there is simply no directory to read.
  // Collapsing that into "not installed" is the failure D11 names, and it is a
  // failure of the MESSAGE, so the message is what gets asserted.
  const project = makeProject({ mantineVersion: null, pnp: true });

  const result = run(project, ["add", "@base/data-grid", "--dry-run"]);

  assert.equal(result.status, 0, result.all);
  assert.match(result.stderr, /warn {2}mantine-version-unknown/, result.all);
  assert.match(result.stderr, /Yarn Plug'n'Play/, result.all);
  // Over the WHOLE run's output, not just the one diagnostic: the string must not
  // reach the user from anywhere while PnP is what is actually going on.
  assert.equal(
    result.all.includes("not installed"),
    false,
    `"not installed" is wrong under PnP:\n${result.all}`,
  );
  assertNoInstallerRan(project);
});

test("D12: an exports map without ./package.json still resolves to `found`", () => {
  // Stated POSITIVELY, as D12 requires. `@mantine/core`'s real exports map
  // declares only `.`, `./styles.css`, `./styles.layer.css` and `./styles/*`, so
  // `require.resolve("@mantine/core/package.json")` throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED — and the upward walk reads the file rather
  // than asking the resolver for it, so the map cannot block it.
  //
  // The version is 8.2.1 rather than a satisfying one on purpose: asserting
  // SILENCE would pass for a gate that never found the manifest at all. A
  // mismatch naming 8.2.1 can only come from having read it.
  const project = makeProject({
    mantineVersion: "8.2.1",
    mantineExports: {
      ".": { import: "./esm/index.mjs", require: "./cjs/index.cjs" },
      "./styles.css": "./styles.css",
      "./styles.layer.css": "./styles.layer.css",
      "./styles/*": "./styles/*",
    },
  });

  const result = run(project, ["add", "@base/data-grid", "--dry-run"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}mantine-version-mismatch/, result.all);
  assert.match(result.stderr, / {2}installed {2}8\.2\.1/, result.all);
  assert.doesNotMatch(result.stderr, /mantine-version-unknown/, result.all);
});
