import { describe, expect, test } from "bun:test";

import { MANTINE_POSTCSS_SNIPPET, planPostcss } from "../src/init/postcss";
import { frameworkSetFor, type InitProjectSnapshot } from "../src/init/types";

function project(files: Record<string, string>): InitProjectSnapshot {
  return {
    layout: {
      root: "/project",
      sourceRoot: "/project/src",
      tsconfigPath: "/project/tsconfig.app.json",
      configPath: "/project/manteen.json",
      themePath: "/project/src/lib/theme.ts",
      themeImport: "@/lib/theme",
    },
    files: new Map(Object.entries(files)),
    declaredDependencies: new Map(),
  };
}

describe("W6 PostCSS planning", () => {
  test("creates the settled cjs config only when none exists", () => {
    const result = planPostcss(project({}), frameworkSetFor("vite"));
    expect(result.diagnostics).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.destination).toBe("/project/postcss.config.cjs");
    expect(result.files[0]?.content).toContain('"mantine-breakpoint-xs": "36em"');
    expect(result.files[0]?.content).toContain('"mantine-breakpoint-xl": "88em"');
  });

  test("generic loader precedence patches cjs and never creates or patches mjs", () => {
    const cjs = "module.exports = { plugins: {} };\n";
    const mjs = "export default { plugins: { untouched: {} } };\n";
    const result = planPostcss(
      project({
        "/project/postcss.config.cjs": cjs,
        "/project/postcss.config.mjs": mjs,
      }),
      frameworkSetFor("vite"),
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.destination).toBe("/project/postcss.config.cjs");
  });

  test("Next precedence patches mjs before cjs", () => {
    const result = planPostcss(
      project({
        "/project/postcss.config.cjs": "module.exports = { plugins: {} };\n",
        "/project/postcss.config.mjs": "export default { plugins: {} };\n",
      }),
      frameworkSetFor("next-app"),
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.destination).toBe("/project/postcss.config.mjs");
  });

  test("Tailwind PostCSS remains byte-identical and becomes required manual work", () => {
    const source = `const config = { plugins: { "@tailwindcss/postcss": {} } };\nexport default config;\n`;
    const result = planPostcss(
      project({ "/project/postcss.config.mjs": source }),
      frameworkSetFor("next-app"),
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([
      expect.objectContaining({
        code: "tailwind-postcss",
        required: true,
        path: "/project/postcss.config.mjs",
        snippet: MANTINE_POSTCSS_SNIPPET,
      }),
    ]);
  });

  test("patches package.json PostCSS without replacing the rest of the manifest", () => {
    const source = `${JSON.stringify({ name: "app", private: true, postcss: { plugins: {} } }, null, 2)}\n`;
    const result = planPostcss(
      project({ "/project/package.json": source }),
      frameworkSetFor("vite"),
    );
    const output = JSON.parse(result.files[0]?.content ?? "null");
    expect(output).toMatchObject({ name: "app", private: true });
    expect(output.postcss.plugins["postcss-simple-vars"].variables).toEqual({
      "mantine-breakpoint-xs": "36em",
      "mantine-breakpoint-sm": "48em",
      "mantine-breakpoint-md": "62em",
      "mantine-breakpoint-lg": "75em",
      "mantine-breakpoint-xl": "88em",
    });
  });

  test("a complete block is idempotent", () => {
    const source = `module.exports = {
  plugins: {
    ${MANTINE_POSTCSS_SNIPPET.split("\n").join("\n    ")},
  },
};
`;
    const result = planPostcss(
      project({ "/project/postcss.config.cjs": source }),
      frameworkSetFor("vite"),
    );
    expect(result).toMatchObject({ files: [], instructions: [], diagnostics: [] });
  });

  test("conflicting settled variables refuse instead of overwriting", () => {
    const source = `module.exports = { plugins: { "postcss-simple-vars": { variables: { "mantine-breakpoint-sm": "40em" } } } };\n`;
    const result = planPostcss(
      project({ "/project/postcss.config.cjs": source }),
      frameworkSetFor("vite"),
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: "init-config-conflict" });
  });

  test("dynamic active configs refuse and never create a competitor", () => {
    const source = "export default makeConfig();\n";
    const result = planPostcss(
      project({ "/project/postcss.config.mjs": source }),
      frameworkSetFor("vite"),
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      code: "init-postcss-unsupported",
      path: "/project/postcss.config.mjs",
    });
  });
});
