import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  AuthorConformanceError,
  compileRegistry,
  inspectAuthorConformance,
  type MantineRegistry,
} from "../src/build-registry";

const CONFORMANCE = resolve(import.meta.dirname, "../fixtures/conformance/manteen.registry.json");
const LEGACY = resolve(import.meta.dirname, "../fixtures/base/manteen.registry.json");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface FixtureOptions {
  catalog?: Partial<MantineRegistry>;
  mappings?: unknown[];
  profileContents?: string;
  evidenceFiles?: Record<string, string>;
  directories?: string[];
  symlinks?: Record<string, string>;
}

function fixture(options: FixtureOptions = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "manteen-author-conformance-"));
  temporaryRoots.push(temporaryRoot);
  const repositoryRoot = join(temporaryRoot, "repository");
  mkdirSync(repositoryRoot);

  const catalog: MantineRegistry = {
    name: "third-party",
    namespace: "@workshop",
    authorProfile: "manteen.author-profile.json",
    items: [
      {
        name: "alpha",
        kind: "component",
        files: [{ path: "src/alpha.tsx", as: "component" }],
        stylesApi: { Alpha: ["root"] },
      },
    ],
    ...options.catalog,
  };
  const mappings = options.mappings ?? [
    { item: "alpha", component: "Alpha", evidence: "evidence/alpha.contract" },
  ];

  writeFileSync(
    join(repositoryRoot, "manteen.registry.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  writeFileSync(
    join(repositoryRoot, "manteen.author-profile.json"),
    options.profileContents ??
      `${JSON.stringify({ schemaVersion: 2, stylesApi: mappings }, null, 2)}\n`,
  );
  mkdirSync(join(repositoryRoot, "src"), { recursive: true });
  writeFileSync(join(repositoryRoot, "src/alpha.tsx"), "export const Alpha = () => null;\n");

  for (const directory of options.directories ?? []) {
    mkdirSync(join(repositoryRoot, directory), { recursive: true });
  }
  for (const [path, contents] of Object.entries(
    options.evidenceFiles ?? { "evidence/alpha.contract": "not executable and never parsed\n" },
  )) {
    const fullPath = join(repositoryRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  for (const [path, target] of Object.entries(options.symlinks ?? {})) {
    const fullPath = join(repositoryRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    symlinkSync(target, fullPath);
  }

  return {
    temporaryRoot,
    repositoryRoot,
    catalogPath: join(repositoryRoot, "manteen.registry.json"),
    catalog,
  };
}

function failureCodes(created: ReturnType<typeof fixture>): string[] {
  return inspectAuthorConformance(created.catalogPath, created.catalog).failures.map(
    (failure) => failure.code,
  );
}

describe("optional author conformance", () => {
  test("an independent non-Bun registry proves claim ownership without reading evidence", () => {
    const result = compileRegistry(CONFORMANCE);

    expect(result.source.namespace).toBe("@workshop");
    expect(result.authorConformance).toMatchObject({
      enabled: true,
      claimCount: 1,
      evidenceCount: 1,
      failures: [],
    });
    expect(result.authorConformance?.mappings[0]?.evidence).toEndWith(".txt");
  });

  test("legacy catalogs with stylesApi and no profile compile unchanged", () => {
    const result = compileRegistry(LEGACY);

    expect(result.source.items.some((item) => item.stylesApi !== undefined)).toBe(true);
    expect(result.authorConformance).toBeUndefined();
  });

  test("rejects invalid, traversing, and normalization-drift profile references", () => {
    for (const authorProfile of [
      "/tmp/manteen.author-profile.json",
      "../manteen.author-profile.json",
      "profiles/./manteen.author-profile.json",
    ]) {
      const created = fixture({ catalog: { authorProfile } });
      expect(failureCodes(created)).toContain("author-profile-path-invalid");
    }
  });

  test("rejects missing, non-file, symlink, and parent-symlink escape profiles", () => {
    const missing = fixture({ catalog: { authorProfile: "missing-profile.json" } });
    expect(failureCodes(missing)).toContain("author-profile-file-missing");

    const directory = fixture({
      catalog: { authorProfile: "profile-directory" },
      directories: ["profile-directory"],
    });
    expect(failureCodes(directory)).toContain("author-profile-not-file");

    const linkedFile = fixture({
      catalog: { authorProfile: "profile-link.json" },
      symlinks: { "profile-link.json": "manteen.author-profile.json" },
    });
    expect(failureCodes(linkedFile)).toContain("author-profile-not-file");

    const linkedParent = fixture({ catalog: { authorProfile: "linked/profile.json" } });
    const outside = join(linkedParent.temporaryRoot, "outside-profile");
    mkdirSync(outside);
    writeFileSync(join(outside, "profile.json"), "{}\n");
    symlinkSync(outside, join(linkedParent.repositoryRoot, "linked"));
    expect(failureCodes(linkedParent)).toContain("author-profile-path-escape");
  });

  test("rejects malformed and unsupported profile documents", () => {
    const malformed = fixture({ profileContents: "{ malformed\n" });
    expect(failureCodes(malformed)).toContain("author-profile-unreadable");

    const unsupported = fixture({
      profileContents: `${JSON.stringify({ schemaVersion: 1, stylesApi: [] })}\n`,
    });
    expect(failureCodes(unsupported)).toContain("author-profile-schema-invalid");
  });

  test("author profile data and evidence paths never enter item or index wire JSON", () => {
    const result = compileRegistry(CONFORMANCE);
    const wire = JSON.stringify({ items: result.items, index: result.index });

    expect(wire).not.toContain("authorProfile");
    expect(wire).not.toContain("manteen.author-profile.json");
    expect(wire).not.toContain("styles-api-ownership.txt");
    expect(
      result.items.flatMap((item) =>
        (item.files as Array<{ path: string }>).map((file) => file.path),
      ),
    ).toEqual(["src/callout.tsx"]);
  });

  test("fails missing, stale, duplicate, and shared Styles API ownership", () => {
    const missing = fixture({
      catalog: {
        items: [
          {
            name: "alpha",
            kind: "component",
            files: [{ path: "src/alpha.tsx", as: "component" }],
            stylesApi: { Alpha: ["root"], AlphaGroup: ["root"] },
          },
        ],
      },
    });
    expect(failureCodes(missing)).toContain("styles-api-evidence-missing");

    const stale = fixture({
      mappings: [{ item: "alpha", component: "RetiredAlpha", evidence: "evidence/alpha.contract" }],
    });
    expect(failureCodes(stale)).toEqual(
      expect.arrayContaining(["styles-api-evidence-stale", "styles-api-evidence-missing"]),
    );

    const duplicate = fixture({
      mappings: [
        { item: "alpha", component: "Alpha", evidence: "evidence/alpha.contract" },
        { item: "alpha", component: "Alpha", evidence: "evidence/alpha-second.contract" },
      ],
      evidenceFiles: {
        "evidence/alpha.contract": "first\n",
        "evidence/alpha-second.contract": "second\n",
      },
    });
    expect(failureCodes(duplicate)).toContain("styles-api-evidence-duplicate");

    const shared = fixture({
      catalog: {
        items: [
          {
            name: "alpha",
            kind: "component",
            files: [],
            stylesApi: { Alpha: ["root"] },
          },
          {
            name: "beta",
            kind: "component",
            files: [],
            stylesApi: { Beta: ["root"] },
          },
        ],
      },
      mappings: [
        { item: "alpha", component: "Alpha", evidence: "evidence/alpha.contract" },
        { item: "beta", component: "Beta", evidence: "evidence/alpha.contract" },
      ],
    });
    expect(failureCodes(shared)).toContain("evidence-path-shared");
  });

  test("profile v2 proves props and usage claims without interpreting evidence", () => {
    const created = fixture({
      catalog: {
        items: [
          {
            name: "alpha",
            kind: "component",
            files: [{ path: "src/alpha.tsx", as: "component" }],
            stylesApi: { Alpha: ["root"] },
            props: { Alpha: [{ name: "tone", type: '"calm" | "loud"' }] },
            usage: "src/alpha.usage.tsx",
          },
        ],
      },
      profileContents: `${JSON.stringify(
        {
          schemaVersion: 2,
          stylesApi: [{ item: "alpha", component: "Alpha", evidence: "evidence/styles.contract" }],
          props: [{ item: "alpha", export: "Alpha", evidence: "evidence/props.contract" }],
          usage: [{ item: "alpha", evidence: "evidence/usage.contract" }],
        },
        null,
        2,
      )}\n`,
      evidenceFiles: {
        "evidence/styles.contract": "not parsed\n",
        "evidence/props.contract": "not parsed\n",
        "evidence/usage.contract": "not parsed\n",
      },
    });

    expect(inspectAuthorConformance(created.catalogPath, created.catalog)).toMatchObject({
      claimCount: 3,
      evidenceCount: 3,
      failures: [],
    });
  });

  test("props and usage sections reject missing, stale, and globally shared evidence", () => {
    const catalog: Partial<MantineRegistry> = {
      items: [
        {
          name: "alpha",
          kind: "component",
          files: [{ path: "src/alpha.tsx", as: "component" }],
          props: { Alpha: [], AlphaGroup: [] },
          usage: "src/alpha.usage.tsx",
        },
      ],
    };
    const missingAndStale = fixture({
      catalog,
      profileContents: `${JSON.stringify(
        {
          schemaVersion: 2,
          props: [{ item: "alpha", export: "Alpha", evidence: "evidence/alpha.contract" }],
          usage: [{ item: "retired", evidence: "evidence/usage.contract" }],
        },
        null,
        2,
      )}\n`,
      evidenceFiles: {
        "evidence/alpha.contract": "not parsed\n",
        "evidence/usage.contract": "not parsed\n",
      },
    });
    expect(failureCodes(missingAndStale)).toEqual(
      expect.arrayContaining([
        "props-evidence-missing",
        "usage-evidence-stale",
        "usage-evidence-missing",
      ]),
    );

    const shared = fixture({
      catalog,
      profileContents: `${JSON.stringify(
        {
          schemaVersion: 2,
          props: [
            { item: "alpha", export: "Alpha", evidence: "evidence/alpha.contract" },
            { item: "alpha", export: "AlphaGroup", evidence: "evidence/group.contract" },
          ],
          usage: [{ item: "alpha", evidence: "evidence/alpha.contract" }],
        },
        null,
        2,
      )}\n`,
      evidenceFiles: {
        "evidence/alpha.contract": "not parsed\n",
        "evidence/group.contract": "not parsed\n",
      },
    });
    expect(failureCodes(shared)).toContain("evidence-path-shared");
  });

  test("rejects empty, absolute, traversal, and normalization-drift evidence paths", () => {
    for (const evidence of [
      "",
      "/tmp/absolute.contract",
      "C:/absolute.contract",
      "../outside.contract",
      "evidence/./alpha.contract",
      "evidence\\alpha.contract",
    ]) {
      const created = fixture({ mappings: [{ item: "alpha", component: "Alpha", evidence }] });
      expect(failureCodes(created)).toContain(
        evidence === "" ? "author-profile-schema-invalid" : "evidence-path-invalid",
      );
    }
  });

  test("rejects missing, non-file, symlink, and parent-symlink escape evidence", () => {
    const missing = fixture({ evidenceFiles: {} });
    expect(failureCodes(missing)).toContain("evidence-file-missing");

    const directory = fixture({ evidenceFiles: {}, directories: ["evidence/alpha.contract"] });
    expect(failureCodes(directory)).toContain("evidence-not-file");

    const linkedFile = fixture({
      evidenceFiles: { "evidence/real.contract": "evidence\n" },
      symlinks: { "evidence/alpha.contract": "real.contract" },
    });
    expect(failureCodes(linkedFile)).toContain("evidence-not-file");

    const linkedParent = fixture({
      mappings: [{ item: "alpha", component: "Alpha", evidence: "linked/alpha.contract" }],
      evidenceFiles: {},
    });
    const outside = join(linkedParent.temporaryRoot, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "alpha.contract"), "outside\n");
    symlinkSync(outside, join(linkedParent.repositoryRoot, "linked"));
    expect(failureCodes(linkedParent)).toContain("evidence-path-escape");
  });

  test("compileRegistry refuses an invalid opted-in profile before rendering", () => {
    const created = fixture({
      profileContents: `${JSON.stringify({ schemaVersion: 2, stylesApi: [] })}\n`,
    });

    expect(() => compileRegistry(created.catalogPath)).toThrow(AuthorConformanceError);
  });
});
