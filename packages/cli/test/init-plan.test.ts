import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { initSourceUnsupported } from "../src/init/diagnostics";
import { INIT_DEPENDENCIES, planInit } from "../src/init/plan";
import type {
  InitAdapter,
  InitFrameworkSet,
  InitPlanPorts,
  InitProjectSnapshot,
} from "../src/init/types";
import { frameworkSetFor } from "../src/init/types";

const ROOT = "/project";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function project(
  framework: InitFrameworkSet = frameworkSetFor("manual"),
  files: ReadonlyMap<string, string> = new Map([[join(ROOT, "tsconfig.json"), "{}\n"]]),
  declaredDependencies: ReadonlyMap<string, string> = new Map(),
): InitProjectSnapshot {
  const sourceRoot = framework.kind === "react-router" ? join(ROOT, "app") : join(ROOT, "src");
  return {
    layout: {
      root: ROOT,
      sourceRoot,
      tsconfigPath: join(ROOT, "tsconfig.json"),
      configPath: join(ROOT, "manteen.json"),
      themePath: join(sourceRoot, "lib/theme.ts"),
      themeImport: "@/lib/theme",
    },
    files,
    declaredDependencies,
  };
}

function ports(
  input: {
    framework?: InitFrameworkSet;
    project?: InitProjectSnapshot;
    packageManager?: "npm" | null;
    adapter?: InitAdapter;
  } = {},
): InitPlanPorts {
  const framework = input.framework ?? frameworkSetFor("manual");
  const snapshot = input.project ?? project(framework);
  return {
    async detect() {
      return { ok: true, source: "detected", framework, evidence: [] };
    },
    async snapshot() {
      return snapshot;
    },
    adapter() {
      if (input.adapter === undefined) throw new Error("unexpected adapter request");
      return input.adapter;
    },
    hashFile(path) {
      const source = snapshot.files.get(path);
      return source === undefined ? null : hash(source);
    },
    async detectPackageManager() {
      return input.packageManager === undefined ? "npm" : input.packageManager;
    },
    installCommand(dependencies, packageManager) {
      return `${packageManager} add ${dependencies.map((dependency) => dependency.name).join(" ")}`;
    },
  };
}

describe("W6 init plan composition", () => {
  test("materializes only mutations with final and pre-image hashes", async () => {
    const planned = await planInit(ROOT, {}, ports());

    expect(planned.ok).toBe(true);
    expect(planned.framework.kind).toBe("manual");
    expect(planned.files.map((file) => file.kind).sort()).toEqual([
      "manteen-config",
      "postcss",
      "theme",
      "tsconfig",
    ]);
    expect(planned.files.every((file) => file.sha256 === hash(file.content))).toBe(true);
    expect(planned.files.find((file) => file.kind === "tsconfig")?.existing).toEqual({
      sha256: hash("{}\n"),
    });
    expect(planned.dependencies.map((dependency) => dependency.name)).toEqual(
      INIT_DEPENDENCIES.map((dependency) => dependency.name),
    );
    expect(planned.packageManager).toBe("npm");
    expect(planned.instructions).toEqual([
      expect.objectContaining({ code: "manual-framework", required: true }),
    ]);
  });

  test("a no-package-manager refusal carries zero mutation entries", async () => {
    const planned = await planInit(ROOT, {}, ports({ packageManager: null }));

    expect(planned.ok).toBe(false);
    expect(planned.files).toEqual([]);
    expect(planned.dependencies).toEqual([]);
    expect(planned.packageManager).toBeNull();
    expect(planned.diagnostics).toEqual([
      expect.objectContaining({ code: "no-package-manager", severity: "error" }),
    ]);
  });

  test("one adapter refusal makes every shared proposal atomic", async () => {
    const framework = frameworkSetFor("vite");
    const files = new Map<string, string>([
      [join(ROOT, "tsconfig.json"), "{}\n"],
      [join(ROOT, "vite.config.ts"), "export default {};\n"],
    ]);
    const adapter: InitAdapter = {
      id: "vite",
      plan() {
        return {
          files: [],
          instructions: [],
          diagnostics: [initSourceUnsupported(join(ROOT, "src/App.tsx"), "fixture refusal")],
        };
      },
    };

    const planned = await planInit(
      ROOT,
      {},
      ports({ framework, project: project(framework, files), adapter }),
    );
    expect(planned.ok).toBe(false);
    expect(planned.files).toEqual([]);
    expect(planned.dependencies).toEqual([]);
    expect(planned.diagnostics[0]?.code).toBe("init-source-unsupported");
  });

  test("the second mutation plan is empty while required manual work repeats", async () => {
    const firstProject = project();
    const first = await planInit(ROOT, {}, ports({ project: firstProject }));
    const files = new Map(firstProject.files);
    for (const file of first.files) files.set(file.destination, file.content);
    const declared = new Map(
      INIT_DEPENDENCIES.map((dependency) => [dependency.name, dependency.range] as const),
    );
    const secondProject = project(frameworkSetFor("manual"), files, declared);
    const second = await planInit(ROOT, {}, ports({ project: secondProject }));

    expect(second.ok).toBe(true);
    expect(second.files).toEqual([]);
    expect(second.dependencies).toEqual([]);
    expect(second.packageManager).toBeNull();
    expect(second.instructions.map((instruction) => instruction.code)).toEqual([
      "manual-framework",
    ]);
  });

  test("package.json PostCSS plus a dependency install refuses the exact-byte collision", async () => {
    const packagePath = join(ROOT, "package.json");
    const snapshot = project(
      frameworkSetFor("manual"),
      new Map([
        [join(ROOT, "tsconfig.json"), "{}\n"],
        [packagePath, '{"postcss":{"plugins":{}}}\n'],
      ]),
    );
    const planned = await planInit(ROOT, {}, ports({ project: snapshot }));

    expect(planned.ok).toBe(false);
    expect(planned.files).toEqual([]);
    expect(planned.diagnostics).toContainEqual(
      expect.objectContaining({ code: "init-config-conflict", path: packagePath }),
    );
  });
});
