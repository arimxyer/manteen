import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { inspectHouseStylesApiEvidence } from "./guard-house-styles-api-evidence.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture({ evidence = "test/alpha.test.ts", mappings, testScript, authorProfile = true }) {
  const repoRoot = mkdtempSync(join(tmpdir(), "manteen-house-styles-api-"));
  temporaryRoots.push(repoRoot);
  const catalog = {
    name: "house",
    namespace: "@house",
    ...(authorProfile ? { authorProfile: "house-styles-api-evidence.json" } : {}),
    items: [
      {
        name: "alpha",
        kind: "component",
        files: [],
        stylesApi: { Alpha: ["root"] },
      },
    ],
  };
  const profile = {
    schemaVersion: 2,
    stylesApi: mappings ?? [{ item: "alpha", component: "Alpha", evidence }],
  };

  writeFileSync(join(repoRoot, "manteen.registry.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(
    join(repoRoot, "house-styles-api-evidence.json"),
    `${JSON.stringify(profile, null, 2)}\n`,
  );
  writeFileSync(
    join(repoRoot, "package.json"),
    `${JSON.stringify(
      { scripts: { test: testScript ?? "bun run build:kit && bun test" } },
      null,
      2,
    )}\n`,
  );
  const evidencePath = join(repoRoot, evidence);
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, "contents are never parsed\n");
  return repoRoot;
}

describe("house Styles API evidence adapter", () => {
  test("delegates ownership to the generic profile and adds Bun discovery", () => {
    expect(inspectHouseStylesApiEvidence(fixture({}))).toEqual({
      failures: [],
      claimCount: 1,
      evidenceCount: 1,
    });
  });

  test("retains the house-only root Bun discovery contract", () => {
    const failures = inspectHouseStylesApiEvidence(
      fixture({ evidence: "evidence/alpha.contract" }),
    ).failures;

    expect(failures).toContain(
      "evidence/alpha.contract: house evidence is outside the repository's plain bun test discovery surface",
    );
  });

  test("fails closed if the house test command changes", () => {
    const failures = inspectHouseStylesApiEvidence(
      fixture({ testScript: "bun test test/other.test.ts" }),
    ).failures;

    expect(failures).toContain(
      'package.json: test script drifted from "bun run build:kit && bun test"; review the evidence discovery guard before changing the normal test surface',
    );
  });

  test("requires the house catalog to exercise the optional generic profile", () => {
    const failures = inspectHouseStylesApiEvidence(fixture({ authorProfile: false })).failures;

    expect(failures).toContain(
      "manteen.registry.json: the house registry must opt into authorProfile",
    );
  });

  test("surfaces generic bidirectional ownership failures", () => {
    const failures = inspectHouseStylesApiEvidence(
      fixture({
        mappings: [
          {
            item: "alpha",
            component: "RetiredAlpha",
            evidence: "test/alpha.test.ts",
          },
        ],
      }),
    ).failures;

    expect(failures.some((failure) => failure.startsWith("styles-api-evidence-missing:"))).toBe(
      true,
    );
  });
});
