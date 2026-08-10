import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { applyInit } from "../src/init/apply";
import type {
  InitApplyPorts,
  InitInstallInput,
  InitPlan,
  InitPlannedDependency,
  InitWriteJournal,
} from "../src/init/types";
import { frameworkSetFor } from "../src/init/types";

const ROOT = "/project";
const FIRST = join(ROOT, "first.ts");
const SECOND = join(ROOT, "second.ts");

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function dependency(): InitPlannedDependency {
  return { name: "@mantine/core", range: "^9", dev: false, wantedBy: ["shared:provider"] };
}

function plan(input: { dependencies?: boolean; instruction?: boolean } = {}): InitPlan {
  return {
    version: 1,
    root: ROOT,
    framework: frameworkSetFor("manual"),
    files: [
      {
        kind: "theme",
        destination: FIRST,
        content: "new first\n",
        sha256: hash("new first\n"),
        existing: { sha256: hash("old first\n") },
        disposition: "update",
      },
      {
        kind: "postcss",
        destination: SECOND,
        content: "new second\n",
        sha256: hash("new second\n"),
        existing: null,
        disposition: "create",
      },
    ],
    dependencies: input.dependencies ? [dependency()] : [],
    packageManager: input.dependencies ? "npm" : null,
    installCommand: input.dependencies ? "npm install @mantine/core@^9" : null,
    instructions: input.instruction
      ? [
          {
            code: "manual-framework",
            required: true,
            message: "finish manually",
          },
        ]
      : [],
    diagnostics: [],
    ok: true,
  };
}

function fakePorts(
  input: { confirm?: boolean; installError?: Error; writeFailureAt?: string } = {},
) {
  const disk = new Map<string, string>([[FIRST, "old first\n"]]);
  const calls = { confirm: 0, install: 0, journal: 0 };
  const installs: InitInstallInput[] = [];
  const ports: InitApplyPorts = {
    hashFile(path) {
      const content = disk.get(path);
      return content === undefined ? null : hash(content);
    },
    async confirm() {
      calls.confirm += 1;
      return { confirmed: input.confirm !== false };
    },
    async install(installInput) {
      calls.install += 1;
      installs.push(installInput);
      if (input.installError) throw input.installError;
      return { installed: true, command: "npm install @mantine/core@^9" };
    },
    createJournal() {
      calls.journal += 1;
      const entries: { destination: string; before: string | null }[] = [];
      const journal: InitWriteJournal = {
        write(destination, content) {
          entries.push({ destination, before: disk.get(destination) ?? null });
          if (destination === input.writeFailureAt) throw new Error("fixture write failure");
          disk.set(destination, content);
        },
        destinations() {
          return entries.map((entry) => entry.destination);
        },
        unwind() {
          for (const entry of [...entries].reverse()) {
            if (entry.before === null) disk.delete(entry.destination);
            else disk.set(entry.destination, entry.before);
          }
          return { ok: true, unrestored: [], detail: null };
        },
      };
      return journal;
    },
  };
  return { disk, calls, installs, ports };
}

describe("W6 init apply sequencing", () => {
  test("dry-run proves pre-images and stops before prompt, install and journal", async () => {
    const fixture = fakePorts();
    const outcome = await applyInit(
      plan({ dependencies: true }),
      { interactive: true, dryRun: true },
      fixture.ports,
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.dryRun).toBe(true);
    expect(outcome.files.every((file) => !file.written)).toBe(true);
    expect(fixture.calls).toEqual({ confirm: 0, install: 0, journal: 0 });
    expect(fixture.disk).toEqual(new Map([[FIRST, "old first\n"]]));
  });

  test("declining the one confirmation is a zero-mutation cancellation", async () => {
    const fixture = fakePorts({ confirm: false });
    const outcome = await applyInit(
      plan({ dependencies: true }),
      { interactive: true },
      fixture.ports,
    );

    expect(outcome.cancelled).toBe(true);
    expect(fixture.calls).toEqual({ confirm: 1, install: 0, journal: 0 });
    expect(fixture.disk).toEqual(new Map([[FIRST, "old first\n"]]));
  });

  test("an install failure happens before the journal opens", async () => {
    const fixture = fakePorts({ installError: new Error("registry offline") });
    const outcome = await applyInit(
      plan({ dependencies: true }),
      { interactive: false },
      fixture.ports,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toMatchObject({ kind: "install-failed" });
    expect(outcome.failure?.message).toContain("registry offline");
    expect(fixture.calls).toEqual({ confirm: 0, install: 1, journal: 0 });
    expect(fixture.disk).toEqual(new Map([[FIRST, "old first\n"]]));
  });

  test("machine callers explicitly capture dependency-manager output", async () => {
    const fixture = fakePorts();
    const outcome = await applyInit(
      plan({ dependencies: true }),
      { interactive: false, dependencyOutput: "capture" },
      fixture.ports,
    );

    expect(outcome.ok).toBe(true);
    expect(fixture.installs).toHaveLength(1);
    expect(fixture.installs[0]?.dependencyOutput).toBe("capture");
  });

  test("a write failure unwinds every init file through the shared journal", async () => {
    const fixture = fakePorts({ writeFailureAt: SECOND });
    const outcome = await applyInit(plan(), { interactive: false }, fixture.ports);

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toMatchObject({ kind: "write-failed", paths: [FIRST, SECOND] });
    expect(fixture.disk).toEqual(new Map([[FIRST, "old first\n"]]));
  });

  test("success reports exact writes and keeps required manual work incomplete", async () => {
    const fixture = fakePorts();
    const outcome = await applyInit(
      plan({ dependencies: true, instruction: true }),
      { interactive: false },
      fixture.ports,
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.complete).toBe(false);
    expect(outcome.files.every((file) => file.written)).toBe(true);
    expect(outcome.dependencies).toEqual({
      installed: true,
      command: "npm install @mantine/core@^9",
    });
    expect(fixture.disk.get(FIRST)).toBe("new first\n");
    expect(fixture.disk.get(SECOND)).toBe("new second\n");
  });

  test("a stale pre-image refuses before every decision and mutation", async () => {
    const fixture = fakePorts();
    fixture.disk.set(FIRST, "changed elsewhere\n");
    const outcome = await applyInit(plan(), { interactive: true }, fixture.ports);

    expect(outcome.failure).toMatchObject({ kind: "stale-plan", paths: [FIRST] });
    expect(fixture.calls).toEqual({ confirm: 0, install: 0, journal: 0 });
  });
});
