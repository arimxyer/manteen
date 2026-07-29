/**
 * The HTTP registry path, end to end, under real `node` and over a real socket.
 *
 * `src/plan/loader-http.ts` is the only module in the package permitted to call
 * `fetch`, and the only honest test of it is one that opens a connection. Every
 * case here drives the BUILT `dist/cli.mjs` in a child process against a
 * loopback server on an ephemeral port — no external network, nothing that can
 * be reached from CI's egress rules or from a laptop on a plane.
 *
 * The assertion this file exists for is the redaction one. An expanded `${VAR}`
 * may appear in exactly one place: the outgoing request. It may not appear in
 * stdout, in stderr, in a diagnostic, or in `manteen.lock.json` — which is
 * committed to the user's repository and is therefore the highest-severity leak
 * surface of the four. `run()` below checks the two streams after EVERY child
 * process, successful or not, so a leak fails the test that caused it rather
 * than one test somewhere at the end.
 *
 * Run it with:
 *   bun --cwd=packages/cli run build && node --test packages/cli/e2e/*.mjs
 */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
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

import { compileRegistry, writeRegistry } from "manteen-kit";

import { childEnv } from "./helpers/child-env.mjs";
import {
  MALFORMED_MOUNT,
  OVERSIZE_MOUNT,
  startRegistryServer,
} from "./helpers/registry-server.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const BASE_FIXTURE = join(REPO_ROOT, "packages", "registry-kit", "fixtures", "base");

// Same reason as the first slice: this tier exists to catch runtime APIs that
// resolve under one runtime and not the other, and running it under the wrong
// one makes it pass while the published CLI stays broken.
assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node — use `node --test packages/cli/e2e/*.mjs`",
);

assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

// ---- the secret --------------------------------------------------------------

const TOKEN_VAR = "MANTEEN_TEST_TOKEN";
/** `${MANTEEN_TEST_TOKEN}` — the form that is allowed to be printed. */
const TOKEN_LITERAL = `\${${TOKEN_VAR}}`;

/**
 * Both values are `[A-Za-z0-9-]` only, so `encodeURIComponent` leaves them
 * unchanged. A token needing percent-encoding would appear in the query string
 * in a different spelling from the one being searched for, and the substring
 * scan below would report clean on a genuine leak.
 */
const TOKEN = "manteen-e2e-secret-4f9a2c7b1e6d";
const WRONG_TOKEN = "manteen-e2e-wrong-0badc0de5f11";

/** Every value that has ever been an expanded `${VAR}` in this file. */
const SECRETS = [TOKEN, WRONG_TOKEN];

// ---- fixtures ----------------------------------------------------------------

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

const DESTINATION = join("src", "components", "ui", "empty-state.tsx");
const SOURCE = join(BASE_FIXTURE, "src", "empty-state.tsx");
const RECEIPT = "manteen.lock.json";

const WORK = mkdtempSync(join(tmpdir(), "manteen-http-"));
const projects = [];

// Compiled BEFORE the server starts, deliberately: nothing between the listen
// and the `after` registration below may throw, or the listener leaks and the
// suite hangs instead of failing.
const BASE_DIST = join(WORK, "base");
{
  const result = compileRegistry(join(BASE_FIXTURE, "manteen.registry.json"));
  assert.deepEqual(result.failures, [], "the base fixture does not compile");
  writeRegistry(result, BASE_DIST);
}

const server = await startRegistryServer({
  mounts: {
    // No credential required — the happy path and the 404.
    open: { dir: BASE_DIST },
    // Requires `Authorization: Bearer <TOKEN>`. Two namespaces point at it: one
    // that sends no header at all (401) and one that sends `${VAR}` (403 or 200,
    // depending on what the variable holds).
    secure: { dir: BASE_DIST, token: TOKEN },
  },
});

// `after`, not a per-test `finally`: one server serves every case here, and
// node:test runs after-hooks even when an assertion fails — which is exactly the
// hang this is guarding against.
after(async () => {
  await server.close();
  rmSync(WORK, { recursive: true, force: true });
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

const OPEN_URL = server.itemUrl("open");
const SECURE_URL = server.itemUrl("secure");

/** The `@secure` registry: the token travels in a header AND in a query param. */
const SECURE_REGISTRY = {
  url: SECURE_URL,
  headers: { Authorization: `Bearer ${TOKEN_LITERAL}` },
  // The param is not what the server authenticates on. It is here because
  // `redactedUrl` is built from the URL and its params only — a header-only
  // token never appears in a diagnostic in any form, so a param is the only way
  // to assert that the LITERAL is what gets printed.
  params: { token: TOKEN_LITERAL },
};

function makeProject(registries) {
  const dir = mkdtempSync(join(tmpdir(), "manteen-http-project-"));
  projects.push(dir);

  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "http-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        // D15: without one of these, detection returns `undefined` and every run
        // here would refuse with `no-package-manager` at exit 2.
        packageManager: "npm@10.9.2",
        // D17 drops a dependency only when the installed version satisfies the
        // range AND the name is declared here. Both hold for `@mantine/core@^9`,
        // which every fixture item declares — so no package manager is ever
        // spawned and this suite stays as network-free as it claims to be.
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
    `${JSON.stringify({ registries, aliases: ALIASES }, null, 2)}\n`,
  );

  return dir;
}

/**
 * Spawn the built CLI, then scan both streams for every secret before the caller
 * sees them.
 *
 * The scan lives here rather than in each test so that no run can forget it, and
 * so it fires BEFORE any other assertion in the test — assertions below routinely
 * pass `result.all` as their failure message, and one of those firing first on a
 * leaking run would print the token into the test log.
 *
 * For the same reason the scan's own message names the stream and nothing else.
 *
 * `env` values of `undefined` unset the variable rather than setting it to the
 * string "undefined"; that is how the missing-`${VAR}` case is expressed.
 *
 * ASYNC, and `spawn` rather than `spawnSync`, and that is not a style choice.
 * The registry server runs IN THIS PROCESS. `spawnSync` blocks the thread for
 * the child's whole lifetime, so the listener never accepts the connection the
 * child opens — every request stalls until the loader's own 30 s timeout fires
 * and every case fails as `could not be reached` instead of as itself. The
 * first-slice suite can use `spawnSync` because a `file:` registry has no
 * server to starve.
 */
async function run(project, args, env = {}) {
  const resolvedEnv = childEnv(env);

  const result = await new Promise((settle, fail) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: project, env: resolvedEnv });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", fail);
    // `close`, not `exit`: `exit` can fire while the pipes still hold buffered
    // output, which would truncate the very streams this function scans.
    child.on("close", (code) => settle({ status: code, stdout: out, stderr: err }));
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  for (const secret of SECRETS) {
    assert.equal(
      stdout.includes(secret),
      false,
      `an expanded ${TOKEN_VAR} reached stdout. Only the outgoing request may carry the value; ${TOKEN_LITERAL} is what may be printed.`,
    );
    assert.equal(
      stderr.includes(secret),
      false,
      `an expanded ${TOKEN_VAR} reached stderr. Only the outgoing request may carry the value; ${TOKEN_LITERAL} is what may be printed.`,
    );
  }

  return {
    status: result.status,
    stdout,
    stderr,
    get all() {
      return `${this.stdout}${this.stderr}`;
    },
  };
}

/** Every file under `dir` except `node_modules`, as `{ rel, bytes }`. */
function files(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push({ rel: relative(dir, full).split(sep).join("/"), bytes: readFileSync(full) });
    }
  };
  walk(dir);
  return out;
}

/** POSIX relative path -> content hash. The zero-mutation check compares these. */
function manifest(dir) {
  const out = {};
  for (const file of files(dir)) {
    out[file.rel] = createHash("sha256").update(file.bytes).digest("hex");
  }
  return out;
}

/**
 * The leak surface that outlives the process.
 *
 * `manteen.lock.json` records `sourceUrl` for every installed item and is meant
 * to be committed, so a token that reaches it is a token in the user's git
 * history. Applied to the whole tree rather than to the receipt alone: a written
 * component is content we shipped verbatim, and asserting over everything costs
 * one walk.
 */
function assertProjectHasNoSecrets(project) {
  for (const file of files(project)) {
    const text = file.bytes.toString("utf8");
    for (const secret of SECRETS) {
      assert.equal(
        text.includes(secret),
        false,
        `an expanded ${TOKEN_VAR} was written into ${file.rel}, which is committed to the user's repo`,
      );
    }
  }
}

/** Requests the server saw for one mount, in arrival order. */
function requestsTo(mount) {
  return server.requests().filter((request) => request.mount === mount);
}

/**
 * The other half of the redaction property: the expanded value must reach the
 * wire, in both carriers, on every request.
 *
 * Without this, a client that expanded nothing at all would satisfy every
 * "the token is not in the output" assertion in this file trivially.
 */
function assertEveryRequestCarried(requests, secret) {
  assert.ok(requests.length > 0, "the item must be fetched over http");
  for (const request of requests) {
    assert.equal(
      request.headers.authorization,
      `Bearer ${secret}`,
      `${request.method} ${request.pathname} did not carry the expanded Authorization header`,
    );
    assert.equal(
      request.query.token,
      secret,
      `${request.method} ${request.pathname} did not carry the expanded query parameter`,
    );
  }
}

// ---- the happy path ----------------------------------------------------------

test("add installs over http from an unauthenticated registry", async () => {
  const project = makeProject({ "@base": OPEN_URL });
  server.clear();

  const result = await run(project, ["add", "@base/empty-state"]);
  assert.equal(result.status, 0, result.all);

  assert.equal(
    Buffer.compare(readFileSync(join(project, DESTINATION)), readFileSync(SOURCE)),
    0,
    "content must ship verbatim — byte-identical to the fixture source",
  );

  // The bytes came off a socket, not off disk. Without this the test would still
  // pass if the loader silently fell back to reading the compiled directory.
  //
  // Not asserted as "exactly one request": a loader that probes with HEAD before
  // reading a body is a legitimate way to enforce the size ceiling, and pinning
  // the count would make that design fail a test about something else. What must
  // hold is that nothing OTHER than this item was asked for.
  const seen = requestsTo("open");
  assert.ok(seen.length > 0, "the item must be fetched over http");
  assert.deepEqual([...new Set(seen.map((request) => request.name))], ["empty-state.json"]);
  assert.ok(
    seen.some((request) => request.method === "GET"),
    `the body must be fetched with GET, saw ${seen.map((request) => request.method).join(", ")}`,
  );
  // The other direction of the credential rule: a registry that configures no
  // headers must send none. Only the registry entry's own `headers` block may
  // put an Authorization on the wire — never a default acquired somewhere else.
  for (const request of seen) {
    assert.equal(
      request.headers.authorization,
      undefined,
      "an unauthenticated registry must send no credential",
    );
  }

  // The receipt records where the item came from, and that is the http URL.
  const receipt = JSON.parse(readFileSync(join(project, RECEIPT), "utf8"));
  assert.equal(receipt.items.length, 1, JSON.stringify(receipt, null, 2));
  assert.equal(receipt.items[0].id, "@base/empty-state");
  assert.equal(receipt.items[0].sourceUrl, `${server.url}/open/empty-state.json`);

  // D17's filter: no dependency reached an installer, so nothing here touched
  // the network beyond the loopback server.
  for (const lockfile of ["package-lock.json", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]) {
    assert.equal(existsSync(join(project, lockfile)), false, `${lockfile} must not appear`);
  }
});

// ---- authentication ----------------------------------------------------------

test("a registry that sends no Authorization header surfaces the 401", async () => {
  // Points at the authenticated mount with no `headers` block — the shape a user
  // gets when they copy a registry URL and miss the credential half of the docs.
  const project = makeProject({ "@bare": SECURE_URL });
  const before = manifest(project);

  const result = await run(project, ["add", "@bare/empty-state"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /fetch-failed/, result.all);
  assert.match(result.stderr, /@bare\/empty-state/, result.all);
  assert.match(result.stderr, /\b401\b/, result.all);
  // The authored half of the detail, which is the only thing the status code
  // does not already say. It is derived from whether the registry entry
  // configures headers — never from the response — so a loader that echoed
  // `statusText` or the body instead would pass the `401` grep above and fail
  // here.
  assert.match(result.stderr, /no headers are configured for this registry/, result.all);
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

/**
 * The mount's 403 body echoes the credential it rejected, the way a real
 * registry does. So this case is also the trap for the most plausible way a
 * well-meaning loader leaks: folding the response body into `LoadedDoc.detail`
 * to make the error more helpful. `run()`'s stream scan is what catches it —
 * there is no extra assertion here, and there does not need to be.
 */
test("a wrong ${TOKEN} surfaces the 403 and prints the variable, never its value", async () => {
  const project = makeProject({ "@secure": SECURE_REGISTRY });
  const before = manifest(project);
  server.clear();

  const result = await run(project, ["add", "@secure/empty-state"], { [TOKEN_VAR]: WRONG_TOKEN });

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /fetch-failed/, result.all);
  assert.match(result.stderr, /@secure\/empty-state/, result.all);
  assert.match(result.stderr, /\b403\b/, result.all);
  // The other arm of the same authored hint: this registry DOES configure
  // headers, so the advice is about the value rather than about its absence.
  assert.match(result.stderr, /rejected the credentials it was given/, result.all);

  // The literal IS printed — the whole point of keeping the redacted URL around
  // is that the user can see which variable to fix. `run()` has already proved
  // the value is in neither stream.
  assert.ok(
    result.stderr.includes(TOKEN_LITERAL),
    `stderr must name ${TOKEN_LITERAL} so the user knows which variable to set`,
  );

  // …and the expanded value did reach the wire, in both carriers. Without this
  // the redaction assertions above would pass on a client that never expanded
  // anything. Asserted over EVERY request rather than the first: a retry or a
  // HEAD probe that dropped the credential is the same bug as never sending it.
  assertEveryRequestCarried(requestsTo("secure"), WRONG_TOKEN);

  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

test("${TOKEN} expansion installs, and the receipt keeps the variable literal", async () => {
  const project = makeProject({ "@secure": SECURE_REGISTRY });
  server.clear();

  const result = await run(project, ["add", "@secure/empty-state"], { [TOKEN_VAR]: TOKEN });
  assert.equal(result.status, 0, result.all);

  assert.equal(
    Buffer.compare(readFileSync(join(project, DESTINATION)), readFileSync(SOURCE)),
    0,
    "content must ship verbatim — byte-identical to the fixture source",
  );

  assertEveryRequestCarried(requestsTo("secure"), TOKEN);

  // The receipt is committed. It must carry the template, not the credential.
  const receiptText = readFileSync(join(project, RECEIPT), "utf8");
  assert.ok(
    receiptText.includes(TOKEN_LITERAL),
    `${RECEIPT} must record the redacted sourceUrl:\n${receiptText}`,
  );
  const receipt = JSON.parse(receiptText);
  assert.equal(
    receipt.items[0].sourceUrl,
    `${server.url}/secure/empty-state.json?token=${TOKEN_LITERAL}`,
  );

  assertProjectHasNoSecrets(project);
});

test("an unset ${TOKEN} refuses before any request is made", async () => {
  const project = makeProject({ "@secure": SECURE_REGISTRY });
  const before = manifest(project);
  server.clear();

  const result = await run(project, ["add", "@secure/empty-state"], { [TOKEN_VAR]: undefined });

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /missing-env/, result.all);
  assert.ok(
    result.stderr.includes(TOKEN_LITERAL),
    `stderr must name ${TOKEN_LITERAL} — saying which variable is unset is the entire message`,
  );

  // Not merely "the request failed": a request must never go out with a hole
  // where the credential should be, because a server logs the URL it was asked
  // for and a 401 reads as a bad token rather than an unset one.
  assert.deepEqual(requestsTo("secure"), [], "no request may be made with an unexpanded ${VAR}");
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

// ---- the loader's other branches ---------------------------------------------

test("an item the registry does not publish surfaces the 404", async () => {
  const project = makeProject({ "@base": OPEN_URL });
  const before = manifest(project);

  const result = await run(project, ["add", "@base/no-such-item"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /fetch-failed/, result.all);
  assert.match(result.stderr, /@base\/no-such-item/, result.all);
  assert.match(result.stderr, /\b404\b/, result.all);
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

/**
 * D21's whole reason for existing as a DECLARED field: the index is a second URL
 * the registry publishes, and the only thing `add` uses it for is turning a 404
 * into a suggestion.
 *
 * `empty-stat` is one edit away from `empty-state`, which is what a typo looks
 * like. `@base` above deliberately declares no `index` — a plain 404 with no
 * suggestion is the correct output for a registry that publishes no index, and
 * the two tests together are what keep the feature from being "always on".
 */
test("a 404 from a registry with an index suggests the nearest item", async () => {
  const project = makeProject({
    "@near": {
      url: OPEN_URL,
      index: `${server.url}/open/registry.json`,
      // `params` are documented as appended to every request to the registry,
      // and the index is one. A registry that authenticates by query parameter
      // would otherwise 401 its own index and the suggestion would vanish with
      // no way to tell that from "no near name" — so the index request is
      // asserted to carry it below.
      params: { channel: "stable" },
    },
  });
  const before = manifest(project);
  server.clear();

  const result = await run(project, ["add", "@near/empty-stat"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /fetch-failed/, result.all);
  assert.match(result.stderr, /\b404\b/, result.all);
  assert.match(result.stderr, /did you mean empty-state/, result.all);

  // The suggestion came off the wire, not out of a guess: `writeRegistry` emits
  // `registry.json` beside the items, and this is the only request in the suite
  // that asks for it.
  const index = requestsTo("open").filter((request) => request.name === "registry.json");
  assert.equal(index.length, 1, "the index must be fetched exactly once to produce a suggestion");
  assert.equal(
    index[0].query.channel,
    "stable",
    "the index request must carry the registry's params",
  );
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

test("a response over the size ceiling refuses with response-too-large", async () => {
  const project = makeProject({ "@big": server.itemUrl(OVERSIZE_MOUNT) });
  const before = manifest(project);

  const result = await run(project, ["add", "@big/empty-state"]);

  assert.equal(result.status, 1, result.all);
  // Specifically this code, not `wire-invalid`: the oversize body is valid JSON,
  // so a loader that skipped the ceiling would parse it and refuse one stage
  // later for the wrong reason.
  assert.match(result.stderr, /response-too-large/, result.all);
  assert.match(result.stderr, /@big\/empty-state/, result.all);
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});

test("a body that is not JSON refuses with wire-invalid", async () => {
  const project = makeProject({ "@bad": server.itemUrl(MALFORMED_MOUNT) });
  const before = manifest(project);

  const result = await run(project, ["add", "@bad/empty-state"]);

  assert.equal(result.status, 1, result.all);
  assert.match(result.stderr, /wire-invalid/, result.all);
  assert.match(result.stderr, /@bad\/empty-state/, result.all);
  assert.deepEqual(manifest(project), before, "a refused run must write nothing");
});
