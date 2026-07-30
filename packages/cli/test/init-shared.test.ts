import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { mergeThemeSource } from "manteen-kit";

import { HOUSE_REGISTRY_INDEX_URL, HOUSE_REGISTRY_ITEM_URL } from "../src/config/defaults";
import { INIT_THEME_SOURCE, planShared } from "../src/init/shared";
import { INIT_STYLES_SOURCE } from "../src/init/styles";
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
      stylesPath: join(ROOT, "src/manteen.css"),
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
  test("the exact scaffold accepts the kit's real data-grid theme fragment", () => {
    const fragment = readFileSync(
      resolve(import.meta.dirname, "../../registry-kit/fixtures/base/src/data-grid.theme.ts"),
      "utf8",
    );
    const merged = mergeThemeSource(INIT_THEME_SOURCE, fragment);

    expect(merged.conflicts).toEqual([]);
    expect(merged.text).toContain("Table: Table.extend");
    expect(merged.text).toContain('import { Table, createTheme } from "@mantine/core";');
  });

  test("creates the compatible config, theme, paths, Vite resolver and PostCSS pipeline", () => {
    const result = planShared(snapshot(), frameworkSetFor("vite"));

    expect(result.diagnostics).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.files.map((file) => file.kind).sort()).toEqual([
      "framework-config",
      "manteen-config",
      "postcss",
      "styles",
      "theme",
      "tsconfig",
    ]);

    const config = result.files.find((file) => file.kind === "manteen-config")?.content ?? "";
    expect(JSON.parse(config)).toMatchObject({
      registries: {
        "@house": {
          url: HOUSE_REGISTRY_ITEM_URL,
          index: HOUSE_REGISTRY_INDEX_URL,
        },
      },
      aliases: {
        components: "@/components",
        ui: "@/components/ui",
        hooks: "@/hooks",
        lib: "@/lib",
      },
      theme: "src/lib/theme.ts",
      styles: "src/manteen.css",
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

  test("migrates the exact legacy house registry without dropping authored config", () => {
    const project = snapshot();
    const initialized = applyProposals(project, planShared(project, frameworkSetFor("vite")).files);
    const configPath = join(ROOT, "manteen.json");
    const legacy = JSON.parse(initialized.files.get(configPath) ?? "null");
    legacy.registries["@house"] = HOUSE_REGISTRY_ITEM_URL;
    legacy.registries["@other"] = "https://example.com/r/{name}.json";
    legacy.resolutions = { "empty-state": "@house/empty-state" };
    initialized.files.set(configPath, `${JSON.stringify(legacy, null, 2)}\n`);

    const migration = planShared(initialized, frameworkSetFor("vite"));
    expect(migration.diagnostics).toEqual([]);
    const proposal = migration.files.find((file) => file.kind === "manteen-config");
    const migrated = JSON.parse(proposal?.content ?? "null");
    expect(migrated.registries).toEqual({
      "@house": {
        url: HOUSE_REGISTRY_ITEM_URL,
        index: HOUSE_REGISTRY_INDEX_URL,
      },
      "@other": "https://example.com/r/{name}.json",
    });
    expect(migrated.resolutions).toEqual({ "empty-state": "@house/empty-state" });

    const after = applyProposals(initialized, migration.files);
    expect(
      planShared(after, frameworkSetFor("vite")).files.filter(
        (file) => file.kind === "manteen-config",
      ),
    ).toEqual([]);
  });

  test("adds the styles path and scaffold to a compatible pre-styles config", () => {
    const project = snapshot();
    const initialized = applyProposals(project, planShared(project, frameworkSetFor("vite")).files);
    const configPath = join(ROOT, "manteen.json");
    const stylesPath = join(ROOT, "src/manteen.css");
    const legacy = JSON.parse(initialized.files.get(configPath) ?? "null");
    delete legacy.styles;
    initialized.files.set(configPath, `${JSON.stringify(legacy, null, 2)}\n`);
    initialized.files.delete(stylesPath);

    const migration = planShared(initialized, frameworkSetFor("vite"));

    expect(migration.diagnostics).toEqual([]);
    expect(
      JSON.parse(migration.files.find((file) => file.kind === "manteen-config")?.content ?? "null")
        .styles,
    ).toBe("src/manteen.css");
    expect(migration.files.find((file) => file.kind === "styles")?.content).toBe(
      INIT_STYLES_SOURCE,
    );
  });

  test("refuses unknown stylesheet bytes before a pre-styles config adopts the path", () => {
    const project = snapshot();
    const initialized = applyProposals(project, planShared(project, frameworkSetFor("vite")).files);
    const configPath = join(ROOT, "manteen.json");
    const stylesPath = join(ROOT, "src/manteen.css");
    const legacy = JSON.parse(initialized.files.get(configPath) ?? "null");
    delete legacy.styles;
    initialized.files.set(configPath, `${JSON.stringify(legacy, null, 2)}\n`);
    initialized.files.set(stylesPath, "body { color: rebeccapurple; }\n");

    const migration = planShared(initialized, frameworkSetFor("vite"));

    expect(migration.files.some((file) => file.kind === "styles")).toBe(false);
    expect(migration.diagnostics).toContainEqual(
      expect.objectContaining({ code: "init-config-conflict", path: stylesPath }),
    );
  });

  test("adds the house index without dropping request metadata", () => {
    const project = snapshot();
    const initialized = applyProposals(project, planShared(project, frameworkSetFor("vite")).files);
    const configPath = join(ROOT, "manteen.json");
    const config = JSON.parse(initialized.files.get(configPath) ?? "null");
    config.registries["@house"] = {
      url: HOUSE_REGISTRY_ITEM_URL,
      headers: { "X-Registry": "house" },
      params: { channel: "stable" },
    };
    initialized.files.set(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const migration = planShared(initialized, frameworkSetFor("vite"));
    expect(migration.diagnostics).toEqual([]);
    const proposal = migration.files.find((file) => file.kind === "manteen-config");
    expect(JSON.parse(proposal?.content ?? "null").registries["@house"]).toEqual({
      url: HOUSE_REGISTRY_ITEM_URL,
      headers: { "X-Registry": "house" },
      params: { channel: "stable" },
      index: HOUSE_REGISTRY_INDEX_URL,
    });
  });

  test("refuses an explicitly different house registry index", () => {
    const project = snapshot();
    const initialized = applyProposals(project, planShared(project, frameworkSetFor("vite")).files);
    const configPath = join(ROOT, "manteen.json");
    const config = JSON.parse(initialized.files.get(configPath) ?? "null");
    config.registries["@house"].index = "https://example.com/registry.json";
    initialized.files.set(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = planShared(initialized, frameworkSetFor("vite"));
    expect(result.files.some((file) => file.kind === "manteen-config")).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "init-config-conflict", path: configPath }),
    );
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
