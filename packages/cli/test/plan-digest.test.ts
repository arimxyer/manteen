import { describe, expect, test } from "bun:test";

import type { InitPlan } from "../src/init/types";
import {
  digestInitPlan,
  digestPlan,
  digestRemovalPlan,
  planDigestMatches,
  stableJson,
} from "../src/plan/digest";
import type { Plan } from "../src/plan/types";
import type { RemovalPlan } from "../src/removal/types";

describe("plan digests", () => {
  test("canonical JSON sorts object keys but retains array order", () => {
    expect(stableJson({ b: 1, a: ["x", "y"] })).toBe('{"a":["x","y"],"b":1}');
    expect(stableJson({ a: ["y", "x"], b: 1 })).not.toBe(stableJson({ b: 1, a: ["x", "y"] }));
  });

  test("add digest excludes source bodies and includes preimages and options", () => {
    const first = digestPlan(plan("source one", "a"), { refs: ["@house/card"] });
    expect(digestPlan(plan("source two", "a"), { refs: ["@house/card"] })).toBe(first);
    expect(digestPlan(plan("source two", "b"), { refs: ["@house/card"] })).not.toBe(first);
    expect(digestPlan(plan("source one", "a"), { refs: ["@house/other"] })).not.toBe(first);
    expect(planDigestMatches(first, first.toUpperCase())).toBe(true);
  });

  test("init and removal digests are stable and operation-specific", () => {
    const init = digestInitPlan({
      version: 1,
      root: "/project",
      framework: { kind: "manual", adapters: [] },
      files: [],
      dependencies: [],
      packageManager: null,
      installCommand: null,
      instructions: [],
      diagnostics: [],
      ok: true,
    } satisfies InitPlan);
    const removal = digestRemovalPlan({
      root: "/project",
      ok: true,
      dryRun: true,
      candidates: [],
      removals: [],
      receipt: {
        path: "/project/manteen.lock.json",
        sha256: null,
        projectedText: "",
        projectedChange: false,
      },
      diagnostics: [],
      notes: [],
      stateIgnored: false,
    } satisfies RemovalPlan);
    expect(init).toMatch(/^[0-9a-f]{64}$/);
    expect(removal).toMatch(/^[0-9a-f]{64}$/);
    expect(removal).not.toBe(init);
  });
});

function plan(content: string, existingSha256: string): Plan {
  const file = {
    itemId: "@house/card",
    sourcePath: "card.tsx",
    target: "ui" as const,
    wireType: "registry:ui",
    content,
    destination: "/project/ui/card.tsx",
    sha256: "result",
    upstream: { content, sha256: "upstream" },
    base: {
      destination: "/project/.manteen/bases/card",
      content,
      sha256: "upstream",
      existing: null,
    },
    existing: { sha256: existingSha256 },
    disposition: "overwrite" as const,
    priorOwner: null,
  };
  return {
    version: 1,
    operation: "add",
    root: "/project",
    configPath: "/project/manteen.json",
    items: [
      {
        id: "@house/card",
        namespace: "@house",
        name: "card",
        wireType: "registry:ui",
        sourceUrl: "https://example.test/${TOKEN}/card.json",
        requestedBy: ["<root>"],
        dependsOn: [],
        cssImports: [],
        files: [file],
      },
    ],
    files: [file],
    removedBases: [],
    dependencies: [],
    packageManager: "npm",
    installCommand: null,
    theme: null,
    styles: null,
    verification: null,
    mantine: { state: "found", version: "9.0.0", from: "package.json" },
    receipt: { present: false, path: "/project/manteen.lock.json" },
    stateIgnored: true,
    diagnostics: [],
    ok: true,
  };
}
