/**
 * W6 init under the shipped runtime: built dist, real Node, real temp files.
 *
 * Fixture provenance is intentionally point-in-time rather than `@latest`:
 * create-vite 9.1.1, create-next-app 16.2.12, and create-react-router 8.3.0,
 * observed 2026-07-29 in docs/w6-init-handoff.md. These compact fixtures keep
 * the generated entry seams that init transforms; they are not claimed as full
 * generator archives or as live evidence that those generators still match.
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
import { dirname, join, relative, resolve } from "node:path";
import { after, test } from "node:test";

import { loadConfig } from "../dist/index.mjs";
import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
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

function run(root, args) {
  const result = spawnSync(process.execPath, [CLI, "init", "--cwd", root, ...args], {
    cwd: root,
    env: childEnv(),
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

function json(result) {
  assert.equal(result.stderr, "", result.all);
  return JSON.parse(result.stdout);
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
    assert.deepEqual(manifest(fixture.root), before, "dry-run changed the fixture tree");

    const appliedResult = run(fixture.root, ["--yes", "--json"]);
    assert.equal(appliedResult.status, 0, appliedResult.all);
    const applied = json(appliedResult);
    assert.equal(applied.ok, true);
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

test("a source refusal is zero-mutation in the built binary", () => {
  const root = project("refusal");
  write(root, "package.json", packageFile("create-vite@9.1.1", {}, { vite: "^8" }));
  write(root, "index.html", '<div id="root"></div>\n');
  write(root, "src/main.tsx", "import './App';\n");
  write(root, "src/App.tsx", "export default chooseAtRuntime();\n");
  write(root, "tsconfig.app.json", '{"compilerOptions":{}}\n');
  write(root, "vite.config.ts", "export default {};\n");
  const before = manifest(root);

  const result = run(root, ["--yes", "--json"]);
  assert.equal(result.status, 1, result.all);
  const document = json(result);
  assert.equal(document.ok, false);
  assert.deepEqual(document.plan.files, []);
  assert.ok(document.diagnostics.some((entry) => entry.code === "init-source-unsupported"));
  assert.deepEqual(manifest(root), before);
});
