/**
 * W6 init under the shipped runtime: built dist, real Node, real temp files.
 *
 * Fixture provenance is intentionally point-in-time rather than `@latest`:
 * create-vite 9.1.1, create-next-app 16.2.12, and create-react-router 8.3.0,
 * observed 2026-07-29 in docs/handoffs/w6-init-handoff.md. These compact fixtures keep
 * the generated entry seams that init transforms; they are not claimed as full
 * generator archives or as live evidence that those generators still match.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
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
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { compileRegistry, writeRegistry } from "manteen-kit";
import { loadConfig } from "../dist/index.mjs";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const projects = [];

assert.equal(process.versions.bun, undefined, "init e2e must run under Node");
assert.ok(existsSync(CLI), `${CLI} is missing; build the CLI before the e2e tier.`);

after(() => {
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

function project(name) {
  const root = mkdtempSync(join(tmpdir(), `manteen-init-${name}-`));
  projects.push(root);
  return root;
}

function write(root, path, content) {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

function initDependencies(extraDependencies = {}, extraDevDependencies = {}) {
  return {
    private: true,
    dependencies: {
      "@mantine/core": "^9",
      "@mantine/hooks": "^9",
      ...extraDependencies,
    },
    devDependencies: {
      "postcss-preset-mantine": "^1",
      "postcss-simple-vars": "^7",
      ...extraDevDependencies,
    },
  };
}

function packageFile(generator, extraDependencies = {}, extraDevDependencies = {}) {
  return `${JSON.stringify(
    {
      name: "w6-built-node-fixture",
      version: "0.0.0",
      manteenFixture: { generator, observed: "2026-07-29" },
      ...initDependencies(extraDependencies, extraDevDependencies),
    },
    null,
    2,
  )}\n`;
}

function runCommand(root, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    env: childEnv(extraEnv),
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    all: `${result.stdout}\n${result.stderr}`,
  };
}

function fakePackageManager(root) {
  const bin = join(root, "fake-bin");
  write(
    root,
    "fake-bin/fake-package-manager.mjs",
    `process.stdout.write("FAKE_PM_STDOUT\\n");
process.stderr.write("FAKE_PM_STDERR\\n");
process.exit(process.env.FAKE_PM_FAIL === "1" ? 17 : 0);
`,
  );
  write(
    root,
    "fake-bin/aube",
    `#!/usr/bin/env node
await import(${JSON.stringify(pathToFileURL(join(bin, "fake-package-manager.mjs")).href)});
`,
  );
  if (process.platform !== "win32") chmodSync(join(bin, "aube"), 0o755);
  write(
    root,
    "fake-bin/aube.cmd",
    `@echo off\r\n"${process.execPath}" "%~dp0\\fake-package-manager.mjs" %*\r\n`,
  );
  return bin;
}

function run(root, args) {
  return runCommand(root, ["init", "--cwd", root, ...args]);
}

function json(result) {
  assert.equal(result.stderr, "", result.all);
  const document = JSON.parse(result.stdout);
  return new Proxy(document, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      return target.payload?.[property];
    },
  });
}

function manifest(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else entries.push([relative(root, path), readFileSync(path).toString("base64")]);
    }
  }
  visit(root);
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const NEXT_APP_LAYOUT = `import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });
export const metadata: Metadata = { title: "Keep this metadata" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
`;

const NEXT_PAGES_APP = `import "@/styles/globals.css";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`;

const NEXT_PAGES_DOCUMENT = `import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
`;

const REACT_ROUTER_ROOT = `import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  if (isRouteErrorResponse(error)) return <p>{error.status}</p>;
  return <p>Keep this boundary</p>;
}
`;

function viteFixture() {
  const root = project("vite");
  write(root, "package.json", packageFile("create-vite@9.1.1", {}, { vite: "^8" }));
  write(root, "index.html", '<div id="root"></div>\n');
  write(root, "src/main.tsx", "import './App';\n");
  write(root, "src/App.tsx", "export default function App() { return <main>Keep Vite</main>; }\n");
  write(root, "tsconfig.app.json", '{"compilerOptions":{"jsx":"react-jsx"}}\n');
  write(
    root,
    "vite.config.ts",
    'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n',
  );
  return { root, preserved: ["src/App.tsx", "Keep Vite"], complete: true };
}

function nextAppFixture() {
  const root = project("next-app");
  write(root, "package.json", packageFile("create-next-app@16.2.12", { next: "^16" }));
  write(root, "tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["./*"]}}}\n');
  write(root, "app/layout.tsx", NEXT_APP_LAYOUT);
  write(
    root,
    "postcss.config.mjs",
    'export default { plugins: { "@tailwindcss/postcss": {} } };\n',
  );
  return { root, preserved: ["app/layout.tsx", "Keep this metadata"], complete: false };
}

function nextPagesFixture() {
  const root = project("next-pages");
  write(root, "package.json", packageFile("create-next-app@16.2.12", { next: "^16" }));
  write(root, "tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}\n');
  write(root, "src/pages/_app.tsx", NEXT_PAGES_APP);
  write(root, "src/pages/_document.tsx", NEXT_PAGES_DOCUMENT);
  write(root, "src/styles/globals.css", "/* keep */\n");
  return { root, preserved: ["src/styles/globals.css", "/* keep */"], complete: true };
}

function nextHybridFixture() {
  const root = project("next-hybrid");
  write(root, "package.json", packageFile("create-next-app@16.2.12", { next: "^16" }));
  write(root, "tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["./*"]}}}\n');
  write(root, "app/layout.tsx", NEXT_APP_LAYOUT);
  write(root, "pages/_app.tsx", NEXT_PAGES_APP);
  write(root, "pages/_document.tsx", NEXT_PAGES_DOCUMENT);
  write(root, "styles/globals.css", "/* keep hybrid */\n");
  return { root, preserved: ["styles/globals.css", "keep hybrid"], complete: true };
}

function reactRouterFixture() {
  const root = project("react-router");
  write(
    root,
    "package.json",
    packageFile(
      "create-react-router@8.3.0",
      { "react-router": "^8" },
      { "@react-router/dev": "^8", vite: "^8" },
    ),
  );
  write(root, "react-router.config.ts", "export default {};\n");
  write(root, "app/root.tsx", REACT_ROUTER_ROOT);
  write(root, "app/app.css", "/* keep React Router CSS */\n");
  write(root, "tsconfig.json", '{"compilerOptions":{"paths":{"~/*":["./app/*"]}}}\n');
  write(
    root,
    "vite.config.ts",
    'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [], resolve: { tsconfigPaths: true } });\n',
  );
  return { root, preserved: ["app/root.tsx", "Keep this boundary"], complete: true };
}

for (const [name, make] of [
  ["Vite", viteFixture],
  ["Next App", nextAppFixture],
  ["Next Pages", nextPagesFixture],
  ["Next hybrid", nextHybridFixture],
  ["React Router", reactRouterFixture],
]) {
  test(`${name}: dry-run is byte-identical, apply loads, and run two is empty`, () => {
    const fixture = make();
    const before = manifest(fixture.root);

    const previewResult = run(fixture.root, ["--dry-run", "--yes", "--json"]);
    assert.equal(previewResult.status, 0, previewResult.all);
    const preview = json(previewResult);
    assert.equal(preview.command, "init");
    assert.ok(preview.plan.files.length > 0, previewResult.stdout);
    assert.match(preview.planDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(manifest(fixture.root), before, "dry-run changed the fixture tree");

    const appliedResult = run(fixture.root, [
      "--yes",
      "--expect-plan",
      preview.planDigest,
      "--json",
    ]);
    assert.equal(appliedResult.status, 0, appliedResult.all);
    const applied = json(appliedResult);
    assert.equal(applied.ok, true);
    assert.equal(applied.planDigest, preview.planDigest);
    assert.equal(applied.complete, fixture.complete);
    if (!fixture.complete) {
      assert.ok(applied.instructions.some((entry) => entry.code === "tailwind-postcss"));
    }

    const loaded = loadConfig(fixture.root);
    assert.equal(loaded.ok, true, JSON.stringify(loaded));
    assert.ok(
      readFileSync(join(fixture.root, fixture.preserved[0]), "utf8").includes(fixture.preserved[1]),
    );

    const secondResult = run(fixture.root, ["--dry-run", "--yes", "--json"]);
    assert.equal(secondResult.status, 0, secondResult.all);
    const second = json(secondResult);
    assert.deepEqual(second.plan.files, []);
    assert.deepEqual(second.plan.dependencies, []);
  });
}

test("init emits a list-ready house registry and the built list consumes its index", () => {
  const fixture = viteFixture();
  const applied = run(fixture.root, ["--yes", "--json"]);
  assert.equal(applied.status, 0, applied.all);

  const configPath = join(fixture.root, "manteen.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.deepEqual(config.registries["@house"], {
    url: "https://arimxyer.github.io/manteen/r/{name}.json",
    index: "https://arimxyer.github.io/manteen/r/registry.json",
  });

  const compiled = compileRegistry(join(REPO_ROOT, "manteen.registry.json"));
  assert.deepEqual(compiled.failures, [], "the house registry must compile for the list seam");
  const registryRoot = join(fixture.root, "registry");
  writeRegistry(compiled, registryRoot);
  const base = pathToFileURL(registryRoot).href;
  config.registries["@house"] = {
    url: `${base}/{name}.json`,
    index: `${base}/registry.json`,
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const listed = runCommand(fixture.root, ["list", "--cwd", fixture.root, "--json"]);
  assert.equal(listed.status, 0, listed.all);
  const document = json(listed);
  assert.equal(document.registries[0]?.namespace, "@house");
  assert.ok(
    document.registries[0]?.items.some((item) => item.id === "@house/data-table"),
    listed.stdout,
  );
  assert.equal(
    document.notes.some((note) => note.code === "no-index"),
    false,
    listed.stdout,
  );
});

test("init safely migrates the exact legacy house registry string", () => {
  const fixture = viteFixture();
  const first = run(fixture.root, ["--yes", "--json"]);
  assert.equal(first.status, 0, first.all);

  const configPath = join(fixture.root, "manteen.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.registries["@house"] = "https://arimxyer.github.io/manteen/r/{name}.json";
  config.registries["@other"] = "https://example.com/r/{name}.json";
  config.resolutions = { "empty-state": "@house/empty-state" };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const migratedResult = run(fixture.root, ["--yes", "--json"]);
  assert.equal(migratedResult.status, 0, migratedResult.all);
  const migratedDocument = json(migratedResult);
  assert.deepEqual(
    migratedDocument.plan.files.map((file) => file.path),
    ["manteen.json"],
  );

  const migrated = JSON.parse(readFileSync(configPath, "utf8"));
  assert.deepEqual(migrated.registries["@house"], {
    url: "https://arimxyer.github.io/manteen/r/{name}.json",
    index: "https://arimxyer.github.io/manteen/r/registry.json",
  });
  assert.equal(migrated.registries["@other"], "https://example.com/r/{name}.json");
  assert.deepEqual(migrated.resolutions, { "empty-state": "@house/empty-state" });
  assert.equal(loadConfig(fixture.root).ok, true);

  const second = json(run(fixture.root, ["--dry-run", "--yes", "--json"]));
  assert.deepEqual(second.plan.files, []);
  assert.deepEqual(second.plan.dependencies, []);
});

test("init additively completes a partial config while preserving its custom registry", () => {
  const fixture = viteFixture();
  write(
    fixture.root,
    "manteen.json",
    `${JSON.stringify(
      {
        registries: {
          "@probe": {
            url: "https://example.com/r/{name}.json",
            index: "https://example.com/r/registry.json",
          },
        },
        aliases: {
          components: "@/components",
          ui: "@/components/ui",
          hooks: "@/hooks",
          lib: "@/lib",
        },
        tsconfig: "tsconfig.app.json",
        resolutions: { card: "@probe/card" },
      },
      null,
      2,
    )}\n`,
  );

  const result = run(fixture.root, ["--yes", "--json"]);
  assert.equal(result.status, 0, result.all);
  const document = json(result);
  assert.equal(document.ok, true);

  const config = JSON.parse(readFileSync(join(fixture.root, "manteen.json"), "utf8"));
  assert.deepEqual(config.registries["@probe"], {
    url: "https://example.com/r/{name}.json",
    index: "https://example.com/r/registry.json",
  });
  assert.deepEqual(config.registries["@house"], {
    url: "https://arimxyer.github.io/manteen/r/{name}.json",
    index: "https://arimxyer.github.io/manteen/r/registry.json",
  });
  assert.equal(config.theme, "src/lib/theme.ts");
  assert.equal(config.styles, "src/manteen.css");
  assert.deepEqual(config.resolutions, { card: "@probe/card" });
  assert.equal(loadConfig(fixture.root).ok, true);
});

test("a missing ownership field refuses truthfully with a machine config patch", () => {
  const fixture = viteFixture();
  write(
    fixture.root,
    "manteen.json",
    `${JSON.stringify(
      {
        registries: {
          "@probe": "https://example.com/r/{name}.json",
        },
        theme: "src/lib/theme.ts",
        styles: "src/manteen.css",
        tsconfig: "tsconfig.app.json",
      },
      null,
      2,
    )}\n`,
  );
  const before = manifest(fixture.root);

  const result = run(fixture.root, ["--dry-run", "--yes", "--json"]);
  assert.equal(result.status, 2, result.all);
  const document = json(result);
  const diagnostic = document.diagnostics.find((entry) => entry.code === "init-config-conflict");
  assert.ok(diagnostic, result.stdout);
  assert.match(diagnostic.message, /does not declare `aliases`/);
  assert.doesNotMatch(diagnostic.message, /has an explicit value/);
  assert.deepEqual(diagnostic.actions, [
    {
      kind: "configPatch",
      patch: {
        aliases: {
          components: "@/components",
          ui: "@/components/ui",
          hooks: "@/hooks",
          lib: "@/lib",
        },
      },
    },
  ]);
  assert.equal(document.mutated, false);
  assert.deepEqual(manifest(fixture.root), before);
});

for (const [label, fail] of [
  ["success", false],
  ["failure", true],
]) {
  test(`init --json isolates real package-manager output on ${label}`, () => {
    const fixture = viteFixture();
    write(
      fixture.root,
      "package.json",
      `${JSON.stringify(
        {
          private: true,
          devDependencies: { vite: "^8" },
        },
        null,
        2,
      )}\n`,
    );
    const bin = fakePackageManager(fixture.root);
    const result = runCommand(
      fixture.root,
      ["init", "--cwd", fixture.root, "--yes", "--json", "--pm", "aube"],
      {
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        FAKE_PM_FAIL: fail ? "1" : undefined,
      },
    );

    assert.equal(result.status, fail ? 1 : 0, result.all);
    assert.ok(result.stdout.trimStart().startsWith("{"), result.stdout);
    const document = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(document).sort(), [
      "command",
      "diagnostics",
      "errors",
      "exitCode",
      "mutated",
      "notes",
      "ok",
      "payload",
      "root",
      "schemaVersion",
    ]);
    assert.equal(document.ok, !fail);
    assert.equal(document.exitCode, fail ? 1 : 0);
    assert.equal(result.stderr, "", result.all);
    if (fail) {
      assert.match(document.errors[0]?.message ?? "", /FAKE_PM_STDOUT/);
      assert.match(document.errors[0]?.message ?? "", /FAKE_PM_STDERR/);
    } else assert.doesNotMatch(result.stdout, /FAKE_PM_STDOUT|FAKE_PM_STDERR/);
  });
}

test("a dry-run source refusal is truthful and zero-mutation in the built binary", () => {
  const root = project("refusal");
  write(root, "package.json", packageFile("create-vite@9.1.1", {}, { vite: "^8" }));
  write(root, "index.html", '<div id="root"></div>\n');
  write(root, "src/main.tsx", "import './App';\n");
  write(root, "src/App.tsx", "export default chooseAtRuntime();\n");
  write(root, "tsconfig.app.json", '{"compilerOptions":{}}\n');
  write(root, "vite.config.ts", "export default {};\n");
  const before = manifest(root);

  const result = run(root, ["--dry-run", "--yes", "--json"]);
  assert.equal(result.status, 1, result.all);
  const document = json(result);
  assert.equal(document.ok, false);
  assert.equal(document.mutated, false);
  assert.equal(document.dryRun, true);
  assert.deepEqual(document.plan.files, []);
  assert.ok(document.diagnostics.some((entry) => entry.code === "init-source-unsupported"));
  assert.deepEqual(manifest(root), before);
});

test("init preserves and integrates a named App export in the built binary", () => {
  const fixture = viteFixture();
  write(
    fixture.root,
    "src/App.tsx",
    `export function App() {
  return <main>Keep this named export</main>;
}
`,
  );

  const result = run(fixture.root, ["--dry-run", "--yes", "--json"]);
  assert.equal(result.status, 0, result.all);
  const document = json(result);
  const app = document.plan.files.find((file) => file.path === "src/App.tsx");
  assert.ok(app, result.stdout);

  const applied = run(fixture.root, ["--yes", "--expect-plan", document.planDigest, "--json"]);
  assert.equal(applied.status, 0, applied.all);
  const content = readFileSync(join(fixture.root, "src/App.tsx"), "utf8");
  assert.match(content, /export function App\(\)/);
  assert.doesNotMatch(content, /export default/);
  assert.match(content, /<MantineProvider theme=\{theme\}>/);
  assert.match(content, /Keep this named export/);
});
