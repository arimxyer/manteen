import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Streams } from "../src/cli/render";
import { type RemoveCommandPorts, type RemoveFlags, runRemove } from "../src/commands/remove";
import type { RemovalApplyOutcome, RemovalPlan, RemovalPlanDiagnostic } from "../src/removal/types";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-remove-command-"));
  roots.push(root);
  writeFileSync(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: {
          "@house": { url: "file:///registry/{name}.json" },
        },
        aliases: {
          components: "@/components",
          ui: "@/components/ui",
          hooks: "@/hooks",
          lib: "@/lib",
        },
        tsconfig: "tsconfig.json",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/components/*": ["src/components/*"],
            "@/components/ui/*": ["src/components/ui/*"],
            "@/hooks/*": ["src/hooks/*"],
            "@/lib/*": ["src/lib/*"],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function io(): Streams & { stdoutText: string; stderrText: string } {
  const result = {
    stdoutText: "",
    stderrText: "",
    stdout(text: string) {
      result.stdoutText += text;
    },
    stderr(text: string) {
      result.stderrText += text;
    },
  };
  return result;
}

const DESTINATION = "src/components/ui/old.tsx";

function candidate(
  state: "unchanged" | "adapted" | "missing" = "unchanged",
  selected = false,
): RemovalPlan["candidates"][number] {
  return {
    itemId: "@house/widget",
    destination: DESTINATION,
    state,
    base: "present",
    selected,
    discardAdaptedRequired: state === "adapted",
  };
}

function plan(root: string, overrides: Partial<RemovalPlan> = {}): RemovalPlan {
  return {
    root,
    ok: true,
    dryRun: true,
    candidates: [candidate()],
    removals: [],
    receipt: {
      path: join(root, "manteen.lock.json"),
      sha256: "a".repeat(64),
      // Must never reach either renderer.
      projectedText: "PROJECTED-RECEIPT-SECRET",
      projectedChange: false,
    },
    diagnostics: [],
    notes: [],
    stateIgnored: false,
    ...overrides,
  };
}

function previewOutcome(root: string): RemovalApplyOutcome {
  return {
    ok: true,
    dryRun: true,
    removals: [],
    receipt: { path: join(root, "manteen.lock.json"), written: false },
    updateState: null,
    failure: null,
  };
}

function flags(root: string, overrides: Partial<RemoveFlags> = {}): RemoveFlags {
  return { cwd: root, upstreamRemoved: true, dryRun: true, ...overrides };
}

describe("remove command usage", () => {
  test("rejects semantic usage before config loading or planner I/O", async () => {
    let planned = false;
    const streams = io();
    const ports: RemoveCommandPorts = {
      async plan() {
        planned = true;
        throw new Error("unreachable");
      },
      apply() {
        throw new Error("unreachable");
      },
    };

    const exit = await runRemove(
      { cwd: "/does/not/exist", upstreamRemoved: false, dryRun: false },
      ports,
      streams,
    );

    expect(exit).toBe(2);
    expect(planned).toBe(false);
    expect(streams.stdoutText).toBe("");
    expect(streams.stderrText).toContain("remove requires the --upstream-removed mode");
    expect(streams.stderrText).toContain("requires at least one exact --file");
  });
});

describe("remove command reporting", () => {
  test("relative wire diagnostic paths remain exact", async () => {
    const root = project();
    const streams = io();
    const planned = plan(root, {
      ok: false,
      diagnostics: [
        {
          code: "file-no-content",
          severity: "error",
          message: "the current registry file has no content",
          items: ["@house/widget"],
          path: "registry/ui/old.tsx",
          forceable: false,
        },
      ],
    });

    const exit = await runRemove(
      flags(root),
      { plan: async () => planned, apply: () => previewOutcome(root) },
      streams,
    );

    expect(exit).toBe(1);
    expect(streams.stderrText).toContain("  registry/ui/old.tsx\n");
    expect(streams.stderrText).not.toContain("../../registry/ui/old.tsx");
  });

  test("a discovery preview carries exact options and writes no state", async () => {
    const root = project();
    const streams = io();
    let receivedOptions: unknown;
    const planned = plan(root);
    const ports: RemoveCommandPorts = {
      async plan(_config, options) {
        receivedOptions = options;
        return planned;
      },
      apply(received) {
        expect(received).toBe(planned);
        return previewOutcome(root);
      },
    };

    const exit = await runRemove(flags(root), ports, streams);

    expect(exit).toBe(0);
    expect(receivedOptions).toEqual({
      upstreamRemoved: true,
      dryRun: true,
      files: [],
      discardAdapted: false,
    });
    expect(streams.stdoutText).toContain(`candidate  unchanged  ${DESTINATION}`);
    expect(streams.stdoutText).toContain("selected: no");
    expect(streams.stdoutText).toContain("receipt  projected-change: no  manteen.lock.json");
    expect(streams.stdoutText).toContain("Dry run — nothing was written.");
    expect(streams.stdoutText).not.toContain("PROJECTED-RECEIPT-SECRET");
    expect(streams.stderrText).toBe("");
  });

  test("an adapted-file refusal remains structured and never calls apply", async () => {
    const root = project();
    const streams = io();
    const diagnostic: RemovalPlanDiagnostic = {
      code: "remove-adapted-file",
      severity: "error",
      message: "repeat with --discard-adapted",
      items: ["@house/widget"],
      path: DESTINATION,
      forceable: false,
    };
    const planned = plan(root, {
      ok: false,
      candidates: [candidate("adapted", true)],
      receipt: {
        ...plan(root).receipt,
        projectedChange: true,
      },
      diagnostics: [diagnostic],
    });
    let applied = false;
    const ports: RemoveCommandPorts = {
      async plan() {
        return planned;
      },
      apply() {
        applied = true;
        return previewOutcome(root);
      },
    };

    const exit = await runRemove(flags(root, { file: [DESTINATION], json: true }), ports, streams);
    const document = JSON.parse(streams.stdoutText);

    expect(exit).toBe(1);
    expect(applied).toBe(false);
    expect(streams.stderrText).toBe("");
    expect(document).toMatchObject({
      command: "remove",
      ok: false,
      mode: "upstream-removed",
      dryRun: true,
      receipt: { path: "manteen.lock.json", projectedChange: true, written: false },
      updateState: null,
      failure: null,
    });
    expect(document.candidates[0]).toMatchObject({ state: "adapted", selected: true });
    expect(document.diagnostics).toEqual([diagnostic]);
    expect(document.removals).toEqual([]);
    expect(streams.stdoutText).not.toContain("PROJECTED-RECEIPT-SECRET");
  });

  test("a successful real transaction reports committed facts and state versioning", async () => {
    const root = project();
    const streams = io();
    const planned = plan(root, {
      dryRun: false,
      candidates: [candidate("unchanged", true)],
      removals: [
        {
          itemId: "@house/widget",
          destination: DESTINATION,
          source: { path: join(root, DESTINATION), sha256: "b".repeat(64) },
          base: { path: join(root, ".manteen", "bases", `${DESTINATION}.base`), sha256: null },
        },
      ],
      receipt: { ...plan(root).receipt, projectedChange: true },
    });
    const ports: RemoveCommandPorts = {
      async plan() {
        return planned;
      },
      apply() {
        return {
          ok: true,
          dryRun: false,
          removals: [
            {
              itemId: "@house/widget",
              destination: DESTINATION,
              source: "removed",
              base: "already-missing",
            },
          ],
          receipt: { path: join(root, "manteen.lock.json"), written: true },
          updateState: { changed: true, versioningRequired: true },
          failure: null,
        };
      },
    };

    const exit = await runRemove(
      flags(root, { dryRun: false, file: [DESTINATION] }),
      ports,
      streams,
    );

    expect(exit).toBe(0);
    expect(streams.stdoutText).toContain(`removed  ${DESTINATION}`);
    expect(streams.stdoutText).toContain("source: removed");
    expect(streams.stdoutText).toContain("base: already-missing");
    expect(streams.stdoutText).toContain("written  manteen.lock.json");
    expect(streams.stderrText).toContain("info  state-versioning-required");
    expect(streams.stderrText).toContain("Version manteen.lock.json and .manteen/bases/ together");
  });

  test("JSON failure reports no committed removals and keeps notes last", async () => {
    const root = project();
    const streams = io();
    const planned = plan(root, {
      dryRun: false,
      candidates: [candidate("missing", true)],
      removals: [
        {
          itemId: "@house/widget",
          destination: DESTINATION,
          source: { path: join(root, DESTINATION), sha256: null },
          base: { path: join(root, ".manteen", "bases", `${DESTINATION}.base`), sha256: null },
        },
      ],
      receipt: { ...plan(root).receipt, projectedChange: true },
      notes: [{ code: "not-in-index", message: "display-only note" }],
    });
    const ports: RemoveCommandPorts = {
      async plan() {
        return planned;
      },
      apply() {
        return {
          ok: false,
          dryRun: false,
          removals: [],
          receipt: { path: join(root, "manteen.lock.json"), written: false },
          updateState: null,
          failure: {
            kind: "stale-plan",
            message: "source changed after planning",
            paths: [DESTINATION],
          },
        };
      },
    };

    const exit = await runRemove(
      flags(root, { dryRun: false, file: [DESTINATION], json: true }),
      ports,
      streams,
    );
    const document = JSON.parse(streams.stdoutText);

    expect(exit).toBe(1);
    expect(streams.stderrText).toBe("");
    expect(document.removals).toEqual([]);
    expect(document.receipt.written).toBe(false);
    expect(document.failure).toEqual({
      kind: "stale-plan",
      message: "source changed after planning",
      paths: [DESTINATION],
    });
    expect(document.updateState).toBeNull();
    expect(Object.keys(document).at(-1)).toBe("notes");
  });
});
