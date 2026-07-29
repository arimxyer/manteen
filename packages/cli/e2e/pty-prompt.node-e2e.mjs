/**
 * W7 — the real overwrite prompt through a real Unix pseudo-terminal.
 *
 * `apply-surface.node-e2e.mjs` proves everything downstream of the injected
 * `OverwritePrompt` answer. This file owns the remaining edge: the shipped
 * `clackOverwritePrompt` translating real Enter, Space and Ctrl-C keystrokes
 * into keep, overwrite and cancellation outcomes.
 *
 * Clack redraws while rendering, so prompt text is not a reliable readiness
 * marker in the raw transcript. We wait until output has started and then gone
 * quiet for 250 ms. The longer timers below are failure deadlines only; none is
 * used to decide when input may be sent.
 *
 * util-linux and BSD `script(1)` have different command syntaxes. Linux uses
 * `-c` plus `-e` for child-status propagation; BSD takes the command as argv.
 * A shell inside the pty prints the CLI's own status in both cases, so the
 * cancel assertion is about manteen's 130 even where `script` itself returns 0.
 */
import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
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
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const DESTINATION = "src/components/ui/prompted.tsx";
const RECEIPT = "manteen.lock.json";
const INSTALLER_MARKER = ".package-manager-ran";
const REGISTRY_TEXT = "// supplied by the registry\nexport const source = 'registry';\n";
const USER_TEXT = "// hand-written by the user\nexport const source = 'project';\n";
const EXIT_MARKER = "__MANTEEN_PTY_CHILD_EXIT__=";
const QUIET_MS = 250;
const START_DEADLINE_MS = 15_000;
const EXIT_DEADLINE_MS = 30_000;

assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);
assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

const WORK = mkdtempSync(join(tmpdir(), "manteen-pty-prompt-"));
after(() => rmSync(WORK, { recursive: true, force: true }));

const SCRIPT_PROBE =
  process.platform === "win32"
    ? null
    : spawnSync("script", ["--version"], { encoding: "utf8", timeout: 5_000 });
const SCRIPT_EXISTS = SCRIPT_PROBE !== null && SCRIPT_PROBE.error === undefined;
const SCRIPT_VERSION = SCRIPT_PROBE
  ? `${SCRIPT_PROBE.stdout ?? ""}${SCRIPT_PROBE.stderr ?? ""}`.trim()
  : "";
const SCRIPT_STYLE = SCRIPT_VERSION.includes("util-linux")
  ? "util-linux"
  : ["darwin", "freebsd", "openbsd", "netbsd"].includes(process.platform)
    ? "bsd"
    : null;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function scriptArgs(command) {
  if (SCRIPT_STYLE === "util-linux") {
    return ["-q", "-e", "-f", "-c", command, "/dev/null"];
  }
  return ["-q", "/dev/null", "/bin/sh", "-c", command];
}

function probePty() {
  if (process.platform === "win32") {
    return { ok: false, reason: "real Unix pty coverage is intentionally unavailable on win32" };
  }
  if (!SCRIPT_EXISTS) {
    return {
      ok: false,
      reason: "script(1) is unavailable; no supported Unix pty mechanism exists",
    };
  }
  if (SCRIPT_STYLE === null) {
    return {
      ok: false,
      reason: `script(1) is present but is not a supported util-linux/BSD implementation (${SCRIPT_VERSION || "version unknown"})`,
    };
  }

  const marker = "__MANTEEN_PTY_PROBE__";
  const result = spawnSync("script", scriptArgs(`printf '${marker}\\n'`), {
    encoding: "utf8",
    env: { ...process.env, SHELL: "/bin/sh" },
    timeout: 5_000,
  });
  const transcript = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || !transcript.includes(marker)) {
    return {
      ok: false,
      reason:
        `script(1) could not establish the supported ${SCRIPT_STYLE} pty invocation` +
        ` (status=${String(result.status)}, signal=${String(result.signal)}, ` +
        `error=${result.error?.message ?? "none"})`,
    };
  }
  return { ok: true, reason: null };
}

const PTY = probePty();
const PTY_SKIP = PTY.ok ? false : PTY.reason;

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function makeProject(name) {
  const project = join(WORK, name);
  const registry = join(project, "registry");
  const bin = join(project, "sentinel-bin");
  mkdirSync(registry, { recursive: true });
  mkdirSync(bin, { recursive: true });

  write(
    join(registry, "prompted.json"),
    `${JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "prompted",
        type: "registry:ui",
        dependencies: ["@mantine/core@^9"],
        files: [
          {
            path: "src/prompted.tsx",
            type: "registry:ui",
            content: REGISTRY_TEXT,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const registryUrl = `${pathToFileURL(registry).href}/{name}.json`;
  write(
    join(project, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@pty": registryUrl },
        aliases: {
          components: "@/components",
          ui: "@/components/ui",
          hooks: "@/hooks",
          lib: "@/lib",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(project, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/components/ui/*": ["./src/components/ui/*"],
            "@/components/*": ["./src/components/*"],
            "@/hooks/*": ["./src/hooks/*"],
            "@/lib/*": ["./src/lib/*"],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(project, "package.json"),
    `${JSON.stringify(
      {
        name: `pty-${name}`,
        version: "0.0.0",
        private: true,
        packageManager: "npm@10.9.2",
        dependencies: { "@mantine/core": "^9.5.0" },
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(project, "node_modules", "@mantine", "core", "package.json"),
    `${JSON.stringify({ name: "@mantine/core", version: "9.5.0" }, null, 2)}\n`,
  );
  write(join(project, DESTINATION), USER_TEXT);

  // If D17 ever stops filtering the already-declared, already-installed
  // dependency, fail locally before nypm can touch the network.
  const npmShim = join(bin, "npm");
  write(
    npmShim,
    `#!/bin/sh\nprintf 'package manager unexpectedly ran\\n' > ${shellQuote(join(project, INSTALLER_MARKER))}\nexit 97\n`,
  );
  chmodSync(npmShim, 0o755);

  return { project, bin };
}

function manifest(root) {
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        files[relative(root, path).split(sep).join("/")] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex");
      }
    }
  };
  walk(root);
  return files;
}

function evidence(result) {
  return (
    `script=${SCRIPT_STYLE}; cliStatus=${String(result.cliStatus)}; ` +
    `scriptStatus=${String(result.scriptStatus)}; scriptSignal=${String(result.scriptSignal)}; ` +
    `inputAfterOutputBytes=${result.outputBytesAtInput}\n` +
    `--- transcript ---\n${result.transcript}\n--- end transcript ---`
  );
}

function terminateProcessGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function ptyEnvironment(bin) {
  const env = {
    ...process.env,
    CI: undefined,
    CLICOLOR_FORCE: undefined,
    FORCE_COLOR: undefined,
    NO_COLOR: "1",
    SHELL: "/bin/sh",
    TERM: "xterm-256color",
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

function closeResult(child) {
  return new Promise((resolveClose) => {
    child.once("close", (status, signal) => resolveClose({ status, signal }));
  });
}

function waitForOutputQuiescence(child, transcript) {
  return new Promise((resolveReady, rejectReady) => {
    let quietTimer = null;
    const deadline = setTimeout(() => {
      cleanup();
      rejectReady(
        new Error(
          `pty produced no quiescent prompt output within ${START_DEADLINE_MS} ms\n${transcript()}`,
        ),
      );
    }, START_DEADLINE_MS);

    const cleanup = () => {
      clearTimeout(deadline);
      if (quietTimer !== null) clearTimeout(quietTimer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("close", onClose);
    };
    const onData = () => {
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        cleanup();
        resolveReady();
      }, QUIET_MS);
    };
    const onClose = (status, signal) => {
      cleanup();
      rejectReady(
        new Error(
          `pty exited before prompt readiness (status=${String(status)}, signal=${String(signal)})\n${transcript()}`,
        ),
      );
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("close", onClose);
  });
}

async function waitForExit(close, transcript) {
  let timeout = null;
  try {
    return await Promise.race([
      close,
      new Promise((_, rejectExit) => {
        timeout = setTimeout(
          () =>
            rejectExit(
              new Error(
                `pty did not exit within ${EXIT_DEADLINE_MS} ms after input\n${transcript()}`,
              ),
            ),
          EXIT_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

async function runPrompt(project, bin, keys) {
  const argv = [process.execPath, CLI, "add", "@pty/prompted"];
  const command =
    `${argv.map(shellQuote).join(" ")}; manteen_status=$?; ` +
    `printf '\\n${EXIT_MARKER}%s\\n' "$manteen_status"; exit "$manteen_status"`;
  const child = spawn("script", scriptArgs(command), {
    cwd: project,
    detached: true,
    env: ptyEnvironment(bin),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks = [];
  const capture = (chunk) => chunks.push(Buffer.from(chunk));
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const transcript = () => Buffer.concat(chunks).toString("utf8");
  const closed = closeResult(child);

  try {
    await waitForOutputQuiescence(child, transcript);
    const outputBytesAtInput = Buffer.concat(chunks).byteLength;
    assert.ok(outputBytesAtInput > 0, "input must follow observed prompt output");
    child.stdin.write(keys);

    const { status: scriptStatus, signal: scriptSignal } = await waitForExit(closed, transcript);
    const text = transcript();
    const match = text.match(new RegExp(`${EXIT_MARKER}(\\d+)`));
    assert.ok(match, `the pty wrapper did not report the CLI status\n${text}`);
    const cliStatus = Number(match[1]);

    return { cliStatus, scriptStatus, scriptSignal, outputBytesAtInput, transcript: text };
  } finally {
    terminateProcessGroup(child);
  }
}

function assertInstallerFiltered(project) {
  assert.equal(existsSync(join(project, INSTALLER_MARKER)), false, "package manager must not run");
  for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]) {
    assert.equal(existsSync(join(project, lockfile)), false, `${lockfile} must not appear`);
  }
}

test("real pty: bare Enter keeps a differing file", {
  skip: PTY_SKIP,
  timeout: START_DEADLINE_MS + EXIT_DEADLINE_MS + 5_000,
}, async () => {
  const { project, bin } = makeProject("keep");
  const packageBefore = readFileSync(join(project, "package.json"));
  const result = await runPrompt(project, bin, "\r");

  assert.equal(result.cliStatus, 0, evidence(result));
  if (SCRIPT_STYLE === "util-linux") {
    assert.equal(result.scriptStatus, 0, evidence(result));
  }
  assert.equal(readFileSync(join(project, DESTINATION), "utf8"), USER_TEXT, evidence(result));
  assert.ok(result.transcript.includes("skipped"), evidence(result));
  assert.equal(
    Buffer.compare(readFileSync(join(project, "package.json")), packageBefore),
    0,
    evidence(result),
  );
  assertInstallerFiltered(project);
});

test("real pty: Space then Enter selects and overwrites a differing file", {
  skip: PTY_SKIP,
  timeout: START_DEADLINE_MS + EXIT_DEADLINE_MS + 5_000,
}, async () => {
  const { project, bin } = makeProject("overwrite");
  const packageBefore = readFileSync(join(project, "package.json"));
  const result = await runPrompt(project, bin, " \r");

  assert.equal(result.cliStatus, 0, evidence(result));
  if (SCRIPT_STYLE === "util-linux") {
    assert.equal(result.scriptStatus, 0, evidence(result));
  }
  assert.equal(readFileSync(join(project, DESTINATION), "utf8"), REGISTRY_TEXT, evidence(result));
  assert.ok(result.transcript.includes("written"), evidence(result));
  assert.ok(existsSync(join(project, RECEIPT)), evidence(result));
  assert.equal(
    Buffer.compare(readFileSync(join(project, "package.json")), packageBefore),
    0,
    evidence(result),
  );
  assertInstallerFiltered(project);
});

test("real pty: Ctrl-C exits 130 and mutates nothing", {
  skip: PTY_SKIP,
  timeout: START_DEADLINE_MS + EXIT_DEADLINE_MS + 5_000,
}, async () => {
  const { project, bin } = makeProject("cancel");
  const before = manifest(project);
  const result = await runPrompt(project, bin, "\x03");

  assert.equal(result.cliStatus, 130, evidence(result));
  if (SCRIPT_STYLE === "util-linux") {
    assert.equal(result.scriptStatus, 130, evidence(result));
  }
  assert.deepEqual(manifest(project), before, evidence(result));
  assert.ok(result.transcript.includes("Cancelled"), evidence(result));
  assertInstallerFiltered(project);
});
