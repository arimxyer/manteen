#!/usr/bin/env node
/**
 * Disposable author-guide dogfood.
 *
 * Builds the committed starter with the built kit, initializes a fresh Vite
 * project with the built CLI, installs the item by direct file URL, renders it,
 * production-builds, checks receipt-owned theme/styles/files, updates, and
 * finishes with a clean diff. Every consumer byte lives under mkdtemp().
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const KIT = join(REPO_ROOT, "packages", "registry-kit", "dist", "cli.mjs");
const CLI = join(REPO_ROOT, "packages", "cli", "dist", "cli.mjs");
const CATALOG = join(REPO_ROOT, "examples", "registry-starter", "manteen.registry.json");

for (const artifact of [KIT, CLI]) {
  if (!existsSync(artifact)) {
    throw new Error(`verify-registry-starter: ${artifact} is missing; build both packages first.`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), "manteen-docs-guide-"));
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
  if (!condition) throw new Error(`verify-registry-starter: ${message}`);
}

try {
  process.stdout.write(run(process.execPath, [KIT, "build", CATALOG, registry]));
  process.stdout.write(
    run("npm", ["create", "vite@9.1.1", "consumer", "--", "--template", "react-ts"], scratch),
  );
  run("npm", ["install"], consumer);

  process.stdout.write(
    run(process.execPath, [CLI, "init", "--cwd", consumer, "--yes", "--pm", "npm"]),
  );

  const itemUrl = pathToFileURL(join(registry, "release-panel.json")).href;
  process.stdout.write(run(process.execPath, [CLI, "info", itemUrl, "--cwd", consumer]));
  process.stdout.write(
    run(process.execPath, [CLI, "add", itemUrl, "--cwd", consumer, "--yes", "--pm", "npm"]),
  );

  writeFileSync(
    join(consumer, "src", "App.tsx"),
    `import { Container } from "@mantine/core";
import { ReleasePanel } from "@/components/ui/release-panel";

export default function App() {
  return (
    <Container py="xl" size="sm">
      <ReleasePanel
        version="0.2"
        highlights={[
          {
            id: "registries",
            category: "Authoring",
            title: "Share Mantine source",
            description: "Components, hooks, styles and theme contributions install together.",
          },
          {
            id: "maintenance",
            category: "Maintenance",
            title: "Keep local ownership visible",
            description: "Receipts make diff and update explicit after installation.",
          },
        ]}
      />
    </Container>
  );
}
`,
    "utf8",
  );

  process.stdout.write(run("npm", ["run", "build"], consumer));

  const managedStyles = readFileSync(join(consumer, "src", "manteen.css"), "utf8");
  const theme = readFileSync(join(consumer, "src", "lib", "theme.ts"), "utf8");
  const receipt = readFileSync(join(consumer, "manteen.lock.json"), "utf8");
  expect(
    managedStyles.includes('@import "@mantine/carousel/styles.css";'),
    "Carousel styles missing",
  );
  expect(theme.includes("Paper.extend"), "theme fragment was not folded into the consumer theme");
  expect(receipt.includes(itemUrl), "direct item URL missing from the install receipt");
  expect(existsSync(join(consumer, "src", "hooks", "use-release-carousel.ts")), "hook missing");
  expect(
    existsSync(join(consumer, "src", "components", "ui", "release-panel.tsx")),
    "component missing",
  );

  process.stdout.write(
    run(process.execPath, [CLI, "update", itemUrl, "--cwd", consumer, "--yes", "--pm", "npm"]),
  );
  const diff = run(process.execPath, [CLI, "diff", "--cwd", consumer, "--stat"]);
  process.stdout.write(diff);
  expect(diff.includes("No changes."), "final diff was not clean");

  process.stdout.write("\nverify-registry-starter: disposable consumer passed.\n");
} catch (error) {
  if (error && typeof error === "object") {
    if ("stdout" in error && error.stdout) process.stderr.write(String(error.stdout));
    if ("stderr" in error && error.stderr) process.stderr.write(String(error.stderr));
  }
  throw error;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
