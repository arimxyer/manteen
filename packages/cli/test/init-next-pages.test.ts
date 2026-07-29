import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { nextPagesAdapter } from "../src/init/adapters/next-pages";
import { INIT_ALIASES, type InitAdapterInput } from "../src/init/types";

const ROOT = "/project";
const SOURCE_ROOT = "/project/src";
const APP_PATH = "/project/src/pages/_app.tsx";
const DOCUMENT_PATH = "/project/src/pages/_document.tsx";

const GENERATED_APP = `import "@/styles/globals.css";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`;

const GENERATED_DOCUMENT = `import { Html, Head, Main, NextScript } from "next/document";

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

function input(app = GENERATED_APP, document = GENERATED_DOCUMENT): InitAdapterInput {
  return {
    framework: "next-pages",
    aliases: INIT_ALIASES,
    project: {
      layout: {
        root: ROOT,
        sourceRoot: SOURCE_ROOT,
        tsconfigPath: resolve(ROOT, "tsconfig.json"),
        configPath: resolve(ROOT, "manteen.json"),
        themePath: resolve(SOURCE_ROOT, "lib/theme.ts"),
        themeImport: "@/lib/theme",
      },
      files: new Map([
        [APP_PATH, app],
        [DOCUMENT_PATH, document],
      ]),
      declaredDependencies: new Map(),
    },
  };
}

function content(result: ReturnType<typeof nextPagesAdapter.plan>, path: string): string {
  return result.files.find((file) => file.destination === path)?.content ?? "";
}

describe("W6 Next Pages adapter", () => {
  test("integrates the generated Pages pair without replacing existing structure", () => {
    const result = nextPagesAdapter.plan(input());

    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((file) => file.destination)).toEqual([APP_PATH, DOCUMENT_PATH]);

    const app = content(result, APP_PATH);
    expect(app).toContain('import "@/styles/globals.css";');
    expect(app).toContain('import "@mantine/core/styles.css";');
    expect(app).toContain('from "@mantine/core"');
    expect(app).toContain('from "@/lib/theme"');
    expect(app).toContain("<MantineProvider theme={theme}>");
    expect(app).toContain("<Component {...pageProps} />");

    const document = content(result, DOCUMENT_PATH);
    expect(document).toContain('<Html lang="en" {...mantineHtmlProps}>');
    expect(document).toContain("<Head><ColorSchemeScript /></Head>");
    expect(document).toContain("<Main />");
    expect(document).toContain("<NextScript />");
  });

  test("preserves populated Head content, provider props, document props, and quote style", () => {
    const app = `import '@/styles/globals.css';
import { MantineProvider } from '@mantine/core';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MantineProvider defaultColorScheme='auto'>
      <Component {...pageProps} />
    </MantineProvider>
  );
}
`;
    const document = `import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang='en' suppressHydrationWarning>
      <Head>
        <meta name='description' content='kept' />
      </Head>
      <body className='document-body'>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
`;

    const result = nextPagesAdapter.plan(input(app, document));
    expect(result.diagnostics).toEqual([]);

    const transformedApp = content(result, APP_PATH);
    expect(transformedApp).toContain("import '@mantine/core/styles.css';");
    expect(transformedApp).toContain("from '@/lib/theme'");
    expect(transformedApp).toContain("<MantineProvider defaultColorScheme='auto' theme={theme}>");

    const transformedDocument = content(result, DOCUMENT_PATH);
    expect(transformedDocument).toContain(
      "<Html lang='en' suppressHydrationWarning {...mantineHtmlProps}>",
    );
    expect(transformedDocument).toContain("<meta name='description' content='kept' />");
    expect(transformedDocument).toContain("<ColorSchemeScript />");
    expect(transformedDocument).toContain("<body className='document-body'>");
  });

  test("is byte-stable when the transformed pair is planned again", () => {
    const first = nextPagesAdapter.plan(input());
    const firstApp = content(first, APP_PATH);
    const firstDocument = content(first, DOCUMENT_PATH);
    const second = nextPagesAdapter.plan(input(firstApp, firstDocument));

    expect(second.diagnostics).toEqual([]);
    expect(content(second, APP_PATH)).toBe(firstApp);
    expect(content(second, DOCUMENT_PATH)).toBe(firstDocument);
    expect((firstApp.match(/<MantineProvider/g) ?? []).length).toBe(1);
    expect((firstDocument.match(/<ColorSchemeScript/g) ?? []).length).toBe(1);
  });

  test("refuses a missing or unsupported pair atomically", () => {
    const missing = input();
    missing.project.files = new Map([[APP_PATH, GENERATED_APP]]);
    const missingResult = nextPagesAdapter.plan(missing);
    expect(missingResult.files).toEqual([]);
    expect(missingResult.diagnostics).toHaveLength(1);
    expect(missingResult.diagnostics[0]).toMatchObject({
      code: "init-source-unsupported",
      path: DOCUMENT_PATH,
    });

    const unsupportedApp = GENERATED_APP.replaceAll("Component", "Page");
    const unsupportedResult = nextPagesAdapter.plan(input(unsupportedApp, GENERATED_DOCUMENT));
    expect(unsupportedResult.files).toEqual([]);
    expect(unsupportedResult.diagnostics).toHaveLength(1);
    expect(unsupportedResult.diagnostics[0]).toMatchObject({
      code: "init-source-unsupported",
      path: APP_PATH,
    });
  });
});
