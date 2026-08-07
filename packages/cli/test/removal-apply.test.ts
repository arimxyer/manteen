import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createJournal, type Journal } from "../src/apply/journal";
import { basePathFor } from "../src/receipt/path";
import { receiptPathFor } from "../src/receipt/read";
import {
  applyRemoval,
  createRemovalApplyPorts,
  preflightRemoval,
  type RemovalApplyPorts,
} from "../src/removal/apply";
import type { RemovalPlan } from "../src/removal/types";

const roots: string[] = [];
const DESTINATION = "src/components/ui/old.tsx";
const SOURCE_TEXT = "export const old = true;\n";
const BASE_TEXT = "export const old = true;\n";
const RECEIPT_TEXT = '{"lockfileVersion":3,"items":[{"id":"@proof/old","files":[{}]}]}\n';
const PROJECTED_TEXT = '{"lockfileVersion":3,"items":[{"id":"@proof/old","files":[]}]}\n';

function sha(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

interface Fixture {
  plan: RemovalPlan;
  source: string;
  base: string;
  receipt: string;
}

function fixture(options: { source?: boolean; base?: boolean; selected?: boolean } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "manteen-removal-apply-"));
  roots.push(root);
  const source = join(root, ...DESTINATION.split("/"));
  const base = basePathFor(source, root);
  const receipt = receiptPathFor(root);
  const sourcePresent = options.source !== false;
  const basePresent = options.base !== false;
  const selected = options.selected !== false;

  if (sourcePresent) write(source, SOURCE_TEXT);
  if (basePresent) write(base, BASE_TEXT);
  write(receipt, RECEIPT_TEXT);

  return {
    source,
    base,
    receipt,
    plan: {
      root,
      ok: true,
      dryRun: false,
      candidates: [],
      removals: selected
        ? [
            {
              itemId: "@proof/old",
              destination: DESTINATION,
              source: { path: source, sha256: sourcePresent ? sha(SOURCE_TEXT) : null },
              base: { path: base, sha256: basePresent ? sha(BASE_TEXT) : null },
            },
          ]
        : [],
      receipt: {
        path: receipt,
        sha256: sha(RECEIPT_TEXT),
        projectedText: selected ? PROJECTED_TEXT : RECEIPT_TEXT,
        projectedChange: selected,
      },
      diagnostics: [],
      notes: [],
      stateIgnored: true,
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function bytes(path: string): Buffer | null {
  return existsSync(path) ? readFileSync(path) : null;
}

function failingJournal(path: string): Journal {
  const journal = createJournal();
  return {
    write(destination, content) {
      journal.write(destination, content);
      if (destination === path) throw new Error(`injected failure after ${destination}`);
    },
    remove(destination) {
      journal.remove(destination);
      if (destination === path) throw new Error(`injected failure after ${destination}`);
    },
    entries: () => journal.entries(),
    unwind: () => journal.unwind(),
  };
}

function portsWithJournal(factory: () => Journal): RemovalApplyPorts {
  return { ...createRemovalApplyPorts(), createJournal: factory };
}

describe("upstream-removal apply", () => {
  test("removes source then base and writes the projected receipt last", () => {
    const state = fixture();
    const order: string[] = [];
    const ports = portsWithJournal(() => {
      const journal = createJournal();
      return {
        write(destination, content) {
          order.push(destination);
          journal.write(destination, content);
        },
        remove(destination) {
          order.push(destination);
          journal.remove(destination);
        },
        entries: () => journal.entries(),
        unwind: () => journal.unwind(),
      };
    });

    const outcome = applyRemoval(state.plan, ports);

    expect(outcome).toEqual({
      ok: true,
      dryRun: false,
      removals: [
        {
          itemId: "@proof/old",
          destination: DESTINATION,
          source: "removed",
          base: "removed",
        },
      ],
      receipt: { path: state.receipt, written: true },
      updateState: { changed: true, versioningRequired: true },
      failure: null,
    });
    expect(order).toEqual([state.source, state.base, state.receipt]);
    expect(existsSync(state.source)).toBe(false);
    expect(existsSync(state.base)).toBe(false);
    expect(readFileSync(state.receipt, "utf8")).toBe(PROJECTED_TEXT);
  });

  test("a selected dry run preflights and writes nothing", () => {
    const state = fixture();
    state.plan.dryRun = true;
    let journalOpened = false;
    const before = [bytes(state.source), bytes(state.base), bytes(state.receipt)];

    const outcome = applyRemoval(
      state.plan,
      portsWithJournal(() => {
        journalOpened = true;
        return createJournal();
      }),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.dryRun).toBe(true);
    expect(outcome.removals).toEqual([]);
    expect(outcome.receipt.written).toBe(false);
    expect(outcome.updateState).toBeNull();
    expect(journalOpened).toBe(false);
    expect([bytes(state.source), bytes(state.base), bytes(state.receipt)]).toEqual(before);
  });

  test("unselected discovery is a successful preview without preflight or journal", () => {
    const state = fixture({ selected: false });
    state.plan.dryRun = true;
    let inspected = false;
    let journalOpened = false;

    const outcome = applyRemoval(state.plan, {
      inspect() {
        inspected = true;
        return { kind: "unsupported", reason: "must not inspect" };
      },
      createJournal() {
        journalOpened = true;
        return createJournal();
      },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.dryRun).toBe(true);
    expect(inspected).toBe(false);
    expect(journalOpened).toBe(false);
  });

  test("a locally absent source/base cleans up only the receipt", () => {
    const state = fixture({ source: false, base: false });
    const outcome = applyRemoval(state.plan);

    expect(outcome.ok).toBe(true);
    expect(outcome.removals[0]).toMatchObject({
      source: "already-missing",
      base: "already-missing",
    });
    expect(readFileSync(state.receipt, "utf8")).toBe(PROJECTED_TEXT);
  });

  test("a readable corrupt base is removed using its planned raw-byte hash", () => {
    const state = fixture();
    write(state.base, "manually changed obsolete state\n");
    state.plan.removals[0]!.base.sha256 = sha("manually changed obsolete state\n");

    const outcome = applyRemoval(state.plan);

    expect(outcome.ok).toBe(true);
    expect(outcome.removals[0]?.base).toBe("removed");
    expect(existsSync(state.base)).toBe(false);
  });

  test("a refused plan never preflights or opens a journal", () => {
    const state = fixture();
    state.plan.ok = false;
    let inspected = false;
    let journalOpened = false;

    const outcome = applyRemoval(state.plan, {
      inspect() {
        inspected = true;
        return { kind: "unsupported", reason: "must not inspect" };
      },
      createJournal() {
        journalOpened = true;
        return createJournal();
      },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBeNull();
    expect(inspected).toBe(false);
    expect(journalOpened).toBe(false);
  });

  test("preflight detects both sides of the present/absent boundary", () => {
    const created = fixture({ source: false });
    write(created.source, "created after planning\n");
    const createdFailure = preflightRemoval(created.plan);
    expect(createdFailure?.kind).toBe("stale-plan");
    expect(createdFailure?.message).toContain(`${DESTINATION} was created`);

    const removed = fixture();
    rmSync(removed.base);
    const removedFailure = preflightRemoval(removed.plan);
    expect(removedFailure?.kind).toBe("stale-plan");
    expect(removedFailure?.message).toContain(`.manteen/bases/${DESTINATION}.base was removed`);
  });

  for (const target of ["source", "base", "receipt"] as const) {
    test(`refuses ${target} drift before opening the journal`, () => {
      const state = fixture();
      write(state[target], `changed ${target}\n`);
      let journalOpened = false;
      const outcome = applyRemoval(
        state.plan,
        portsWithJournal(() => {
          journalOpened = true;
          return createJournal();
        }),
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.failure?.kind).toBe("stale-plan");
      expect(outcome.failure?.message).toContain(
        `${target === "receipt" ? "manteen.lock.json" : target === "source" ? DESTINATION : `.manteen/bases/${DESTINATION}.base`} was modified`,
      );
      expect(journalOpened).toBe(false);
    });
  }

  test("a path that became a symlink refuses before the journal opens", () => {
    const state = fixture();
    rmSync(state.source);
    symlinkSync(state.base, state.source);
    let journalOpened = false;

    const outcome = applyRemoval(
      state.plan,
      portsWithJournal(() => {
        journalOpened = true;
        return createJournal();
      }),
    );

    expect(outcome.failure?.kind).toBe("stale-plan");
    expect(outcome.failure?.message).toContain("symbolic link");
    expect(journalOpened).toBe(false);
    expect(existsSync(state.base)).toBe(true);
  });

  test("a symlinked or junction parent cannot route deletion outside the project", () => {
    const state = fixture();
    const outside = mkdtempSync(join(tmpdir(), "manteen-removal-outside-"));
    roots.push(outside);
    const outsideSource = join(outside, "components", "ui", "old.tsx");
    write(outsideSource, SOURCE_TEXT);
    rmSync(join(state.plan.root, "src"), { recursive: true });
    symlinkSync(
      outside,
      join(state.plan.root, "src"),
      process.platform === "win32" ? "junction" : "dir",
    );
    let journalOpened = false;

    const outcome = applyRemoval(
      state.plan,
      portsWithJournal(() => {
        journalOpened = true;
        return createJournal();
      }),
    );

    expect(outcome.failure?.kind).toBe("stale-plan");
    expect(outcome.failure?.message).toContain("symbolic link or junction");
    expect(journalOpened).toBe(false);
    expect(readFileSync(outsideSource, "utf8")).toBe(SOURCE_TEXT);
  });

  for (const target of ["source", "base", "receipt"] as const) {
    test(`a failure after the ${target} mutation restores exact pre-images`, () => {
      const state = fixture();
      const before = [bytes(state.source), bytes(state.base), bytes(state.receipt)];
      const outcome = applyRemoval(
        state.plan,
        portsWithJournal(() => failingJournal(state[target])),
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.failure?.kind).toBe("write-failed");
      expect(outcome.removals).toEqual([]);
      expect(outcome.receipt.written).toBe(false);
      expect(outcome.updateState).toBeNull();
      expect([bytes(state.source), bytes(state.base), bytes(state.receipt)]).toEqual(before);
    });
  }

  test("rollback failure reports sorted POSIX project paths and no committed removals", () => {
    const state = fixture();
    const inner = failingJournal(state.receipt);
    const ports = portsWithJournal(() => ({
      write: inner.write,
      remove: inner.remove,
      entries: inner.entries,
      unwind: () => ({
        ok: false,
        unrestored: [state.receipt, state.source],
        detail: "injected unwind failure",
      }),
    }));

    const outcome = applyRemoval(state.plan, ports);

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toMatchObject({
      kind: "rollback-failed",
      paths: ["manteen.lock.json", DESTINATION],
    });
    expect(outcome.removals).toEqual([]);
    expect(outcome.receipt.written).toBe(false);
    expect(outcome.updateState).toBeNull();
  });

  test("preflight rejects an internally inconsistent source/base mapping", () => {
    const state = fixture();
    state.plan.removals[0]!.base.path = join(state.plan.root, ".manteen", "wrong.base");
    expect(() => preflightRemoval(state.plan)).toThrow("base is");
  });
});
