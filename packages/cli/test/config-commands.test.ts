import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewedApplyActions } from "../src/cli/machine";
import type { Streams } from "../src/cli/render";
import { runRegistryAdd, runRegistryList, runRegistryRemove } from "../src/commands/registry";
import {
  runVerificationClear,
  runVerificationSet,
  runVerificationShow,
} from "../src/commands/verification";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-config-command-"));
  roots.push(root);
  writeFileSync(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@house": "https://house.test/{name}.json" },
        aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ scripts: { test: "bun test", typecheck: "tsc --noEmit", lint: "eslint ." } })}\n`,
  );
  return root;
}

function capture(): { streams: Streams; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    streams: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

describe("registry configuration commands", () => {
  test("dry-run redacts templates, applies the exact plan, and lists without expansion", async () => {
    const root = fixture();
    const before = readFileSync(join(root, "manteen.json"), "utf8");
    const planned = capture();
    const flags = {
      cwd: root,
      url: "https://registry.test/{name}.json",
      header: ["Authorization=Bearer ${WORKSHOP_TOKEN}"],
      param: ["token=${WORKSHOP_QUERY}"],
      dryRun: true,
      json: true,
    };

    expect(await runRegistryAdd("@workshop", flags, planned.streams)).toBe(0);
    expect(readFileSync(join(root, "manteen.json"), "utf8")).toBe(before);
    const preview = JSON.parse(planned.stdout.join(""));
    expect(preview.source).toEqual({
      url: "https://registry.test/{name}.json",
      headerKeys: ["Authorization"],
      paramKeys: ["token"],
    });
    expect(planned.stdout.join("")).not.toContain("WORKSHOP_TOKEN");
    expect(planned.stdout.join("")).not.toContain("WORKSHOP_QUERY");

    const applied = capture();
    expect(
      await runRegistryAdd(
        "@workshop",
        { ...flags, dryRun: false, expectPlan: preview.planDigest },
        applied.streams,
      ),
    ).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).registries).toHaveProperty(
      "@workshop",
    );

    const listed = capture();
    expect(await runRegistryList({ cwd: root, json: true }, listed.streams)).toBe(0);
    expect(listed.stdout.join("")).not.toContain("WORKSHOP_TOKEN");
    expect(listed.stdout.join("")).not.toContain("WORKSHOP_QUERY");
  });

  test("refuses replacing a differing source without explicit review and removing the last source", async () => {
    const root = fixture();
    const replace = capture();
    expect(
      await runRegistryAdd(
        "@house",
        { cwd: root, url: "https://new.test/{name}.json", dryRun: true },
        replace.streams,
      ),
    ).toBe(2);
    expect(replace.stderr.join("")).toContain("--replace");

    const remove = capture();
    expect(await runRegistryRemove("@house", { cwd: root, dryRun: true }, remove.streams)).toBe(2);
    expect(remove.stderr.join("")).toContain("last configured registry");
  });

  test("refuses an invalid authored config instead of mutating through an unchecked cast", async () => {
    const root = fixture();
    const path = join(root, "manteen.json");
    const before = '{"registries":[],"aliases":{}}\n';
    writeFileSync(path, before);
    const result = capture();

    expect(
      await runRegistryAdd(
        "@workshop",
        { cwd: root, url: "https://registry.test/{name}.json", dryRun: true },
        result.streams,
      ),
    ).toBe(2);
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(result.stderr.join("")).toContain("must be object");
  });

  test("a dry-run payload produces one exact reviewed rerun action", () => {
    const digest = "a".repeat(64);
    const actions = reviewedApplyActions(
      { dryRun: true, planDigest: digest },
      [
        "manteen",
        "registry",
        "add",
        "@workshop",
        "--dry-run",
        "--json",
        "--expect-plan",
        "b".repeat(64),
      ],
      "/project",
    );

    expect(actions).toEqual([
      {
        kind: "rerun",
        argv: [
          "manteen",
          "registry",
          "add",
          "@workshop",
          "--json",
          "--cwd",
          "/project",
          "--expect-plan",
          digest,
        ],
      },
    ]);
    expect(
      reviewedApplyActions(
        { dryRun: true, planDigest: digest, candidates: [{ selected: false }] },
        ["manteen", "remove", "--upstream-removed", "--dry-run", "--json"],
      ),
    ).toEqual([]);
  });
});

describe("verification configuration commands", () => {
  test("discovers scripts and sets, preserves, and clears explicit operation lists", async () => {
    const root = fixture();
    const shown = capture();
    expect(await runVerificationShow({ cwd: root, json: true }, shown.streams)).toBe(0);
    expect(JSON.parse(shown.stdout.join("")).availableScripts).toEqual([
      "lint",
      "test",
      "typecheck",
    ]);

    const planned = capture();
    expect(
      await runVerificationSet(
        { cwd: root, add: ["test", "typecheck"], timeoutMs: "5000", dryRun: true, json: true },
        planned.streams,
      ),
    ).toBe(0);
    const preview = JSON.parse(planned.stdout.join(""));
    const applied = capture();
    expect(
      await runVerificationSet(
        {
          cwd: root,
          add: ["test", "typecheck"],
          timeoutMs: "5000",
          expectPlan: preview.planDigest,
        },
        applied.streams,
      ),
    ).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).verification).toEqual({
      add: ["test", "typecheck"],
      timeoutMs: 5000,
    });

    const clearPlanOutput = capture();
    expect(
      await runVerificationClear(
        { cwd: root, operation: "add", dryRun: true, json: true },
        clearPlanOutput.streams,
      ),
    ).toBe(0);
    const clearPlan = JSON.parse(clearPlanOutput.stdout.join(""));
    expect(
      await runVerificationClear(
        { cwd: root, operation: "add", expectPlan: clearPlan.planDigest },
        capture().streams,
      ),
    ).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).verification,
    ).toBeUndefined();
  });

  test("refuses unknown scripts and a timeout-only verification block", async () => {
    const root = fixture();
    const unknown = capture();
    expect(
      await runVerificationSet({ cwd: root, add: ["missing"], dryRun: true }, unknown.streams),
    ).toBe(2);
    expect(unknown.stderr.join("")).toContain("does not define");

    const timeout = capture();
    expect(
      await runVerificationSet({ cwd: root, timeoutMs: "5000", dryRun: true }, timeout.streams),
    ).toBe(2);
    expect(timeout.stderr.join("")).toContain("at least one add, update, or remove");
  });
});
