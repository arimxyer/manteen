/**
 * The first slice, end to end, under real `node`.
 *
 * config load -> paths-key alias validation -> local loader -> wire+meta
 * validation -> destination resolution -> collision check -> apply -> a file on
 * disk. Every step runs in a child process spawned with `process.execPath`
 * against the BUILT `dist/cli.mjs`, because that is the only shape a user ever
 * gets: under `bun test`, every runtime API `scripts/guard-runtime-apis.mjs`
 * bans resolves happily, and this tier exists to catch exactly those.
 *
 * (That comment is worded around the banned spellings rather than quoting them:
 * the guard scans `e2e/` too, and a comment naming them turns it red.)
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

// Resolves through the workspace symlink into packages/registry-kit/dist. If
// this throws ERR_MODULE_NOT_FOUND the kit has not been built.
import { compileRegistry, writeRegistry } from "manteen-kit";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");
const COLLIDE_FIXTURE = join(PKG_ROOT, "fixtures", "collide");

// Running this file under bun would defeat its entire purpose — bun implements
// every Bun-only API the guard script bans, so the tier would pass and the
// published CLI would still be broken for users.
assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node, not bun — use `node --test packages/cli/e2e/*.mjs`",
);

assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

/**
 * The consumer's tsconfig. Four `paths` keys, one backing each alias.
 *
 * `baseUrl` is present deliberately: it is what makes D1's trap live. With it
 * set, `createPathsMatcher("@/nope/empty-state")` returns
 * `["<root>/@/nope/empty-state"]` rather than `[]`, so a client that treats `[]`
 * as "unbacked" happily writes into a literal directory named `@`. The
 * unbacked-alias case below is the assertion that catches that.
 */
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

const PATHS_KEYS = Object.keys(TSCONFIG.compilerOptions.paths);

const ALIASES = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

const WORK = mkdtempSync(join(tmpdir(), "manteen-slice-"));
const projects = [];

after(() => {
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

/** Compile an authoring catalog to the wire format and serve it over `file:`. */
function publish(fixtureDir, outName) {
  const outDir = join(WORK, outName);
  const result = compileRegistry(join(fixtureDir, "manteen.registry.json"));
  assert.deepEqual(result.failures, [], `${outName} fixture does not compile`);
  writeRegistry(result, outDir);
  // `pathToFileURL` on the DIRECTORY, then the template appended as text: URL
  // encoding would turn the literal `{name}` the config schema requires into
  // `%7Bname%7D`. Node's `fetch` rejects `file:` outright, so this path is
  // served by loader-local.ts reading from disk.
  return `${pathToFileURL(outDir).href}/{name}.json`;
}

const BASE_URL = publish(BASE_FIXTURE, "base");
const COLLIDE_URL = publish(COLLIDE_FIXTURE, "collide");

function makeProject({ registries, aliases = ALIASES }) {
  const dir = mkdtempSync(join(tmpdir(), "manteen-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "slice-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        // D15: nypm's `detectPackageManager` returns `undefined` — not a throw —
        // with no lockfile and no `packageManager` field, and plan() turns that
        // into a `no-package-manager` failure at exit 2. Declaring one keeps this
        // test measuring what it is about.
        packageManager: "npm@10.9.2",
        // D17 filters a dependency out only when BOTH the installed version
        // satisfies the range AND the name is already declared here. Both hold,
        // so `@mantine/core@^9` never reaches an installer and the slice stays
        // hermetic. The assertions below check that rather than assume it.
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
        // Points at a file that does not exist in this temp project. That is the
        // point: `$schema` is an editor affordance, and a client that tries to
        // resolve it fails here instead of in a user's repo.
        $schema: "./node_modules/manteen/schema/manteen.schema.json",
        registries,
        aliases,
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

const DESTINATION = join("src", "components", "ui", "empty-state.tsx");
const SOURCE = join(BASE_FIXTURE, "src", "empty-state.tsx");

// ---- the happy path, and the re-run --------------------------------------
// One project, two runs, in order: the second assertion is about what the first
// one left behind.

const installed = makeProject({ registries: { "@base": BASE_URL } });
const installedPackageJson = readFileSync(join(installed, "package.json"));

test("add writes the component at its paths-resolved destination", () => {
  const result = run(installed, ["add", "@base/empty-state"]);
  assert.equal(result.status, 0, result.all);

  const written = readFileSync(join(installed, DESTINATION));
  assert.equal(
    Buffer.compare(written, readFileSync(SOURCE)),
    0,
    "content must ship verbatim — byte-identical to the fixture source",
  );

  // D17's filter, asserted rather than assumed. If dependency installation ever
  // leaks into the slice, this names it instead of the suite hanging on a
  // package manager reaching the network.
  assert.equal(
    Buffer.compare(readFileSync(join(installed, "package.json")), installedPackageJson),
    0,
    "package.json must be untouched — @mantine/core is already declared and satisfied",
  );
  for (const lockfile of [
    "package-lock.json",
    "bun.lock",
    "bun.lockb",
    "pnpm-lock.yaml",
    "yarn.lock",
  ]) {
    assert.equal(existsSync(join(installed, lockfile)), false, `${lockfile} must not appear`);
  }
});

test("re-running reports identical and rewrites nothing", () => {
  const before = createHash("sha256")
    .update(readFileSync(join(installed, DESTINATION)))
    .digest("hex");

  const result = run(installed, ["add", "@base/empty-state"]);
  assert.equal(result.status, 0, result.all);
  // Named separately from the match below so a silent apply — one that filters
  // no-op destinations out of `ApplyOutcome.files` — fails as a contract
  // violation ("every planned destination, in write-list order") rather than as
  // an unexplained regex miss in the renderer.
  assert.ok(
    result.stdout.trim().length > 0,
    `apply must report every planned destination, including identical ones\n${result.all}`,
  );
  assert.match(result.stdout, /^identical\s+src\/components\/ui\/empty-state\.tsx$/m, result.all);

  const after = createHash("sha256")
    .update(readFileSync(join(installed, DESTINATION)))
    .digest("hex");
  assert.equal(after, before, "an identical disposition must not rewrite the file");
});

// ---- D19: --dry-run --------------------------------------------------------

test("--dry-run previews the disposition and writes nothing", () => {
  const project = makeProject({ registries: { "@base": BASE_URL } });
  const before = manifest(project);

  const result = run(project, ["add", "@base/empty-state", "--dry-run"]);

  assert.equal(result.status, 0, result.all);
  // `create`, a Disposition — what plan() PREDICTED. A dry run that printed a
  // WriteResult (`written`) would be describing phase 3, which D19 never enters.
  assert.match(result.stdout, /^create\s+src\/components\/ui\/empty-state\.tsx$/m, result.all);
  assert.deepEqual(manifest(project), before, "--dry-run must not touch the project");
});

// ---- D8: two ids, one destination ----------------------------------------

test("two registries publishing one name refuse with target-collision", () => {
  const project = makeProject({
    registries: { "@base": BASE_URL, "@collide": COLLIDE_URL },
  });
  const before = manifest(project);

  const result = run(project, ["add", "@base/empty-state", "@collide/empty-state"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /target-collision/, result.all);
  assert.match(result.stderr, /@base\/empty-state/, result.all);
  assert.match(result.stderr, /@collide\/empty-state/, result.all);

  // Non-forceable and pre-write: the refusal has to be zero-mutation, not merely
  // an exit code after a partial install.
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

// ---- D1: the unbacked alias ----------------------------------------------

test("an alias with no backing paths key exits 2 and lists the keys present", () => {
  const project = makeProject({
    registries: { "@base": BASE_URL },
    aliases: { ...ALIASES, ui: "@/nope" },
  });

  const result = run(project, ["add", "@base/empty-state"]);

  // 2, not 1: this is a config problem, found before there is a Plan to refuse.
  assert.equal(result.status, 2, result.all);
  // `ConfigError.pointer` is a JSON Pointer into manteen.json, not a dotted path.
  assert.ok(
    result.stderr.includes("/aliases/ui"),
    `stderr must point at /aliases/ui\n${result.all}`,
  );
  for (const key of PATHS_KEYS) {
    assert.ok(result.stderr.includes(key), `stderr must list the paths key ${key}\n${result.all}`);
  }

  // The assertion that would silently pass under `[] === unresolvable`: with
  // `baseUrl` set, `createPathsMatcher("@/nope/empty-state")` resolves to
  // `<root>/@/nope/empty-state`, so a client using that test writes a real file
  // into a literal `@` directory and exits 0.
  assert.equal(
    existsSync(join(project, "@")),
    false,
    "nothing may be written into a literal `@` directory",
  );
  assert.equal(existsSync(join(project, DESTINATION)), false);
});
