import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { reactRouterAdapter } from "../src/init/adapters/react-router";
import { INIT_ALIASES, type InitProjectSnapshot } from "../src/init/types";

const root = "/project";
const sourceRoot = resolve(root, "app");
const rootPath = resolve(sourceRoot, "root.tsx");

function snapshot(source?: string): InitProjectSnapshot {
  return {
    layout: {
      root,
      sourceRoot,
      tsconfigPath: resolve(root, "tsconfig.json"),
      configPath: resolve(root, "manteen.json"),
      themePath: resolve(sourceRoot, "lib/theme.ts"),
      themeImport: "@/lib/theme",
    },
    files: new Map(source === undefined ? [] : [[rootPath, source]]),
    declaredDependencies: new Map(),
  };
}

function plan(source?: string) {
  return reactRouterAdapter.plan({
    framework: "react-router",
    project: snapshot(source),
    aliases: INIT_ALIASES,
  });
}

const generatedRoot = `import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error)) return <p>{error.status}</p>;
  return <p>Unknown error</p>;
}
`;

describe("W6 React Router adapter", () => {
  test("integrates the current generated framework root without dropping document machinery", () => {
    const result = plan(generatedRoot);
    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.files).toHaveLength(1);

    const content = result.files[0]!.content;
    expect(content.indexOf('import "@mantine/core/styles.css";')).toBeLessThan(
      content.indexOf('import "./app.css";'),
    );
    expect(content).toContain(
      'import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";',
    );
    expect(content).toContain('import { theme } from "@/lib/theme";');
    expect(content).toContain('<html lang="en" {...mantineHtmlProps}>');
    expect(content).toContain("<ColorSchemeScript />");
    expect(content).toContain("<MantineProvider theme={theme}>{children}</MantineProvider>");

    for (const preserved of ["<Meta />", "<Links />", "<ScrollRestoration />", "<Scripts />"]) {
      expect(content).toContain(preserved);
    }
    expect(content).toContain("export function ErrorBoundary");
  });

  test("preserves quote style and existing document and provider props", () => {
    const source = `import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Links, Meta, Scripts, ScrollRestoration } from 'react-router';
import '@/lib/theme';
import './app.css';
import '@mantine/core/styles.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='fr' data-shell='kept' {...mantineHtmlProps}>
      <head data-head='kept'>
        <ColorSchemeScript nonce='nonce-value' />
        <Meta />
        <Links />
      </head>
      <body className='shell'>
        <MantineProvider defaultColorScheme='dark'>{children}</MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`;

    const result = plan(source);
    expect(result.diagnostics).toEqual([]);
    const content = result.files[0]!.content;
    expect(content).toContain("from '@mantine/core'");
    expect(content).toContain("import { theme } from '@/lib/theme';");
    expect(content.indexOf("import '@mantine/core/styles.css';")).toBeLessThan(
      content.indexOf("import './app.css';"),
    );
    expect(content).toContain("<html lang='fr' data-shell='kept' {...mantineHtmlProps}>");
    expect(content).toContain("<head data-head='kept'>");
    expect(content).toContain("<ColorSchemeScript nonce='nonce-value' />");
    expect(content).toContain(
      "<MantineProvider defaultColorScheme='dark' theme={theme}>{children}</MantineProvider>",
    );
    expect(content).toContain("<body className='shell'>");
  });

  test("a second adapter run proposes no mutation", () => {
    const first = plan(generatedRoot);
    const second = plan(first.files[0]!.content);

    expect(second).toEqual({ files: [], instructions: [], diagnostics: [] });
  });

  test("missing and computed root shapes refuse with no proposed files", () => {
    const missing = plan();
    expect(missing.files).toEqual([]);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "init-source-unsupported",
    ]);

    const computed = plan(`import './app.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return children ? <html><head /><body>{children}</body></html> : null;
}
`);
    expect(computed.files).toEqual([]);
    expect(computed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "init-source-unsupported",
    ]);
  });
});
