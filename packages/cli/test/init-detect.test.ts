import { describe, expect, test } from "bun:test";

import { detectFramework, type InitDetectionSnapshot } from "../src/init/detect";

function snapshot(
  dependencies: readonly string[],
  paths: readonly string[],
): InitDetectionSnapshot {
  return { root: "/project", dependencies: new Set(dependencies), paths: new Set(paths) };
}

describe("W6 framework detection", () => {
  test("a Vite SPA using react-router as a library stays Vite", () => {
    const result = detectFramework(
      snapshot(["vite", "react-router"], ["vite.config.ts", "index.html", "src/main.tsx"]),
    );
    expect(result.ok && result.framework.kind).toBe("vite");
  });

  test("a framework-mode React Router marker wins before generic Vite", () => {
    const result = detectFramework(
      snapshot(
        ["vite", "react-router", "@react-router/dev"],
        ["vite.config.ts", "index.html", "app/root.tsx", "react-router.config.ts"],
      ),
    );
    expect(result.ok && result.framework.kind).toBe("react-router");
  });

  test("a partial React Router project does not fall through to Vite", () => {
    const result = detectFramework(
      snapshot(["vite", "@react-router/dev"], ["vite.config.ts", "index.html"]),
    );
    expect(result.ok && result.framework.kind).toBe("react-router");
  });

  test("Next root/src App and Pages markers produce the one legal adapter set", () => {
    const result = detectFramework(
      snapshot(["next"], ["src/app/layout.tsx", "src/pages/_app.tsx"]),
    );
    expect(result.ok && result.framework).toEqual({
      kind: "next-hybrid",
      adapters: ["next-app", "next-pages"],
    });
  });

  test("incompatible root frameworks are ambiguous in canonical order", () => {
    const result = detectFramework(
      snapshot(
        ["next", "@react-router/dev"],
        ["app/layout.tsx", "app/root.tsx", "react-router.config.ts"],
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "ambiguous",
      candidates: ["next-app", "react-router"],
    });
  });

  test("an explicit valid framework resolves ambiguity", () => {
    const input = snapshot(
      ["next", "@react-router/dev"],
      ["app/layout.tsx", "app/root.tsx", "react-router.config.ts"],
    );
    const result = detectFramework(input, "next-app");
    expect(result.ok && result.source).toBe("override");
    expect(result.ok && result.framework.kind).toBe("next-app");
  });

  test("an override cannot invent missing framework markers", () => {
    const result = detectFramework(
      snapshot(["vite"], ["vite.config.ts", "index.html"]),
      "next-app",
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "override-conflict",
      candidates: ["vite"],
    });
  });

  test("manual is an explicit Tier B escape even with no markers", () => {
    const result = detectFramework(snapshot([], []), "manual");
    expect(result.ok && result.framework).toEqual({ kind: "manual", adapters: [] });
  });

  test("no markers is unrecognized, never guessed", () => {
    expect(detectFramework(snapshot([], []))).toMatchObject({
      ok: false,
      reason: "unrecognized",
      candidates: [],
    });
  });
});
