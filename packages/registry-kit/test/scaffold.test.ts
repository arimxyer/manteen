import { afterEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { compileRegistry } from "../src/build-registry";
import {
  applyScaffold,
  applyScaffoldWithHooks,
  planScaffold,
  ScaffoldError,
  type ScaffoldInput,
} from "../src/scaffold";
import { SCAFFOLD_TEMPLATES, type ScaffoldTemplate } from "../src/scaffold-templates";

const roots: string[] = [];

interface FixtureOptions {
  profile?: boolean;
  packageManifest?: boolean;
}

function fixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "manteen-scaffold-"));
  roots.push(root);
  const catalogPath = join(root, "manteen.registry.json");
  const catalog = {
    name: "Scaffold fixture",
    namespace: "@scaffold",
    ...(options.profile ? { authorProfile: "manteen.author-profile.json" } : {}),
    items: [],
  };
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  if (options.profile) {
    writeFileSync(
      join(root, "manteen.author-profile.json"),
      `${JSON.stringify({ schemaVersion: 1, stylesApi: [] }, null, 2)}\n`,
    );
  }
  if (options.packageManifest) {
    writeFileSync(join(root, "package.json"), '{"name":"scaffold-fixture","private":true}\n');
  }
  return { root, catalogPath, catalog };
}

function input(catalogPath: string, template: ScaffoldTemplate = "component-basic"): ScaffoldInput {
  return { catalogPath, template, itemName: "status-card" };
}

function snapshot(root: string): Map<string, string> {
  const entries = new Map<string, string>();
  const visit = (directory: string, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const status = lstatSync(path);
      if (status.isDirectory()) {
        entries.set(`${relativePath}/`, "directory");
        visit(path, relativePath);
      } else if (status.isSymbolicLink()) {
        entries.set(relativePath, "symlink");
      } else {
        entries.set(relativePath, readFileSync(path, "utf8"));
      }
    }
  };
  visit(root);
  return entries;
}

function diagnostics(error: unknown): string[] {
  expect(error).toBeInstanceOf(ScaffoldError);
  return (error as ScaffoldError).diagnostics.map((diagnostic) => diagnostic.code);
}

function writePlannedFile(root: string, path: string, content: string): void {
  const destination = join(root, ...path.split("/"));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function outsideFixture() {
  const root = mkdtempSync(join(tmpdir(), "manteen-scaffold-outside-"));
  roots.push(root);
  return root;
}

function substituteParentWithLink(
  catalogRoot: string,
  operationPath: string,
  outsideRoot: string,
  label: string,
) {
  const parent = dirname(join(catalogRoot, ...operationPath.split("/")));
  const held = join(outsideRoot, `${label}-held`);
  const redirect = join(outsideRoot, `${label}-redirect`);
  renameSync(parent, held);
  mkdirSync(redirect);
  const sentinel = join(redirect, "sentinel.txt");
  writeFileSync(sentinel, "outside unchanged\n");
  symlinkSync(redirect, parent);
  return { held, redirect, sentinel };
}

function preservedBytes(root: string): Map<string, string> {
  return new Map(
    ["manteen.registry.json", "manteen.author-profile.json", "package.json"].map((path) => [
      path,
      readFileSync(join(root, path), "utf8"),
    ]),
  );
}

function expectPreservedBytes(root: string, preserved: Map<string, string>): void {
  for (const [path, bytes] of preserved) {
    expect(readFileSync(join(root, path), "utf8")).toBe(bytes);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("safe author scaffold planning", () => {
  test("is stable, code-unit ordered, complete, and zero-write", () => {
    const created = fixture({ profile: true, packageManifest: true });
    const before = snapshot(created.root);
    const first = planScaffold(input(created.catalogPath, "component-styles-api"));
    const second = planScaffold(input(created.catalogPath, "component-styles-api"));

    expect(first).toEqual(second);
    expect(first.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.safe).toBe(true);
    expect(first.files.map((file) => file.path)).toEqual(
      [...first.files.map((file) => file.path)].sort(),
    );
    expect(first.files.every((file) => file.content.length > 0 && file.sha256.length === 64)).toBe(
      true,
    );
    expect(first.catalogInsertion).toMatchObject({
      name: "status-card",
      mantine: ">=9.5.0 <10",
      npm: ["@mantine/core@^9.5.0"],
      stylesApi: { StatusCard: ["root", "label"] },
    });
    expect(first.authorProfileInsertion).toEqual({
      profilePath: "manteen.author-profile.json",
      mapping: {
        item: "status-card",
        component: "StatusCard",
        evidence: "test/status-card-styles-api.test.tsx",
      },
    });
    expect(JSON.stringify(first)).not.toContain("componentApi");
    expect(snapshot(created.root)).toEqual(before);
  });

  test("all three templates accurately describe only the files they emit", () => {
    const created = fixture();
    const plans = Object.fromEntries(
      SCAFFOLD_TEMPLATES.map((template) => [
        template,
        planScaffold(input(created.catalogPath, template)),
      ]),
    ) as Record<ScaffoldTemplate, ReturnType<typeof planScaffold>>;

    expect(plans["component-basic"].files.map((file) => file.path)).toEqual([
      "src/status-card/status-card.tsx",
    ]);
    expect(plans["component-basic"].catalogInsertion.files).toEqual([
      { path: "src/status-card/status-card.tsx", as: "component" },
    ]);
    expect(plans["component-basic"].files[0]!.content).not.toContain("factory");

    expect(plans["component-styles-api"].files.map((file) => file.path)).toEqual([
      "src/status-card/status-card.module.css",
      "src/status-card/status-card.tsx",
      "src/status-card/status-card.usage.tsx",
      "test/status-card-styles-api.test.tsx",
    ]);
    expect(plans["component-styles-api"].catalogInsertion.files).toEqual([
      { path: "src/status-card/status-card.tsx", as: "component" },
      {
        path: "src/status-card/status-card.module.css",
        as: "style",
        target: "@ui/status-card.module.css",
      },
    ]);
    expect(plans["component-styles-api"].files[1]!.content).toContain("useStyles");
    expect(plans["component-styles-api"].files[3]!.content).toContain(".extend");

    expect(plans["component-polymorphic"].files.map((file) => file.path)).toEqual([
      "src/status-card/status-card.tsx",
      "src/status-card/status-card.usage.tsx",
    ]);
    expect(plans["component-polymorphic"].files[0]!.content).toContain("polymorphicFactory");
    expect(plans["component-polymorphic"].files[1]!.content).toContain('component="a"');
    expect(plans["component-basic"].files[0]!.content).not.toContain("polymorphicFactory");
    expect(plans["component-styles-api"].files[1]!.content).not.toContain("polymorphicFactory");

    const digitName = planScaffold({
      catalogPath: created.catalogPath,
      template: "component-styles-api",
      itemName: "chart-2d",
    });
    expect(digitName.safe).toBe(true);
    expect(digitName.files.find((file) => file.path.endsWith(".tsx"))?.content).toContain(
      'import classes from "./chart-2d.module.css"',
    );
  });

  test("rejects catalog collisions, invalid names, and path normalization drift", () => {
    const created = fixture();
    writeFileSync(
      created.catalogPath,
      `${JSON.stringify({ ...created.catalog, items: [{ name: "status-card", kind: "component", files: [] }] }, null, 2)}\n`,
    );
    expect(planScaffold(input(created.catalogPath)).diagnostics.map((item) => item.code)).toContain(
      "scaffold-catalog-item-collision",
    );

    const traversing = planScaffold({
      catalogPath: created.catalogPath,
      template: "component-basic",
      itemName: "../escape",
    });
    expect(traversing.safe).toBe(false);
    expect(traversing.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["scaffold-item-name-invalid", "scaffold-path-invalid"]),
    );
    expect(
      planScaffold({
        catalogPath: created.catalogPath,
        template: "component-basic",
        itemName: "1-card",
      }).diagnostics.map((item) => item.code),
    ).toContain("scaffold-item-name-invalid");
    for (const itemName of ["a--b", "con", "nul", "com1", "lpt9"]) {
      const invalid = planScaffold({
        catalogPath: created.catalogPath,
        template: "component-basic",
        itemName,
      });
      expect(invalid.safe).toBe(false);
      expect(invalid.diagnostics.map((item) => item.code)).toContain("scaffold-item-name-invalid");
    }

    try {
      planScaffold({
        catalogPath: created.catalogPath,
        template: "unknown-template" as ScaffoldTemplate,
        itemName: "status-card",
      });
      throw new Error("unknown template unexpectedly planned");
    } catch (error) {
      expect(diagnostics(error)).toContain("scaffold-template-invalid");
    }
  });
});

describe("safe author scaffold apply", () => {
  test("applies a matching plan and a newly planned exact second run is a no-op", () => {
    const created = fixture({ profile: true, packageManifest: true });
    const preserved = new Map(
      ["manteen.registry.json", "manteen.author-profile.json", "package.json"].map((path) => [
        path,
        readFileSync(join(created.root, path), "utf8"),
      ]),
    );
    const firstPlan = planScaffold(input(created.catalogPath, "component-styles-api"));
    const first = applyScaffold(
      input(created.catalogPath, "component-styles-api"),
      firstPlan.planDigest,
    );

    expect(first.mutated).toBe(true);
    expect(first.writtenPaths).toEqual(firstPlan.files.map((file) => file.path));
    const secondPlan = planScaffold(input(created.catalogPath, "component-styles-api"));
    expect(secondPlan.files.every((file) => file.operation === "noop")).toBe(true);
    const second = applyScaffold(
      input(created.catalogPath, "component-styles-api"),
      secondPlan.planDigest,
    );
    expect(second).toMatchObject({ mutated: false, writtenPaths: [] });
    for (const [path, bytes] of preserved) {
      expect(readFileSync(join(created.root, path), "utf8")).toBe(bytes);
    }
  });

  test("refuses stale digest, catalog drift, and file preimage drift before writing", () => {
    const created = fixture();
    const planned = planScaffold(input(created.catalogPath));
    expect(() => applyScaffold(input(created.catalogPath), "0".repeat(64))).toThrow(ScaffoldError);
    try {
      applyScaffold(input(created.catalogPath), "0".repeat(64));
    } catch (error) {
      expect(diagnostics(error)).toContain("scaffold-plan-stale");
    }

    writeFileSync(
      created.catalogPath,
      `${JSON.stringify({ ...created.catalog, homepage: "https://example.test" }, null, 2)}\n`,
    );
    try {
      applyScaffold(input(created.catalogPath), planned.planDigest);
    } catch (error) {
      expect(diagnostics(error)).toContain("scaffold-plan-stale");
    }
    expect(readdirSync(created.root).sort()).toEqual(["manteen.registry.json"]);

    const current = planScaffold(input(created.catalogPath));
    const target = current.files[0]!;
    writePlannedFile(created.root, target.path, target.content);
    const exact = planScaffold(input(created.catalogPath));
    writePlannedFile(created.root, target.path, `${target.content}\n// authored drift\n`);
    try {
      applyScaffold(input(created.catalogPath), exact.planDigest);
    } catch (error) {
      expect(diagnostics(error)).toContain("scaffold-file-collision");
    }
  });

  test("names file, directory, symlink, parent-symlink, and path-escape refusals", () => {
    const differing = fixture();
    writePlannedFile(differing.root, "src/status-card/status-card.tsx", "authored\n");
    expect(
      planScaffold(input(differing.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-file-collision");

    const directory = fixture();
    mkdirSync(join(directory.root, "src/status-card/status-card.tsx"), { recursive: true });
    expect(
      planScaffold(input(directory.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-file-directory");

    const linkedFile = fixture();
    mkdirSync(join(linkedFile.root, "src/status-card"), { recursive: true });
    writeFileSync(join(linkedFile.root, "target.tsx"), "target\n");
    symlinkSync("../../target.tsx", join(linkedFile.root, "src/status-card/status-card.tsx"));
    expect(
      planScaffold(input(linkedFile.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-file-symlink");

    const linkedParent = fixture();
    mkdirSync(join(linkedParent.root, "outside"));
    mkdirSync(join(linkedParent.root, "src"));
    symlinkSync("../outside", join(linkedParent.root, "src/status-card"));
    expect(
      planScaffold(input(linkedParent.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-parent-symlink");

    const danglingFile = fixture();
    mkdirSync(join(danglingFile.root, "src/status-card"), { recursive: true });
    symlinkSync("missing.tsx", join(danglingFile.root, "src/status-card/status-card.tsx"));
    expect(
      planScaffold(input(danglingFile.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-file-symlink");

    const danglingParent = fixture();
    mkdirSync(join(danglingParent.root, "src"));
    symlinkSync("../missing", join(danglingParent.root, "src/status-card"));
    expect(
      planScaffold(input(danglingParent.catalogPath)).diagnostics.map((item) => item.code),
    ).toContain("scaffold-parent-symlink");

    const escaping = fixture();
    const escaped = planScaffold({
      catalogPath: escaping.catalogPath,
      template: "component-polymorphic",
      itemName: "/outside",
    });
    expect(escaped.safe).toBe(false);
    expect(escaped.diagnostics.map((item) => item.code)).toContain("scaffold-item-name-invalid");
  });

  test("rolls back every created source after a mid-commit failure", () => {
    const created = fixture({ profile: true, packageManifest: true });
    const before = snapshot(created.root);
    const planned = planScaffold(input(created.catalogPath, "component-styles-api"));

    expect(() =>
      applyScaffoldWithHooks(
        input(created.catalogPath, "component-styles-api"),
        planned.planDigest,
        {
          afterCommit: (_path, count) => {
            if (count === 2) throw new Error("injected multi-file failure");
          },
        },
      ),
    ).toThrow("injected multi-file failure");
    expect(snapshot(created.root)).toEqual(before);
  });

  test("revalidates unsafe parents immediately before every stage write and commit link", () => {
    for (const boundary of ["stage", "commit"] as const) {
      const created = fixture({ profile: true, packageManifest: true });
      const outside = outsideFixture();
      const preserved = preservedBytes(created.root);
      const planned = planScaffold(input(created.catalogPath));
      let substitution: ReturnType<typeof substituteParentWithLink> | undefined;
      let failure: unknown;

      try {
        applyScaffoldWithHooks(input(created.catalogPath), planned.planDigest, {
          ...(boundary === "stage"
            ? {
                beforeStageWrite: (_path, temporaryPath) => {
                  substitution = substituteParentWithLink(
                    created.root,
                    temporaryPath,
                    outside,
                    boundary,
                  );
                },
              }
            : {
                beforeCommitLink: (path) => {
                  substitution = substituteParentWithLink(created.root, path, outside, boundary);
                },
              }),
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(ScaffoldError);
      expect((failure as ScaffoldError).mutated).toBe(true);
      expect(diagnostics(failure)).toEqual(
        expect.arrayContaining(["scaffold-parent-symlink", "scaffold-cleanup-path-unsafe"]),
      );
      expect(substitution).toBeDefined();
      expect(readFileSync(substitution!.sentinel, "utf8")).toBe("outside unchanged\n");
      expect(readdirSync(substitution!.redirect)).toEqual(["sentinel.txt"]);
      expectPreservedBytes(created.root, preserved);
    }
  });

  test("revalidates occupied leaves immediately before stage and commit operations", () => {
    for (const boundary of ["stage", "commit"] as const) {
      const created = fixture({ profile: true, packageManifest: true });
      const outside = outsideFixture();
      const outsideFile = join(outside, `${boundary}-outside.txt`);
      writeFileSync(outsideFile, "outside unchanged\n");
      const preserved = preservedBytes(created.root);
      const planned = planScaffold(input(created.catalogPath));
      let failure: unknown;

      try {
        applyScaffoldWithHooks(input(created.catalogPath), planned.planDigest, {
          ...(boundary === "stage"
            ? {
                beforeStageWrite: (_path, temporaryPath) => {
                  symlinkSync(outsideFile, join(created.root, ...temporaryPath.split("/")));
                },
              }
            : {
                beforeCommitLink: (path) => {
                  symlinkSync(outsideFile, join(created.root, ...path.split("/")));
                },
              }),
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(ScaffoldError);
      expect(diagnostics(failure)).toContain(
        boundary === "stage"
          ? "scaffold-staging-file-preimage-stale"
          : "scaffold-file-preimage-stale",
      );
      expect((failure as ScaffoldError).mutated).toBe(true);
      expect(readFileSync(outsideFile, "utf8")).toBe("outside unchanged\n");
      expectPreservedBytes(created.root, preserved);
    }
  });

  test("refuses unsafe rollback, staging, success, and directory cleanup paths", () => {
    for (const boundary of ["rollback", "success-staging"] as const) {
      const created = fixture({ profile: true, packageManifest: true });
      const outside = outsideFixture();
      const preserved = preservedBytes(created.root);
      const planned = planScaffold(input(created.catalogPath));
      let substitution: ReturnType<typeof substituteParentWithLink> | undefined;
      let failure: unknown;

      try {
        applyScaffoldWithHooks(input(created.catalogPath), planned.planDigest, {
          afterCommit: () => {
            if (boundary === "rollback") throw new Error("injected rollback boundary");
          },
          beforeCleanup: (phase, path) => {
            if (phase === boundary && !substitution) {
              substitution = substituteParentWithLink(created.root, path, outside, boundary);
            }
          },
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(ScaffoldError);
      expect((failure as ScaffoldError).mutated).toBe(true);
      const phases = (failure as ScaffoldError).diagnostics
        .filter((diagnostic) => diagnostic.code === "scaffold-cleanup-path-unsafe")
        .map((diagnostic) => diagnostic.details?.phase);
      expect(phases).toEqual(
        expect.arrayContaining([boundary, "rollback", "failure-staging", "created-directory"]),
      );
      expect(readFileSync(substitution!.sentinel, "utf8")).toBe("outside unchanged\n");
      expect(readdirSync(substitution!.redirect)).toEqual(["sentinel.txt"]);
      expectPreservedBytes(created.root, preserved);
    }
  });

  test("reports mutation truth when a drifted committed file cannot be safely rolled back", () => {
    const created = fixture();
    const planned = planScaffold(input(created.catalogPath));
    let failure: unknown;

    try {
      applyScaffoldWithHooks(input(created.catalogPath), planned.planDigest, {
        afterCommit: (path) => {
          writePlannedFile(created.root, path, "externally drifted after commit\n");
          throw new Error("injected drift after commit");
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ScaffoldError);
    expect((failure as ScaffoldError).mutated).toBe(true);
    expect(diagnostics(failure)).toContain("scaffold-rollback-preimage-drift");
    expect(readFileSync(join(created.root, planned.files[0]!.path), "utf8")).toBe(
      "externally drifted after commit\n",
    );
  });

  test("retains the complete staging inventory when success-path cleanup fails", () => {
    const created = fixture({ profile: true, packageManifest: true });
    const before = snapshot(created.root);
    const planned = planScaffold(input(created.catalogPath, "component-styles-api"));
    let failure: unknown;

    try {
      applyScaffoldWithHooks(
        input(created.catalogPath, "component-styles-api"),
        planned.planDigest,
        {
          beforeTemporaryCleanup: (paths) => unlinkSync(paths[0]!),
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ScaffoldError);
    expect((failure as ScaffoldError).mutated).toBe(false);
    expect(snapshot(created.root)).toEqual(before);
  });

  test("the manually consumed catalog and profile insertions compile independently", () => {
    const created = fixture({ profile: true });
    const planned = planScaffold(input(created.catalogPath, "component-styles-api"));
    applyScaffold(input(created.catalogPath, "component-styles-api"), planned.planDigest);

    writeFileSync(
      created.catalogPath,
      `${JSON.stringify({ ...created.catalog, items: [planned.catalogInsertion] }, null, 2)}\n`,
    );
    writeFileSync(
      join(created.root, "manteen.author-profile.json"),
      `${JSON.stringify(
        { schemaVersion: 1, stylesApi: [planned.authorProfileInsertion!.mapping] },
        null,
        2,
      )}\n`,
    );
    const compiled = compileRegistry(created.catalogPath);

    expect(compiled.failures).toEqual([]);
    expect(compiled.items).toHaveLength(1);
    expect(compiled.items[0]).toMatchObject({
      name: "status-card",
      dependencies: ["@mantine/core@^9.5.0"],
      meta: { mantine: { requires: ">=9.5.0 <10" } },
    });
    expect(compiled.authorConformance).toMatchObject({ claimCount: 1, evidenceCount: 1 });
  });
});
