/**
 * Wave 7's packed-consumer smoke, opt-in by package manager.
 *
 * The ordinary built-Node glob leaves this test skipped. CI selects exactly one
 * real manager with MANTEEN_E2E_PM=npm|pnpm|yarn|bun after explicitly building
 * both packages. The opt-in job runs this file by itself because `npm pack`
 * deliberately exercises each package's `prepare`; tsdown's clean must never
 * race a parallel test that is executing the same dist.
 *
 * All tarballs, registry files, package-manager state and node_modules (when the
 * selected manager uses one) live below mkdtemp roots. Nothing stages or links
 * dependencies into this repository.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { childEnv } from "./helpers/child-env.mjs";

// Matches the workflow provisioning exactly. In particular, pnpm 11 requires
// Node 22.13 while this matrix deliberately exercises the Node 22.12 floor.
const PACKAGE_MANAGER_VERSIONS = {
  npm: "10.9.2",
  pnpm: "10.30.1",
  yarn: "4.9.2",
  bun: "1.3.14",
};
const PACKAGE_MANAGERS = new Set(Object.keys(PACKAGE_MANAGER_VERSIONS));
const SELECTED_PM = process.env.MANTEEN_E2E_PM;
const IS_WINDOWS = process.platform === "win32";
const COMMAND_TIMEOUT_MS = 3 * 60_000;
const TEST_TIMEOUT_MS = 10 * 60_000;

const CLI_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..", "..");
const KIT_ROOT = join(REPO_ROOT, "packages", "registry-kit");
// Receipt destinations are canonical POSIX paths on every host. Node accepts
// this spelling when it is joined to the disposable root for disk assertions.
const PACKED_FILE = "src/components/ui/portable-smoke.tsx";
const PACKED_SOURCE = 'export const portableSmoke = "packed-consumer";\n';
const CARET_DEPENDENCY = "is-number";
const CARET_RANGE = "^7.0.0";

assert.equal(
  process.versions.bun,
  undefined,
  "the packed-consumer e2e must run under Node, not Bun",
);

function executable(name) {
  return IS_WINDOWS ? `${name}.cmd` : name;
}

function commandLine(command, args) {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function run(command, args, { cwd, label, timeout = COMMAND_TIMEOUT_MS }) {
  // Windows command shims are batch files, not directly executable programs.
  // Drive the exact `.cmd` through cmd.exe; the caret-range assertion below
  // then covers the CLI's own nypm -> package-manager argv boundary.
  const isCommandShim = IS_WINDOWS && command.toLowerCase().endsWith(".cmd");
  const childCommand = isCommandShim ? (process.env.ComSpec ?? "cmd.exe") : command;
  const childArgs = isCommandShim
    ? ["/d", "/c", command.includes(" ") ? `"${command}"` : command, ...args]
    : args;
  const result = spawnSync(childCommand, childArgs, {
    cwd,
    encoding: "utf8",
    env: childEnv({
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
    }),
    maxBuffer: 20 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const transcript = [
    `${label}: ${commandLine(command, args)}`,
    `cwd: ${cwd}`,
    `status: ${String(result.status)} signal: ${String(result.signal)}`,
    result.error ? `spawn error: ${result.error.stack ?? result.error.message}` : "",
    stdout ? `stdout:\n${stdout}` : "stdout: <empty>",
    stderr ? `stderr:\n${stderr}` : "stderr: <empty>",
  ]
    .filter(Boolean)
    .join("\n");

  assert.equal(result.error, undefined, transcript);
  assert.equal(result.status, 0, transcript);
  return { stdout, stderr, transcript };
}

function pack(packageRoot, outputRoot) {
  const packed = run(
    executable("npm"),
    ["pack", "--pack-destination", outputRoot, "--json", packageRoot],
    { cwd: outputRoot, label: `pack ${packageRoot}` },
  );

  let report;
  try {
    // npm 10 lets `prepare` stdout precede the requested JSON report. Locate
    // the first standalone JSON opener rather than pretending lifecycle output
    // cannot share stdout; npm 12 starts directly at the same opener.
    const lines = packed.stdout.split(/\r?\n/);
    const start = lines.findIndex((line) => line === "[" || line === "{");
    assert.notEqual(start, -1, `${packed.transcript}\nnpm pack emitted no JSON report`);
    report = JSON.parse(lines.slice(start).join("\n"));
  } catch (error) {
    assert.fail(
      `${packed.transcript}\nnpm pack did not emit JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // npm 10/11 emit an array here; npm 12 emits an object keyed by package
  // name when packing a directory. Both carry the same packument value.
  const entries = Array.isArray(report) ? report : Object.values(report);
  assert.equal(entries.length, 1, packed.transcript);
  assert.equal(typeof entries[0]?.filename, "string", packed.transcript);

  const tarball = resolve(outputRoot, entries[0].filename);
  assert.equal(existsSync(tarball), true, `npm pack reported a missing tarball: ${tarball}`);
  return tarball;
}

function managerInstallArgs(pm, tarballs) {
  switch (pm) {
    case "npm":
      return ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs];
    case "pnpm":
      return ["add", "--ignore-scripts", "--reporter=append-only", ...tarballs];
    case "yarn":
      // `.yarnrc.yml#enableScripts` owns the lifecycle policy for Yarn.
      return ["add", ...tarballs];
    case "bun":
      return ["add", "--ignore-scripts", ...tarballs];
    default:
      assert.fail(`unsupported package manager: ${pm}`);
  }
}

function localKitResolution(pm, kitTarball) {
  const kitSpec = pathToFileURL(kitTarball).href;
  switch (pm) {
    case "npm":
      // npm uses the already-installed direct tarball to satisfy the range.
      return {};
    case "pnpm":
      // pnpm reads root overrides from pnpm-workspace.yaml; written below.
      return {};
    case "yarn":
      return { resolutions: { "manteen-kit": kitSpec } };
    case "bun":
      return { overrides: { "manteen-kit": kitSpec } };
    default:
      assert.fail(`unsupported package manager: ${pm}`);
  }
}

function installedBin(consumer, name) {
  return join(consumer, "node_modules", ".bin", `${name}${IS_WINDOWS ? ".cmd" : ""}`);
}

function runPackedBin(pm, consumer, name, args, label) {
  if (pm === "yarn") {
    // Yarn PnP has no node_modules/.bin. Invoking the binary through Yarn is
    // what supplies the PnP loader to the packed CLI and packed kit.
    return run(executable("yarn"), [name, ...args], { cwd: consumer, label });
  }

  const bin = installedBin(consumer, name);
  assert.equal(existsSync(bin), true, `${pm} did not install ${bin}`);
  return run(bin, args, { cwd: consumer, label });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test(`packed consumer installs and runs with ${SELECTED_PM ?? "no selected package manager"}`, {
  skip:
    SELECTED_PM === undefined
      ? "set MANTEEN_E2E_PM to npm, pnpm, yarn or bun to run the packed-consumer smoke"
      : false,
  timeout: TEST_TIMEOUT_MS,
}, () => {
  assert.ok(
    PACKAGE_MANAGERS.has(SELECTED_PM),
    `MANTEEN_E2E_PM must be npm, pnpm, yarn or bun; received ${JSON.stringify(SELECTED_PM)}`,
  );
  const pm = SELECTED_PM;

  assert.equal(
    existsSync(join(KIT_ROOT, "dist", "cli.mjs")),
    true,
    "manteen-kit dist is missing; build both packages before the packed-consumer smoke",
  );
  assert.equal(
    existsSync(join(CLI_ROOT, "dist", "cli.mjs")),
    true,
    "manteen dist is missing; build both packages before the packed-consumer smoke",
  );

  const packRoot = mkdtempSync(join(tmpdir(), "manteen-packed-tarballs-"));
  const consumer = mkdtempSync(join(tmpdir(), `manteen-packed-${pm}-`));

  try {
    const versionResult = run(executable(pm), ["--version"], {
      cwd: consumer,
      label: `${pm} version`,
    });
    const observedManagerVersion = versionResult.stdout.trim();
    assert.match(observedManagerVersion, /^\d+\.\d+\.\d+(?:[-+].*)?$/, versionResult.transcript);

    const kitTarball = pack(KIT_ROOT, packRoot);
    const cliTarball = pack(CLI_ROOT, packRoot);
    writeJson(join(consumer, "package.json"), {
      name: `manteen-packed-${pm}-consumer`,
      version: "0.0.0",
      private: true,
      type: "module",
      // Declared independently of the executable lookup above. CI provisions
      // this exact map; local probes may intentionally run a newer binary.
      packageManager: `${pm}@${PACKAGE_MANAGER_VERSIONS[pm]}`,
      // The kit does not exist on npm before W8's kit-first publish. Each
      // manager's ordinary resolution field keeps this pre-publish smoke
      // hermetic while leaving the packed client's real ^0.1.0 edge intact.
      ...localKitResolution(pm, kitTarball),
    });
    if (pm === "yarn") {
      writeFileSync(join(consumer, ".yarnrc.yml"), "nodeLinker: pnp\nenableScripts: false\n");
    }
    if (pm === "pnpm") {
      writeFileSync(
        join(consumer, "pnpm-workspace.yaml"),
        `overrides:\n  manteen-kit: ${JSON.stringify(pathToFileURL(kitTarball).href)}\n`,
      );
    }

    // Mirrors the release order. pnpm and Bun do not use a sibling tarball in
    // the same `add` argv to satisfy manteen's semver edge; installing the kit
    // first makes that already-declared local package the resolution candidate.
    run(executable(pm), managerInstallArgs(pm, [kitTarball]), {
      cwd: consumer,
      label: `install packed kit with ${pm}`,
    });
    run(executable(pm), managerInstallArgs(pm, [cliTarball]), {
      cwd: consumer,
      label: `install packed client with ${pm}`,
    });

    const afterPackedInstall = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
    assert.equal(typeof afterPackedInstall.dependencies?.["manteen-kit"], "string");
    assert.equal(typeof afterPackedInstall.dependencies?.manteen, "string");

    if (pm === "yarn") {
      assert.equal(
        existsSync(join(consumer, ".pnp.cjs")),
        true,
        "the Yarn lane must be a real PnP install before invoking the packed CLI",
      );
      assert.equal(
        existsSync(join(consumer, "node_modules")),
        false,
        "the Yarn PnP lane must not degrade into a node_modules install",
      );
    }

    const authoringRoot = join(consumer, "registry-source");
    const authoringFile = join(authoringRoot, "src", "portable-smoke.tsx");
    mkdirSync(dirname(authoringFile), { recursive: true });
    writeFileSync(authoringFile, PACKED_SOURCE);

    const catalog = join(authoringRoot, "manteen.registry.json");
    writeJson(catalog, {
      name: "packed-consumer-smoke",
      namespace: "@packed",
      items: [
        {
          name: "portable-smoke",
          kind: "component",
          title: "Portable Smoke",
          mantine: ">=9",
          npm: [`@mantine/core@^9.5.0`, `${CARET_DEPENDENCY}@${CARET_RANGE}`],
          files: [{ path: "src/portable-smoke.tsx", as: "component" }],
        },
      ],
    });

    const registryRoot = join(consumer, "registry-output");
    runPackedBin(
      pm,
      consumer,
      "manteen-kit",
      ["build", catalog, registryRoot],
      "compile hermetic file registry with packed kit",
    );
    assert.equal(existsSync(join(registryRoot, "portable-smoke.json")), true);

    writeJson(join(consumer, "tsconfig.json"), {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/components/ui/*": ["./src/components/ui/*"],
          "@/components/*": ["./src/components/*"],
          "@/hooks/*": ["./src/hooks/*"],
          "@/lib/*": ["./src/lib/*"],
        },
      },
    });
    writeJson(join(consumer, "manteen.json"), {
      registries: {
        "@packed": `${pathToFileURL(registryRoot).href}/{name}.json`,
      },
      aliases: {
        components: "@/components",
        ui: "@/components/ui",
        hooks: "@/hooks",
        lib: "@/lib",
      },
    });

    const added = runPackedBin(
      pm,
      consumer,
      "manteen",
      ["add", "@packed/portable-smoke", "--yes", "--pm", pm],
      `run packed client and let it install dependencies with ${pm}`,
    );

    assert.equal(
      readFileSync(join(consumer, PACKED_FILE), "utf8"),
      PACKED_SOURCE,
      added.transcript,
    );

    const receipt = JSON.parse(readFileSync(join(consumer, "manteen.lock.json"), "utf8"));
    assert.equal(receipt.lockfileVersion, 1, added.transcript);
    assert.equal(receipt.items.length, 1, added.transcript);
    assert.equal(receipt.items[0].id, "@packed/portable-smoke", added.transcript);
    assert.equal(receipt.items[0].files.length, 1, added.transcript);
    assert.equal(receipt.items[0].files[0].destination, PACKED_FILE, added.transcript);

    const finalPackage = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
    assert.equal(
      finalPackage.dependencies?.[CARET_DEPENDENCY],
      CARET_RANGE,
      `${pm} did not preserve the literal caret range in package.json\n${added.transcript}`,
    );

    if (pm === "yarn") {
      assert.match(added.stderr, /warn {2}mantine-version-unknown/, added.transcript);
      assert.match(added.stderr, /Yarn Plug'n'Play/, added.transcript);
      assert.equal(
        added.stderr.includes("not installed"),
        false,
        `the PnP warning must not describe an npm-style missing install\n${added.transcript}`,
      );
      assert.equal(
        existsSync(join(consumer, "node_modules")),
        false,
        "running the packed CLI must preserve Yarn PnP's node_modules-free install",
      );
    }
  } finally {
    rmSync(packRoot, { recursive: true, force: true });
    rmSync(consumer, { recursive: true, force: true });
  }
});
