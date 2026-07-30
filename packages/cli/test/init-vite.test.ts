import { describe, expect, test } from "bun:test";

import { planViteEntry } from "../src/init/adapters/vite";
import { INIT_ALIASES, type InitAdapterInput } from "../src/init/types";

const ROOT = "/project";
const SOURCE_ROOT = `${ROOT}/src`;
const ENTRY = `${SOURCE_ROOT}/App.tsx`;

function input(content: string): InitAdapterInput {
  return {
    framework: "vite",
    aliases: INIT_ALIASES,
    project: {
      layout: {
        root: ROOT,
        sourceRoot: SOURCE_ROOT,
        tsconfigPath: `${ROOT}/tsconfig.app.json`,
        configPath: `${ROOT}/vite.config.ts`,
        themePath: `${SOURCE_ROOT}/lib/theme.ts`,
        themeImport: "@/lib/theme",
        stylesPath: `${SOURCE_ROOT}/manteen.css`,
      },
      files: new Map([[ENTRY, content]]),
      declaredDependencies: new Map(),
    },
  };
}

const GENERATED_APP = `import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <img src={reactLogo} alt="React logo" />
      <button onClick={() => setCount((value) => value + 1)}>
        count is {count}
      </button>
    </>
  )
}

export default App
`;

describe("W6 Vite entry adapter", () => {
  test("integrates the generated React TypeScript shape without replacing its body", () => {
    const result = planViteEntry(input(GENERATED_APP));

    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.destination).toBe(ENTRY);
    expect(result.files[0]?.kind).toBe("entry");

    const content = result.files[0]?.content ?? "";
    expect(content).toContain("import '@mantine/core/styles.css';");
    expect(content).toContain("import './manteen.css';");
    expect(content.indexOf("@mantine/core/styles.css")).toBeLessThan(
      content.indexOf("./manteen.css"),
    );
    expect(content.indexOf("./manteen.css")).toBeLessThan(content.indexOf("./App.css"));
    expect(content).toContain("import { MantineProvider } from '@mantine/core';");
    expect(content).toContain("import { theme } from '@/lib/theme';");
    expect(content).toContain("<MantineProvider theme={theme}>");
    expect(content).toContain('<img src={reactLogo} alt="React logo" />');
    expect(content).toContain("count is {count}");
    expect(content).toContain("</MantineProvider>");
    expect(content).not.toContain("ColorSchemeScript");
  });

  test("reuses existing imports and provider while preserving provider props", () => {
    const source = `import "@mantine/core/styles.css";
import { Button, MantineProvider as Provider } from "@mantine/core";
import { theme as appTheme } from "@/lib/theme";

export default function App() {
  return (
    <Provider defaultColorScheme="dark" cssVariablesSelector=":root">
      <Button>Keep me</Button>
    </Provider>
  );
}
`;

    const result = planViteEntry(input(source));
    const content = result.files[0]?.content ?? "";

    expect(result.diagnostics).toEqual([]);
    expect(content.match(/@mantine\/core\/styles\.css/g)).toHaveLength(1);
    expect(content.match(/MantineProvider/g)).toHaveLength(1);
    expect(content.match(/@\/lib\/theme/g)).toHaveLength(1);
    expect(content).toContain(
      '<Provider theme={appTheme} defaultColorScheme="dark" cssVariablesSelector=":root">',
    );
    expect(content).toContain("<Button>Keep me</Button>");
  });

  test("produces byte-identical content when its output is planned again", () => {
    const first = planViteEntry(input(GENERATED_APP));
    const firstContent = first.files[0]?.content;
    expect(firstContent).toBeDefined();

    const second = planViteEntry(input(firstContent ?? ""));
    expect(second.diagnostics).toEqual([]);
    expect(second.files).toHaveLength(1);
    expect(second.files[0]?.content).toBe(firstContent);
    expect(second.files[0]?.content.match(/<MantineProvider/g)).toHaveLength(1);
  });

  test("refuses a computed default export and emits no proposed file", () => {
    const result = planViteEntry(
      input(`const candidates = [() => <main>A</main>, () => <main>B</main>];
export default candidates[Math.random() > 0.5 ? 0 : 1];
`),
    );

    expect(result.files).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "init-source-unsupported",
      severity: "error",
      forceable: false,
      path: ENTRY,
    });
    expect(result.diagnostics[0]?.message).toContain("without guessing");
  });

  test("refuses an unproven provider binding instead of adding a duplicate wrapper", () => {
    const result = planViteEntry(
      input(`export default function App() {
  return <MantineProvider><main>App</main></MantineProvider>;
}
`),
    );

    expect(result.files).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      code: "init-source-unsupported",
      path: ENTRY,
    });
    expect(result.diagnostics[0]?.message).toContain("not backed by a value import");
  });
});
