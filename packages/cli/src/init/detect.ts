/** Pure W6 framework detection over a finite, root-relative snapshot. */
import type { InitDetectionResult, InitFrameworkEvidence, InitFrameworkFlag } from "./types";
import { frameworkSetFor, INIT_FRAMEWORK_FLAGS } from "./types";

export interface InitDetectionSnapshot {
  root: string;
  dependencies: ReadonlySet<string>;
  /** POSIX paths relative to `root`; the filesystem port normalizes them. */
  paths: ReadonlySet<string>;
}

const RR_CONFIGS = [
  "react-router.config.ts",
  "react-router.config.js",
  "react-router.config.mjs",
  "react-router.config.cjs",
] as const;
const VITE_CONFIGS = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
] as const;

function byFlag(a: InitFrameworkFlag, b: InitFrameworkFlag): number {
  return INIT_FRAMEWORK_FLAGS.indexOf(a) - INIT_FRAMEWORK_FLAGS.indexOf(b);
}

function evidence(snapshot: InitDetectionSnapshot): InitFrameworkEvidence[] {
  const found: InitFrameworkEvidence[] = [];
  const dependency = (name: string): void => {
    if (!snapshot.dependencies.has(name)) return;
    found.push({
      marker: `dependency:${name}`,
      path: `${snapshot.root}/package.json`,
      detail: `${name} is declared by the project`,
    });
  };
  const path = (name: string): void => {
    if (!snapshot.paths.has(name)) return;
    found.push({
      marker: `path:${name}`,
      path: `${snapshot.root}/${name}`,
      detail: `${name} exists`,
    });
  };

  dependency("@react-router/dev");
  dependency("next");
  dependency("vite");
  for (const name of RR_CONFIGS) path(name);
  path("app/root.tsx");
  for (const name of VITE_CONFIGS) path(name);
  path("index.html");
  path("src/main.tsx");
  path("app/layout.tsx");
  path("src/app/layout.tsx");
  path("pages/_app.tsx");
  path("src/pages/_app.tsx");
  path("pages/_document.tsx");
  path("src/pages/_document.tsx");
  return found;
}

function candidates(snapshot: InitDetectionSnapshot): InitFrameworkFlag[] {
  const has = (path: string): boolean => snapshot.paths.has(path);
  const hasAny = (paths: readonly string[]): boolean => paths.some(has);
  const result: InitFrameworkFlag[] = [];

  // A partial framework-mode React Router marker deliberately suppresses Vite.
  // Falling through would rewrite App.tsx in a project whose real document root
  // is merely missing or relocated; the RR adapter can name that missing seam.
  const reactRouter = snapshot.dependencies.has("@react-router/dev") || hasAny(RR_CONFIGS);
  if (reactRouter) result.push("react-router");

  if (snapshot.dependencies.has("next")) {
    const app = has("app/layout.tsx") || has("src/app/layout.tsx");
    const pages =
      has("pages/_app.tsx") ||
      has("src/pages/_app.tsx") ||
      has("pages/_document.tsx") ||
      has("src/pages/_document.tsx");
    if (app && pages) result.push("next-hybrid");
    else if (app) result.push("next-app");
    else if (pages) result.push("next-pages");
  }

  const vite =
    !reactRouter &&
    (snapshot.dependencies.has("vite") || hasAny(VITE_CONFIGS)) &&
    (has("index.html") || has("src/main.tsx"));
  if (vite) result.push("vite");

  return result.sort(byFlag);
}

/**
 * Detection only selects adapters. Entry/config safety is the adapter or
 * shared planner's job, which is why a partial React Router marker selects RR
 * and later refuses instead of silently becoming Vite.
 */
export function detectFramework(
  snapshot: InitDetectionSnapshot,
  override?: InitFrameworkFlag,
): InitDetectionResult {
  const matched = candidates(snapshot);
  const observed = evidence(snapshot);

  if (override === "manual") {
    return {
      ok: true,
      source: "override",
      framework: frameworkSetFor("manual"),
      evidence: observed,
    };
  }

  if (override !== undefined) {
    if (matched.includes(override)) {
      return {
        ok: true,
        source: "override",
        framework: frameworkSetFor(override),
        evidence: observed,
      };
    }
    return {
      ok: false,
      reason: "override-conflict",
      candidates: matched,
      evidence: observed,
    };
  }

  if (matched.length === 0) {
    return { ok: false, reason: "unrecognized", candidates: [], evidence: observed };
  }
  if (matched.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: matched, evidence: observed };
  }

  const framework = matched[0];
  if (framework === undefined) {
    return { ok: false, reason: "unrecognized", candidates: [], evidence: observed };
  }
  return {
    ok: true,
    source: "detected",
    framework: frameworkSetFor(framework),
    evidence: observed,
  };
}
