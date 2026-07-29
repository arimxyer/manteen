import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { planShared } from "../src/init/shared";
import { frameworkSetFor, type InitProjectSnapshot } from "../src/init/types";

const ROOT = "/project";

function snapshot(overrides: Record<string, string> = {}): InitProjectSnapshot {
  const files = new Map<string, string>([
    [
      join(ROOT, "tsconfig.app.json"),
      `{
  // keep this comment
  "compilerOptions": {}
}
`,
    ],
    [
      join(ROOT, "vite.config.ts"),
      `import { defineConfig } from "vite";

export default defineConfig({ plugins: [] });
`,
    ],
    ...Object.entries(overrides),
  ]);
  return {
    layout: {
      root: ROOT,
      sourceRoot: join(ROOT, "src"),
      tsconfigPath: join(ROOT, "tsconfig.app.json"),
      configPath: join(ROOT, "manteen.json"),
      themePath: join(ROOT, "src/lib/theme.ts"),
      themeImport: "@/lib/theme",
    },
    files,
    declaredDependencies: new Map(),
  };
}

function applyProposals(
  project: InitProjectSnapshot,
  files: ReturnType<typeof planShared>["files"],
) {
  const next = new Map(project.files);
  for (const file of files) next.set(file.destination, file.content);
  return { ...project, files: next };
}

describe("W6 shared init planning", () => {
  test("creates the compatible config, theme, paths, Vite resolver and PostCSS pipeline", () => {
    const result = planShared(snapshot(), frameworkSetFor("vite"));

    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.files.map((file) => file.kind).sort()).toEqual([
      "framework-config",
      "manteen-config",
      "postcss",
      "theme",
      "tsconfig",
    ]);

    const config = result.files.find((file) => file.kind === "manteen-config")?.content ?? "";
    expect(JSON.parse(config)).toMatchObject({
      registries: {
        "@house": "https://arimxyer.github.io/manteen/r/{name}.json",
      },
      aliases: {
        components: "@/components",
        ui: "@/components/ui",
        hooks: "@/hooks",
        lib: "@/lib",
      },
      theme: "src/lib/theme.ts",
      tsconfig: "tsconfig.app.json",
    });

    const tsconfig = result.files.find((file) => file.kind === "tsconfig")?.content ?? "";
    expect(tsconfig).toContain("// keep this comment");
    expect(tsconfig).toContain('"@/*": ["./src/*"]');

    const vite = result.files.find((file) => file.kind === "framework-config")?.content ?? "";
    expect(vite).toContain("tsconfigPaths: true");
  });

  test("a second shared pass has no mutation entries", () => {
    const project = snapshot();
    const first = planShared(project, frameworkSetFor("vite"));
    const second = planShared(applyProposals(project, first.files), frameworkSetFor("vite"));

    expect(second.diagnostics).toEqual([]);
    expect(second.instructions).toEqual([]);
    expect(second.files).toEqual([]);
  });

  test("preserves existing path keys and accepts an aliased mergeable theme", () => {
    const project = snapshot({
      [join(ROOT, "tsconfig.app.json")]: `{
  "compilerOptions": {
    "paths": {
      "~/*": ["./legacy/*"]
    }
  }
}
`,
      [join(ROOT, "src/lib/theme.ts")]: `import { createTheme as makeTheme } from "@mantine/core";
const theme = makeTheme({ primaryColor: "grape" });
export { theme };
`,
    });

    const result = planShared(project, frameworkSetFor("vite"));
    expect(result.diagnostics).toEqual([]);
    expect(result.files.find((file) => file.kind === "theme")).toBeUndefined();
    expect(result.files.find((file) => file.kind === "tsconfig")?.content).toContain('"~/*"');
  });

  test("explicit path and Vite resolver conflicts are named instead of overwritten", () => {
    const project = snapshot({
      [join(ROOT, "tsconfig.app.json")]: `{"compilerOptions":{"paths":{"@/*":["./other/*"]}}}`,
      [join(ROOT, "vite.config.ts")]:
        'import { defineConfig } from "vite"; export default defineConfig({ resolve: { tsconfigPaths: false } });\n',
    });

    const result = planShared(project, frameworkSetFor("vite"));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "init-config-conflict",
      "init-config-conflict",
    ]);
    expect(result.files.some((file) => file.kind === "tsconfig")).toBe(false);
    expect(result.files.some((file) => file.kind === "framework-config")).toBe(false);
  });

  test("manual mode records required framework work separately from mutations", () => {
    const project = snapshot({
      [join(ROOT, "tsconfig.json")]: `{"compilerOptions":{}}\n`,
    });
    project.layout.tsconfigPath = join(ROOT, "tsconfig.json");

    const result = planShared(project, frameworkSetFor("manual"));
    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([
      expect.objectContaining({ code: "manual-framework", required: true }),
    ]);
    expect(result.files.some((file) => file.kind === "framework-config")).toBe(false);
  });
});
