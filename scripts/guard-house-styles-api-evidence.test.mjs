import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { inspectHouseStylesApiEvidence } from "./guard-house-styles-api-evidence.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture({ catalog, evidenceMap, files = {}, directories = [], symlinks = {} }) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "manteen-house-styles-api-"));
  temporaryRoots.push(temporaryRoot);
  const repoRoot = join(temporaryRoot, "repo");
  mkdirSync(repoRoot);
  writeFileSync(join(repoRoot, "manteen.registry.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(
    join(repoRoot, "house-styles-api-evidence.json"),
    `${JSON.stringify(evidenceMap, null, 2)}\n`,
  );

  for (const directory of directories) mkdirSync(join(repoRoot, directory), { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repoRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  for (const [path, target] of Object.entries(symlinks)) {
    const fullPath = join(repoRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    symlinkSync(target, fullPath);
  }

  return { repoRoot, temporaryRoot };
}

const alphaCatalog = {
  items: [{ name: "alpha", stylesApi: { Alpha: ["root"] } }],
};
const alphaMapping = {
  item: "alpha",
  component: "Alpha",
  evidence: "test/alpha.test.ts",
};

describe("house Styles API evidence guard", () => {
  test("passes one explicit claim-to-file binding without inspecting test semantics", () => {
    const { repoRoot } = fixture({
      catalog: alphaCatalog,
      evidenceMap: [alphaMapping],
      files: { "test/alpha.test.ts": "this fixture is intentionally not parsed\n" },
    });

    expect(inspectHouseStylesApiEvidence(repoRoot)).toEqual({
      failures: [],
      claimCount: 1,
      evidenceCount: 1,
    });
  });

  test("fails catalog-to-map drift when a declaration has no mapping", () => {
    const { repoRoot } = fixture({
      catalog: {
        items: [...alphaCatalog.items, { name: "beta", stylesApi: { Beta: ["root"] } }],
      },
      evidenceMap: [alphaMapping],
      files: { "test/alpha.test.ts": "evidence\n" },
    });

    expect(inspectHouseStylesApiEvidence(repoRoot).failures).toContain(
      "manteen.registry.json: stylesApi claim @house/beta#Beta has no evidence mapping",
    );
  });

  test("fails map-to-catalog drift for an item without stylesApi", () => {
    const { repoRoot } = fixture({
      catalog: { items: [{ name: "alpha" }] },
      evidenceMap: [alphaMapping],
      files: { "test/alpha.test.ts": "evidence\n" },
    });

    expect(inspectHouseStylesApiEvidence(repoRoot).failures).toContain(
      "house-styles-api-evidence.json: @house/alpha#Alpha targets an item without stylesApi",
    );
  });

  test("fails both directions when a mapping names the wrong component claim", () => {
    const { repoRoot } = fixture({
      catalog: alphaCatalog,
      evidenceMap: [{ ...alphaMapping, component: "WrongAlpha" }],
      files: { "test/alpha.test.ts": "evidence\n" },
    });
    const failures = inspectHouseStylesApiEvidence(repoRoot).failures;

    expect(failures).toContain(
      "house-styles-api-evidence.json: @house/alpha#WrongAlpha is not declared by the item's stylesApi",
    );
    expect(failures).toContain(
      "manteen.registry.json: stylesApi claim @house/alpha#Alpha has no evidence mapping",
    );
  });

  test("fails when one claim has more than one explicit mapping", () => {
    const { repoRoot } = fixture({
      catalog: alphaCatalog,
      evidenceMap: [alphaMapping, { ...alphaMapping, evidence: "test/alpha-second.test.ts" }],
      files: {
        "test/alpha.test.ts": "evidence\n",
        "test/alpha-second.test.ts": "evidence\n",
      },
    });

    expect(inspectHouseStylesApiEvidence(repoRoot).failures).toContain(
      "house-styles-api-evidence.json: stylesApi claim @house/alpha#Alpha has 2 mappings; expected exactly one",
    );
  });

  test("fails accidental evidence-file reuse across claims", () => {
    const { repoRoot } = fixture({
      catalog: {
        items: [...alphaCatalog.items, { name: "beta", stylesApi: { Beta: ["root"] } }],
      },
      evidenceMap: [
        alphaMapping,
        { item: "beta", component: "Beta", evidence: "test/alpha.test.ts" },
      ],
      files: { "test/alpha.test.ts": "shared evidence\n" },
    });

    expect(inspectHouseStylesApiEvidence(repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence "test/alpha.test.ts" is reused by @house/alpha#Alpha, @house/beta#Beta',
    );
  });

  test("fails missing, non-file, escaping, and symlink evidence paths", () => {
    const missing = fixture({ catalog: alphaCatalog, evidenceMap: [alphaMapping] });
    expect(inspectHouseStylesApiEvidence(missing.repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence file "test/alpha.test.ts" is missing',
    );

    const directory = fixture({
      catalog: alphaCatalog,
      evidenceMap: [alphaMapping],
      directories: ["test/alpha.test.ts"],
    });
    expect(inspectHouseStylesApiEvidence(directory.repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence "test/alpha.test.ts" is not an ordinary file',
    );

    const escaping = fixture({
      catalog: alphaCatalog,
      evidenceMap: [{ ...alphaMapping, evidence: "../outside.test.ts" }],
    });
    writeFileSync(join(escaping.temporaryRoot, "outside.test.ts"), "outside\n");
    expect(inspectHouseStylesApiEvidence(escaping.repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence "../outside.test.ts" must use canonical repository-relative POSIX syntax',
    );

    const symlink = fixture({
      catalog: alphaCatalog,
      evidenceMap: [alphaMapping],
      files: { "test/real.test.ts": "evidence\n" },
      symlinks: { "test/alpha.test.ts": "real.test.ts" },
    });
    expect(inspectHouseStylesApiEvidence(symlink.repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence "test/alpha.test.ts" is not an ordinary file',
    );

    const linkedParent = fixture({
      catalog: alphaCatalog,
      evidenceMap: [{ ...alphaMapping, evidence: "linked/alpha.test.ts" }],
    });
    const outsideDirectory = join(linkedParent.temporaryRoot, "outside");
    mkdirSync(outsideDirectory);
    writeFileSync(join(outsideDirectory, "alpha.test.ts"), "outside\n");
    symlinkSync(outsideDirectory, join(linkedParent.repoRoot, "linked"));
    expect(inspectHouseStylesApiEvidence(linkedParent.repoRoot).failures).toContain(
      'house-styles-api-evidence.json: evidence "linked/alpha.test.ts" resolves outside the repository',
    );
  });
});
