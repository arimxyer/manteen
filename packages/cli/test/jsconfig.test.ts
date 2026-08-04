/**
 * §6 — the jsconfig-only refusal.
 *
 * Three layers, each proving a different thing:
 *
 *  - `loadConfig()` against real temp projects: the two ways a project ends up
 *    `jsconfigOnly` (the default-lookup fallback to a bare `jsconfig.json`,
 *    and `manteen.json`'s `tsconfig` field pointed AT one — the bypass a probe
 *    found working), a real `tsconfig.json` staying unaffected, and the
 *    unchanged negative where neither file exists.
 *  - `checkJsconfigOnly()` directly, hand-fed `ResolvedFile`s: the pure
 *    decision — `.tsx` refuses, `.jsx` (the complement §6's letter implies)
 *    does not, and a non-jsconfig-only project is untouched regardless of
 *    extension.
 *  - One real `plan()` call, through `file:` (no network, no registry-kit
 *    compiler — a hand-written wire item is enough), proving the check is
 *    actually WIRED into `plan()` and not merely exported and unused. Run
 *    twice, with and without `--force`, because non-forceability is exactly
 *    the property a wiring bug could silently drop.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../src/config/load";
import { isBlocking } from "../src/plan/diagnostics";
import { checkJsconfigOnly, plan } from "../src/plan/index";
import type { ResolvedFile } from "../src/plan/types";

const projects: string[] = [];

afterAll(() => {
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "manteen-jsconfig-"));
  projects.push(dir);
  return dir;
}

const ALIASES = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

/** Same shape a real tsconfig's `compilerOptions` would have — `parseTsconfig`
 *  and `createPathsMatcher` do not care whether the file is named `tsconfig`
 *  or `jsconfig`. */
const COMPILER_OPTIONS = {
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@/components/ui/*": ["./src/components/ui/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/lib/*": ["./src/lib/*"],
    },
  },
};

function writeManteenJson(root: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(root, "manteen.json"),
    JSON.stringify(
      {
        registries: { "@test": "file:///nonexistent/{name}.json" },
        aliases: ALIASES,
        ...extra,
      },
      null,
      2,
    ),
  );
}

function writeJson(root: string, name: string, doc: unknown): void {
  writeFileSync(join(root, name), JSON.stringify(doc, null, 2));
}

// ---- loadConfig(): where `jsconfigOnly` gets set -----------------------------

describe("loadConfig() and jsconfigOnly", () => {
  test("falls back to jsconfig.json when tsconfig.json is absent, and marks the config jsconfigOnly", () => {
    const root = tmpProject();
    writeManteenJson(root);
    writeJson(root, "jsconfig.json", COMPILER_OPTIONS);

    const result = loadConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.jsconfigOnly).toBe(true);
    expect(result.config.tsconfigPath).toBe(resolve(root, "jsconfig.json"));
  });

  test("an explicit `tsconfig` pointed at jsconfig.json is the same state, not a bypass into a TypeScript config", () => {
    const root = tmpProject();
    // The probe's exact bypass: no tsconfig.json anywhere, and `tsconfig` named
    // to satisfy the paths matcher via a JS config instead.
    writeManteenJson(root, { tsconfig: "jsconfig.json" });
    writeJson(root, "jsconfig.json", COMPILER_OPTIONS);

    const result = loadConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.jsconfigOnly).toBe(true);
    expect(result.config.tsconfigPath).toBe(resolve(root, "jsconfig.json"));
  });

  test("detection is case-folded: a `JsConfig.json` project is jsconfig-only", () => {
    const root = tmpProject();
    // Explicit `tsconfig` naming the odd-cased file: on a case-insensitive
    // filesystem `JsConfig.json` satisfies a `jsconfig.json` lookup too, so an
    // exact-case basename test would make the SAME layout refuse there and
    // install on Linux. The verdict must not depend on the platform.
    writeManteenJson(root, { tsconfig: "JsConfig.json" });
    writeJson(root, "JsConfig.json", COMPILER_OPTIONS);

    const result = loadConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.jsconfigOnly).toBe(true);
    expect(result.config.tsconfigPath).toBe(resolve(root, "JsConfig.json"));
  });

  test("a real tsconfig.json is unaffected: jsconfigOnly is false", () => {
    const root = tmpProject();
    writeManteenJson(root);
    writeJson(root, "tsconfig.json", COMPILER_OPTIONS);

    const result = loadConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.jsconfigOnly).toBe(false);
    expect(result.config.tsconfigPath).toBe(resolve(root, "tsconfig.json"));
  });

  test("BOTH files present, `tsconfig` pointed at jsconfig.json: still jsconfigOnly, not silently upgraded because a real tsconfig sits right there", () => {
    const root = tmpProject();
    writeManteenJson(root, { tsconfig: "jsconfig.json" });
    writeJson(root, "jsconfig.json", COMPILER_OPTIONS);
    writeJson(root, "tsconfig.json", COMPILER_OPTIONS);

    const result = loadConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The explicit override wins, exactly as it does for a real tsconfig
    // (`"tsconfig": "tsconfig.app.json"` is never second-guessed either) — the
    // bypass this closes is precisely "point `tsconfig` elsewhere", so a
    // real tsconfig.json sitting unused at root must not change the verdict.
    expect(result.config.jsconfigOnly).toBe(true);
    expect(result.config.tsconfigPath).toBe(resolve(root, "jsconfig.json"));
  });

  test("neither tsconfig.json nor jsconfig.json present: unchanged generic config error, not a jsconfig-only inference", () => {
    const root = tmpProject();
    writeManteenJson(root);
    // Deliberately nothing else written.

    const result = loadConfig(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.pointer).toBe("/tsconfig");
    expect(result.errors[0]?.message).toBe(`${resolve(root, "tsconfig.json")} does not exist`);
  });
});

// ---- checkJsconfigOnly(): the pure decision ----------------------------------

function resolvedFile(itemId: string, sourcePath: string): ResolvedFile {
  return {
    itemId,
    sourcePath,
    wireType: "registry:component",
    destination: `/project/src/components/${sourcePath}`,
    content: "export const Widget = () => null;\n",
  };
}

const JSCONFIG_PATH = "/project/jsconfig.json";

describe("checkJsconfigOnly()", () => {
  test("refuses a .tsx file when the project is jsconfig-only", () => {
    const diagnostics = checkJsconfigOnly(
      [resolvedFile("@test/widget-ts", "widget.tsx")],
      true,
      JSCONFIG_PATH,
    );

    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic?.code).toBe("jsconfig-typescript-unsupported");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.forceable).toBe(false);
    expect(diagnostic?.items).toEqual(["@test/widget-ts"]);
    // Names the actual file backing `paths`, not a blanket "no tsconfig.json"
    // claim — that claim is false when a real tsconfig.json also exists and
    // `tsconfig` was pointed at the jsconfig instead (the bypass).
    expect(diagnostic?.message).toContain(JSCONFIG_PATH);
    // Non-forceable: `--force` cannot downgrade this, unlike the forceable rows.
    expect(isBlocking(diagnostic as never, true)).toBe(true);
  });

  test("a .jsx file in the same jsconfig-only project does not refuse (§6's letter: .ts/.tsx only)", () => {
    const diagnostics = checkJsconfigOnly(
      [resolvedFile("@test/widget-js", "widget.jsx")],
      true,
      JSCONFIG_PATH,
    );
    expect(diagnostics).toEqual([]);
  });

  test("naming only the offending item: a mixed run names the .tsx item, not the .jsx one", () => {
    const diagnostics = checkJsconfigOnly(
      [
        resolvedFile("@test/widget-ts", "widget.tsx"),
        resolvedFile("@test/widget-js", "widget.jsx"),
      ],
      true,
      JSCONFIG_PATH,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.items).toEqual(["@test/widget-ts"]);
  });

  test("a .tsx file in a project that is NOT jsconfig-only never refuses on this code", () => {
    const diagnostics = checkJsconfigOnly(
      [resolvedFile("@test/widget-ts", "widget.tsx")],
      false,
      "/project/tsconfig.json",
    );
    expect(diagnostics).toEqual([]);
  });
});

// ---- plan(): proving the check is actually wired in --------------------------

describe("plan() wiring", () => {
  function fixtureRegistry(): string {
    const dir = mkdtempSync(join(tmpdir(), "manteen-jsconfig-registry-"));
    projects.push(dir);
    mkdirSync(dir, { recursive: true });
    writeJson(dir, "widget-ts.json", {
      name: "widget-ts",
      type: "registry:component",
      files: [
        {
          path: "widget.tsx",
          type: "registry:component",
          content: "export const Widget = () => null;\n",
        },
      ],
    });
    return dir;
  }

  test("a jsconfig-only project refuses a .tsx item at plan() with the new code, non-forceably", async () => {
    const root = tmpProject();
    const registryDir = fixtureRegistry();
    writeManteenJson(root, {
      registries: { "@test": `${pathToFileURL(registryDir).href.replace(/\/$/, "")}/{name}.json` },
    });
    writeJson(root, "jsconfig.json", COMPILER_OPTIONS);

    const loaded = loadConfig(root);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.config.jsconfigOnly).toBe(true);

    const planned = await plan(loaded.config, ["@test/widget-ts"], { interactive: false });
    const offending = planned.diagnostics.filter(
      (d) => d.code === "jsconfig-typescript-unsupported",
    );
    expect(offending).toHaveLength(1);
    expect(offending[0]?.items).toEqual(["@test/widget-ts"]);
    expect(planned.ok).toBe(false);

    // `--force` must not clear it: the row is `forceable: false`.
    const forced = await plan(loaded.config, ["@test/widget-ts"], {
      interactive: false,
      force: true,
    });
    const stillOffending = forced.diagnostics.filter(
      (d) => d.code === "jsconfig-typescript-unsupported",
    );
    expect(stillOffending).toHaveLength(1);
    expect(stillOffending[0]?.severity).toBe("error");
    expect(forced.ok).toBe(false);
  });
});
