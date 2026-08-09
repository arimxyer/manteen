import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import {
  compileRegistry,
  planRegistryWrite,
  RegistryOutputError,
  recoverRegistryWrite,
  writeRegistry,
} from "../src/build-registry";

const CATALOG = resolve(import.meta.dirname, "../fixtures/base/manteen.registry.json");
const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-kit-output-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("registry output ownership", () => {
  test("writes a deterministic marker and a second write is clean", () => {
    const outDir = join(temporaryRoot(), "r");
    const result = compileRegistry(CATALOG);

    const first = writeRegistry(result, outDir);
    const firstMarker = readFileSync(join(outDir, ".manteen-kit-output.json"), "utf8");
    const second = writeRegistry(result, outDir);

    expect(first.status).toBe("missing");
    expect(first.mutated).toBe(true);
    expect(second.status).toBe("clean");
    expect(second.mutated).toBe(false);
    expect(readFileSync(join(outDir, ".manteen-kit-output.json"), "utf8")).toBe(firstMarker);
    const marker = JSON.parse(firstMarker);
    expect(marker).not.toHaveProperty("timestamp");
    expect(firstMarker).not.toContain(outDir);
    expect(marker.files.map((file: { path: string }) => file.path)).toEqual(
      [...marker.files.map((file: { path: string }) => file.path)].sort(),
    );
  });

  test("the planner is read-only and reports missing output", () => {
    const outDir = join(temporaryRoot(), "nested", "r");
    const plan = planRegistryWrite(compileRegistry(CATALOG), outDir);

    expect(plan.status).toBe("missing");
    expect(plan.changedFiles).toContain("registry.json");
    expect(existsSync(dirname(outDir))).toBe(false);
  });

  test("adopts only an exact valid unmarked registry", () => {
    const root = temporaryRoot();
    const outDir = join(root, "r");
    const result = compileRegistry(CATALOG);
    writeRegistry(result, outDir);
    rmSync(join(outDir, ".manteen-kit-output.json"));

    expect(planRegistryWrite(result, outDir).status).toBe("changed");
    expect(writeRegistry(result, outDir).mutated).toBe(true);

    rmSync(join(outDir, ".manteen-kit-output.json"));
    writeFileSync(join(outDir, "notes.txt"), "mine\n");
    const refused = planRegistryWrite(result, outDir);
    expect(refused.status).toBe("refused");
    expect(refused.diagnostics[0]?.code).toBe("unowned-output");
    expect(() => writeRegistry(result, outDir, { overwriteOutput: true })).toThrow(
      RegistryOutputError,
    );
    expect(readFileSync(join(outDir, "notes.txt"), "utf8")).toBe("mine\n");
  });

  test("refuses owned drift unless the explicit override replaces only owned files", () => {
    const outDir = join(temporaryRoot(), "r");
    const result = compileRegistry(CATALOG);
    writeRegistry(result, outDir);
    writeFileSync(join(outDir, "empty-state.json"), "locally changed\n");

    const refused = planRegistryWrite(result, outDir);
    expect(refused.status).toBe("refused");
    expect(refused.diagnostics[0]?.code).toBe("owned-output-drift");
    expect(() => writeRegistry(result, outDir)).toThrow(RegistryOutputError);

    const overwritten = writeRegistry(result, outDir, { overwriteOutput: true });
    expect(overwritten.mutated).toBe(true);
    expect(readFileSync(join(outDir, "empty-state.json"), "utf8")).toContain(
      '"name": "empty-state"',
    );
  });

  test("never lets overwrite-output clear unknown entries", () => {
    const outDir = join(temporaryRoot(), "r");
    const result = compileRegistry(CATALOG);
    writeRegistry(result, outDir);
    writeFileSync(join(outDir, "notes.txt"), "mine\n");

    const plan = planRegistryWrite(result, outDir, { overwriteOutput: true });
    expect(plan.status).toBe("refused");
    expect(plan.diagnostics[0]?.code).toBe("unknown-output-entry");
    expect(existsSync(join(outDir, "notes.txt"))).toBe(true);
  });
});

describe("path and recovery safety", () => {
  test("refuses the catalog directory and its ancestors", () => {
    const result = compileRegistry(CATALOG);
    const catalogDirectory = dirname(CATALOG);

    expect(planRegistryWrite(result, catalogDirectory).status).toBe("refused");
    expect(planRegistryWrite(result, dirname(catalogDirectory)).status).toBe("refused");
  });

  test("refuses an output path reached through a symlink", () => {
    const root = temporaryRoot();
    const real = join(root, "real");
    const linked = join(root, "linked");
    mkdirSync(real);
    symlinkSync(real, linked, "dir");

    const plan = planRegistryWrite(compileRegistry(CATALOG), join(linked, "r"));
    expect(plan.status).toBe("refused");
    expect(plan.diagnostics[0]?.code).toBe("output-path-link");
  });

  test("completes a known backed-up transaction and removes only its backup", () => {
    const root = temporaryRoot();
    const target = join(root, "r");
    writeRegistry(compileRegistry(CATALOG), target);
    const stage = join(root, ".r.manteen-kit-stage");
    const backup = join(root, ".r.manteen-kit-backup");
    const journal = join(root, ".r.manteen-kit-journal.json");
    cpSync(target, backup, { recursive: true });
    renameSync(target, stage);
    const marker = readFileSync(join(stage, ".manteen-kit-output.json"));
    writeFileSync(
      journal,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          targetName: basename(target),
          stageName: basename(stage),
          backupName: basename(backup),
          hadTarget: true,
          markerSha256: createHash("sha256").update(marker).digest("hex"),
          phase: "backed-up",
        },
        null,
        2,
      )}\n`,
    );

    expect(recoverRegistryWrite(target)).toBe("recovered");
    expect(existsSync(target)).toBe(true);
    expect(existsSync(stage)).toBe(false);
    expect(existsSync(backup)).toBe(false);
    expect(existsSync(journal)).toBe(false);
  });

  test("preserves invalid recovery evidence and refuses", () => {
    const root = temporaryRoot();
    const target = join(root, "r");
    const journal = join(root, ".r.manteen-kit-journal.json");
    writeFileSync(journal, "{}\n");

    expect(() => recoverRegistryWrite(target)).toThrow(RegistryOutputError);
    expect(readFileSync(journal, "utf8")).toBe("{}\n");
  });
});
