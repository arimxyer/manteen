#!/usr/bin/env node
/**
 * Build every house item in a fresh Vite consumer at one approved Mantine
 * boundary. The consumer, its package manager cache state, and generated
 * registry all live under a temporary directory; this repository is never a
 * consumer install target.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const version = process.argv[2];
if (version !== "9.5.0" && version !== "9.5.2") {
  throw new Error("usage: node scripts/verify-house-mantine-range.mjs <9.5.0|9.5.2>");
}

const REPO_ROOT = resolve(import.meta.dirname, "..");
const KIT = join(REPO_ROOT, "packages", "registry-kit", "dist", "cli.mjs");
const CLI = join(REPO_ROOT, "packages", "cli", "dist", "cli.mjs");
const CATALOG = join(REPO_ROOT, "manteen.registry.json");
const mantinePackages = [
  "@mantine/carousel",
  "@mantine/core",
  "@mantine/dropzone",
  "@mantine/form",
  "@mantine/hooks",
];

for (const artifact of [KIT, CLI]) {
  if (!existsSync(artifact)) {
    throw new Error(
      `verify-house-mantine-range: ${artifact} is missing; build both packages first.`,
    );
  }
}

const scratch = mkdtempSync(join(tmpdir(), `manteen-house-${version}-`));
const registry = join(scratch, "registry");
const consumer = join(scratch, "consumer");

function run(command, args, cwd = REPO_ROOT) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1", npm_config_loglevel: "error" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(`verify-house-mantine-range: ${message}`);
}

try {
  process.stdout.write(run(process.execPath, [KIT, "build", CATALOG, registry]));
  process.stdout.write(
    run("npm", ["create", "vite@9.1.1", "consumer", "--", "--template", "react-ts"], scratch),
  );
  run("npm", ["install"], consumer);
  run(
    "npm",
    ["install", "--save-exact", ...mantinePackages.map((name) => `${name}@${version}`)],
    consumer,
  );
  process.stdout.write(
    run(process.execPath, [CLI, "init", "--cwd", consumer, "--yes", "--pm", "npm"]),
  );

  const configPath = join(consumer, "manteen.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.registries = {
    "@house": {
      // URL encoders escape braces, but the config contract requires the
      // literal `{name}` template token.
      url: `${pathToFileURL(registry).href}/{name}.json`,
      index: pathToFileURL(join(registry, "registry.json")).href,
    },
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const index = JSON.parse(readFileSync(join(registry, "registry.json"), "utf8"));
  const ids = index.items.map((item) => `@house/${item.name}`);
  process.stdout.write(
    run(process.execPath, [CLI, "add", ...ids, "--cwd", consumer, "--yes", "--pm", "npm"]),
  );

  for (const name of mantinePackages) {
    const installed = JSON.parse(
      readFileSync(join(consumer, "node_modules", name, "package.json"), "utf8"),
    );
    expect(installed.version === version, `${name} resolved ${installed.version}, not ${version}`);
  }

  writeFileSync(
    join(consumer, "src", "App.tsx"),
    `import { MantineProvider } from "@mantine/core";

const houseModules = import.meta.glob(
  ["./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  { eager: true },
);

export default function App() {
  return <MantineProvider><p>{Object.keys(houseModules).length} house modules bundled.</p></MantineProvider>;
}
`,
  );
  process.stdout.write(run("npm", ["run", "build"], consumer));
  expect(ids.length === 22, `expected 22 house items, received ${ids.length}`);
  process.stdout.write(`\nverify-house-mantine-range: full house passed at ${version}.\n`);
} catch (error) {
  if (error && typeof error === "object") {
    if ("stdout" in error && error.stdout) process.stderr.write(String(error.stdout));
    if ("stderr" in error && error.stderr) process.stderr.write(String(error.stderr));
  }
  throw error;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
