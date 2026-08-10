import { describe, expect, test } from "bun:test";

import {
  initConfigConflict,
  initConfigIssue,
  initFrameworkAmbiguous,
  initFrameworkMismatch,
  initFrameworkUnrecognized,
  initPathEscapesRoot,
  initPostcssUnsupported,
  initSourceUnsupported,
} from "../src/init/diagnostics";
import {
  frameworkSetFor,
  INIT_FRAMEWORK_FLAGS,
  type InitPlan,
  isInitMutationPlanEmpty,
  isInitSetupComplete,
} from "../src/init/types";
import { blockingExitCode, DIAGNOSTIC_CODES } from "../src/plan/diagnostics";

describe("W6 framework-set contract", () => {
  test("the flag vocabulary and hybrid adapter order are frozen", () => {
    expect(INIT_FRAMEWORK_FLAGS).toEqual([
      "vite",
      "next-app",
      "next-pages",
      "next-hybrid",
      "react-router",
      "manual",
    ]);
    expect(frameworkSetFor("next-hybrid")).toEqual({
      kind: "next-hybrid",
      adapters: ["next-app", "next-pages"],
    });
    expect(frameworkSetFor("manual")).toEqual({ kind: "manual", adapters: [] });
  });
});
describe("W6 diagnostic contract", () => {
  const detection = [
    initFrameworkUnrecognized("/project"),
    initFrameworkAmbiguous("/project", ["vite", "react-router"]),
    initFrameworkMismatch("/project", "next-app", "app/layout.tsx is absent."),
    initConfigConflict("/project/tsconfig.json", "@/* already points outside the source root."),
  ];
  const transforms = [
    initSourceUnsupported("/project/src/App.tsx", "the default export is computed."),
    initPostcssUnsupported("/project/postcss.config.mjs", "plugins are produced by a function."),
    initPathEscapesRoot("/project", "/shared/theme.ts"),
  ];

  test("detection and authored-config failures are non-forceable exit 2", () => {
    for (const diagnostic of detection) {
      expect(DIAGNOSTIC_CODES[diagnostic.code]).toEqual({
        severity: "error",
        forceable: false,
        exit: 2,
      });
      expect(blockingExitCode([diagnostic], true)).toBe(2);
    }
  });

  test("unsafe transforms are non-forceable exit 1", () => {
    for (const diagnostic of transforms) {
      expect(DIAGNOSTIC_CODES[diagnostic.code]).toEqual({
        severity: "error",
        forceable: false,
        exit: 1,
      });
      expect(blockingExitCode([diagnostic], true)).toBe(1);
    }
  });

  test("every refusal names a recovery rather than a silent no-op", () => {
    expect(detection.map((entry) => entry.message).join("\n")).toContain("--framework manual");
    expect(detection.map((entry) => entry.message).join("\n")).toContain("re-run manteen init");
    expect(transforms.map((entry) => entry.message).join("\n")).toContain("manually");
    expect(transforms.map((entry) => entry.message).join("\n")).toContain("Nothing was written");
  });

  test("missing config fields are distinct from conflicts and expose reviewable patches", () => {
    const missing = initConfigIssue("/project/manteen.json", {
      kind: "missing-field",
      field: "`aliases`",
      detail: "aliases choose source destinations.",
      patch: { aliases: { lib: "@/lib" } },
    });
    const conflicting = initConfigIssue("/project/manteen.json", {
      kind: "conflicting-field",
      field: "`theme`",
      detail: "expected src/lib/theme.ts",
    });

    expect(missing.message).toContain("does not declare `aliases`");
    expect(missing.actions).toEqual([
      { kind: "configPatch", patch: { aliases: { lib: "@/lib" } } },
    ]);
    expect(conflicting.message).toContain("has an explicit `theme` value");
    expect(conflicting.actions).toBeUndefined();
  });
});

function plan(instructions: InitPlan["instructions"]): InitPlan {
  return {
    version: 1,
    root: "/project",
    framework: frameworkSetFor("vite"),
    files: [],
    dependencies: [],
    packageManager: null,
    installCommand: null,
    instructions,
    diagnostics: [],
    ok: true,
  };
}

describe("W6 empty-plan and completion semantics", () => {
  test("required manual work does not fabricate a mutation", () => {
    const result = plan([
      {
        code: "tailwind-postcss",
        required: true,
        message: "Place this block in the existing Tailwind pipeline.",
        snippet: "postcss-preset-mantine",
      },
    ]);

    expect(isInitMutationPlanEmpty(result)).toBe(true);
    expect(isInitSetupComplete(result)).toBe(false);
  });

  test("no mutations and no required instructions is complete", () => {
    const result = plan([]);
    expect(isInitMutationPlanEmpty(result)).toBe(true);
    expect(isInitSetupComplete(result)).toBe(true);
  });
});
