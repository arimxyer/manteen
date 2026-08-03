/**
 * §6 — the jsconfig-only refusal, end to end, under real `node` against the
 * BUILT CLI.
 *
 * `test/jsconfig.test.ts` proves `loadConfig()` marks the project and `plan()`
 * carries the diagnostic — under bun, from source. This file adds the one
 * thing that tier cannot: the shipped `dist/cli.mjs`, spawned by node against
 * a real jsconfig-only project, refuses `@house/stat-card` (which ships a
 * `.tsx`) with exit 1, the code on stderr, and nothing written — and `--force`
 * changes none of it, because the row is non-forceable.
 *
 * The project deliberately carries a package.json with a `packageManager`
 * field AND a lockfile: `no-package-manager` exits 2 and wins any co-fire
 * (`blockingExitCode` returns 2 on sight), so a project without one would
 * measure that gate's exit instead of this one's.
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.node-e2e.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { compileRegistry, writeRegistry } from "manteen-kit";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");

// Under bun every runtime API `scripts/guard-runtime-apis.mjs` bans resolves
// happily, so running this tier under the wrong runtime makes it pass while the
// published CLI stays broken.
assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);

assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

/** A jsconfig's `compilerOptions` — `parseTsconfig` and the paths matcher do
 *  not care what the file is called, which is why the refusal has to. */
const JSCONFIG = {
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

const WORK = mkdtempSync(join(tmpdir(), "manteen-jsconfig-e2e-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

/** Compile the repo-root catalog to the wire format and serve it over `file:`. */
function publish(catalogPath, outName) {
  const outDir = join(WORK, outName);
  const result = compileRegistry(catalogPath);
  assert.deepEqual(result.failures, [], `the ${outName} catalog does not compile`);
  writeRegistry(result, outDir);
  // `pathToFileURL` on the DIRECTORY, then the template appended as text — URL
  // encoding would turn the literal `{name}` into `%7Bname%7D`.
  return `${pathToFileURL(outDir).href}/{name}.json`;
}

const HOUSE_URL = publish(join(REPO_ROOT, "manteen.registry.json"), "house");

/**
 * A JavaScript consumer: `jsconfig.json`, no `tsconfig.json` anywhere. The
 * package manager is declared TWICE over (the `packageManager` field and an
 * npm lockfile) so nypm cannot fail to detect one — see the file header.
 * Mantine is seeded at a satisfying version so no version gate contributes
 * anything to the output being asserted on.
 */
function makeJsProject() {
  const dir = mkdtempSync(join(tmpdir(), "manteen-jsconfig-e2e-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "jsconfig-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: "npm@10.9.2",
        dependencies: { "@mantine/core": "^9.5.0" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, "package-lock.json"),
    `${JSON.stringify(
      { name: "jsconfig-consumer", version: "0.0.0", lockfileVersion: 3, packages: {} },
      null,
      2,
    )}\n`,
  );

  mkdirSync(join(dir, "node_modules", "@mantine", "core"), { recursive: true });
  writeFileSync(
    join(dir, "node_modules", "@mantine", "core", "package.json"),
    `${JSON.stringify({ name: "@mantine/core", version: "9.5.0" }, null, 2)}\n`,
  );

  writeFileSync(join(dir, "jsconfig.json"), `${JSON.stringify(JSCONFIG, null, 2)}\n`);
  writeFileSync(
    join(dir, "manteen.json"),
    `${JSON.stringify({ registries: { "@house": HOUSE_URL }, aliases: ALIASES }, null, 2)}\n`,
  );

  return dir;
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
function fileList(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

// One project, two runs. The second asserts on the same tree the first was
// proven to have left untouched, so they must stay in this order.
const project = makeJsProject();
const before = fileList(project);

test("a jsconfig-only project refuses a .tsx item with exit 1 and writes nothing", () => {
  const result = run(project, ["add", "@house/stat-card"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}jsconfig-typescript-unsupported/, result.all);

  // Not "the component was not written" — NO `.tsx` at all: the refusal is
  // about the extension, so a stray `.tsx` anywhere is the exact failure.
  const files = fileList(project);
  assert.deepEqual(
    files.filter((rel) => rel.endsWith(".tsx")),
    [],
    `a refused run must write no .tsx:\n${files.join("\n")}`,
  );
  assert.deepEqual(files, before, "a refused run must write nothing at all");
  assert.equal(
    readFileSync(join(project, "jsconfig.json"), "utf8").includes('"baseUrl"'),
    true,
    "the project's own jsconfig must be untouched",
  );
});

test("--force does not clear it: the row is non-forceable", () => {
  const result = run(project, ["add", "@house/stat-card", "--force"]);

  // Identical refusal — still an ERROR (never downgraded to a warning, which is
  // what `--force` does to the forceable rows), same exit, still nothing written.
  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /error {2}jsconfig-typescript-unsupported/, result.all);
  assert.deepEqual(fileList(project), before, "a forced refusal must write nothing either");
});
