/** Filesystem-backed detection and finite project snapshots for W6 init. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Diagnostic } from "../plan/types";
import { detectFramework, type InitDetectionSnapshot } from "./detect";
import { initConfigConflict } from "./diagnostics";
import { VITE_CONFIG_PATHS } from "./framework-paths";
import { postcssCandidatePaths } from "./postcss";
import type {
  InitDetectionResult,
  InitFrameworkFlag,
  InitFrameworkSet,
  InitProjectLayout,
  InitProjectSnapshot,
} from "./types";

const DETECTION_PATHS = [
  "react-router.config.ts",
  "react-router.config.js",
  "react-router.config.mjs",
  "react-router.config.cjs",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "index.html",
  "src/main.tsx",
  "app/root.tsx",
  "app/layout.tsx",
  "src/app/layout.tsx",
  "pages/_app.tsx",
  "src/pages/_app.tsx",
  "pages/_document.tsx",
  "src/pages/_document.tsx",
] as const;

const ENTRY_PATHS = [
  "src/App.tsx",
  "app/root.tsx",
  "app/layout.tsx",
  "src/app/layout.tsx",
  "pages/_app.tsx",
  "src/pages/_app.tsx",
  "pages/_document.tsx",
  "src/pages/_document.tsx",
] as const;

export class InitProjectError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "InitProjectError";
  }
}

function readIfPresent(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function parsePackage(path: string, source: string | undefined): Record<string, unknown> {
  if (source === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(source);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The diagnostic below is deliberately the same for syntax and root-shape
    // failures: both have the same remedy and neither should escape as JSON's
    // implementation-specific thrown text.
  }
  throw new InitProjectError(initConfigConflict(path, "package.json is not a JSON object"));
}

function dependenciesFromPackage(parsed: Record<string, unknown>): Map<string, string> {
  const dependencies = new Map<string, string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = parsed[field];
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === "string" && !dependencies.has(name)) dependencies.set(name, range);
    }
  }
  return dependencies;
}

function existingPaths(root: string, candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => existsSync(join(root, candidate)));
}

function oneViteConfig(root: string): string {
  const configs = existingPaths(root, VITE_CONFIG_PATHS);
  if (configs.length === 1) return join(root, configs[0]!);
  const destination = join(root, configs[0] ?? "vite.config.ts");
  const detail =
    configs.length === 0
      ? "the active Vite config is missing"
      : `multiple Vite configs exist (${configs.join(", ")})`;
  throw new InitProjectError(initConfigConflict(destination, detail));
}

function sourceRootFor(root: string, framework: InitFrameworkSet): string {
  switch (framework.kind) {
    case "vite":
      return join(root, "src");
    case "react-router":
      return join(root, "app");
    case "next-app":
    case "next-pages":
    case "next-hybrid": {
      const atRoot = existingPaths(root, [
        "app/layout.tsx",
        "pages/_app.tsx",
        "pages/_document.tsx",
      ]);
      const inSrc = existingPaths(root, [
        "src/app/layout.tsx",
        "src/pages/_app.tsx",
        "src/pages/_document.tsx",
      ]);
      if (atRoot.length > 0 && inSrc.length > 0) {
        throw new InitProjectError(
          initConfigConflict(
            root,
            `Next router entries are split between the project root and src (${[
              ...atRoot,
              ...inSrc,
            ].join(", ")})`,
          ),
        );
      }
      return inSrc.length > 0 ? join(root, "src") : root;
    }
    case "manual": {
      const src = join(root, "src");
      return existsSync(src) && statSync(src).isDirectory() ? src : root;
    }
  }
}

function layoutFor(root: string, framework: InitFrameworkSet): InitProjectLayout {
  const sourceRoot = sourceRootFor(root, framework);
  const tsconfigPath =
    framework.kind === "vite" && existsSync(join(root, "tsconfig.app.json"))
      ? join(root, "tsconfig.app.json")
      : join(root, "tsconfig.json");
  return {
    root,
    sourceRoot,
    tsconfigPath,
    configPath: join(root, "manteen.json"),
    themePath: join(sourceRoot, "lib", "theme.ts"),
    themeImport: "@/lib/theme",
    stylesPath: join(sourceRoot, "manteen.css"),
  };
}

export async function detectProjectFramework(
  cwd: string,
  override?: InitFrameworkFlag,
): Promise<InitDetectionResult> {
  const root = resolve(cwd);
  const packagePath = join(root, "package.json");
  const packageSource = readIfPresent(packagePath);
  const parsed = parsePackage(packagePath, packageSource);
  const snapshot: InitDetectionSnapshot = {
    root,
    dependencies: new Set(dependenciesFromPackage(parsed).keys()),
    paths: new Set(existingPaths(root, DETECTION_PATHS)),
  };
  return detectFramework(snapshot, override);
}

/**
 * Read exactly the files the shared planner and selected adapters can inspect.
 * No adapter gets an open-ended filesystem handle.
 */
export async function createProjectSnapshot(
  cwd: string,
  framework: InitFrameworkSet,
): Promise<InitProjectSnapshot> {
  const root = resolve(cwd);
  const layout = layoutFor(root, framework);
  const packagePath = join(root, "package.json");
  const packageSource = readIfPresent(packagePath);
  const parsed = parsePackage(packagePath, packageSource);
  const files = new Map<string, string>();
  const frameworkConfigPath =
    framework.kind === "vite" || framework.kind === "react-router" ? oneViteConfig(root) : null;

  const candidates = new Set<string>([
    packagePath,
    join(root, "manteen.json"),
    layout.tsconfigPath,
    layout.configPath,
    ...(frameworkConfigPath === null ? [] : [frameworkConfigPath]),
    layout.themePath,
    layout.stylesPath,
    ...ENTRY_PATHS.map((path) => join(root, path)),
    ...postcssCandidatePaths(framework).map((path) => join(root, path)),
  ]);

  for (const path of candidates) {
    const source = path === packagePath ? packageSource : readIfPresent(path);
    if (source !== undefined) files.set(path, source);
  }

  return {
    layout,
    files,
    declaredDependencies: dependenciesFromPackage(parsed),
  };
}
