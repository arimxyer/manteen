/** D42's dedicated, dependency-free upstream-file removal transaction. */
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { createJournal, type Journal } from "../apply/journal";
import { hashFileBytes } from "../apply/preflight";
import { assertInsideRoot } from "../config/aliases";
import type { Plan, Receipt } from "../plan/types";
import { basePathFor, fromReceiptPath, toReceiptPath } from "../receipt/path";
import { receiptPathFor } from "../receipt/read";
import {
  createVerificationPorts,
  verificationManagedPaths,
  verifyAppliedMutationSync,
} from "../verification/run";
import type { PlannedVerification, VerificationOutcome } from "../verification/types";
import { snapshotRemovalPath } from "./snapshot";
import type {
  RemovalApplyOutcome,
  RemovalFailure,
  RemovalPathSnapshot,
  RemovalPlan,
  RemovalPlannedPath,
} from "./types";

export interface RemovalApplyPorts {
  inspect(path: string, root: string): RemovalPathSnapshot;
  createJournal(): Journal;
  verify?(plan: RemovalPlan, verification: PlannedVerification): VerificationOutcome;
}

const DEFAULT_PORTS: RemovalApplyPorts = {
  inspect: snapshotRemovalPath,
  createJournal,
  verify: defaultRemovalVerification,
};

function verificationPlan(plan: RemovalPlan): Plan {
  return {
    root: plan.root,
    configPath: resolve(plan.root, "manteen.json"),
    receipt: { present: false, path: plan.receipt.path },
    verification: plan.verification ?? null,
  } as Plan;
}

function defaultRemovalVerification(
  plan: RemovalPlan,
  verification: PlannedVerification,
): VerificationOutcome {
  const ports = createVerificationPorts((chunk) => process.stderr.write(chunk), hashFileBytes);
  return verifyAppliedMutationSync(verificationPlan(plan), verification, ports);
}

export function createRemovalApplyPorts(): RemovalApplyPorts {
  return { ...DEFAULT_PORTS };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function expectedHash(path: RemovalPlannedPath): string | null {
  return path.sha256;
}

function actualHash(snapshot: RemovalPathSnapshot): string | null | "unsupported" {
  if (snapshot.kind === "missing") return null;
  if (snapshot.kind === "regular") return snapshot.sha256;
  return "unsupported";
}

function staleDetail(
  root: string,
  path: RemovalPlannedPath,
  snapshot: RemovalPathSnapshot,
): string | null {
  const label = toReceiptPath(path.path, root);
  if (snapshot.kind === "unsupported") {
    return `${label} is no longer a readable regular file or an absent path: ${snapshot.reason}`;
  }

  const expected = expectedHash(path);
  const actual = actualHash(snapshot);
  if (actual === expected) return null;
  if (expected === null) return `${label} was created after the removal plan was computed`;
  if (actual === null) return `${label} was removed after the removal plan was computed`;
  return `${label} was modified after the removal plan was computed`;
}

function assertPlan(plan: RemovalPlan): void {
  const expectedReceipt = receiptPathFor(plan.root);
  if (plan.receipt.path !== expectedReceipt) {
    throw new Error(
      `removal apply: receipt path ${plan.receipt.path} is not the project receipt ${expectedReceipt}`,
    );
  }
  assertInsideRoot(plan.receipt.path, plan.root);

  if (plan.removals.length > 0) {
    if (plan.receipt.sha256 === null) {
      throw new Error("removal apply: a selected transaction requires an existing receipt");
    }
    const projectedHash = createHash("sha256")
      .update(plan.receipt.projectedText, "utf8")
      .digest("hex");
    if (!plan.receipt.projectedChange || projectedHash === plan.receipt.sha256) {
      throw new Error("removal apply: projected receipt bytes do not remove any selected record");
    }
  } else if (plan.receipt.projectedChange) {
    throw new Error("removal apply: an empty selection cannot project a receipt change");
  }

  const destinations = new Set<string>();
  const paths = new Set<string>([plan.receipt.path]);
  for (const removal of plan.removals) {
    if (destinations.has(removal.destination)) {
      throw new Error(`removal apply: duplicate selected destination ${removal.destination}`);
    }
    destinations.add(removal.destination);

    const expectedSource = fromReceiptPath(removal.destination, plan.root);
    if (removal.source.path !== expectedSource) {
      throw new Error(
        `removal apply: ${removal.destination} maps to ${expectedSource}, not ${removal.source.path}`,
      );
    }
    const expectedBase = basePathFor(removal.source.path, plan.root);
    if (removal.base.path !== expectedBase) {
      throw new Error(
        `removal apply: ${removal.destination} base is ${expectedBase}, not ${removal.base.path}`,
      );
    }

    for (const path of [removal.source.path, removal.base.path]) {
      assertInsideRoot(path, plan.root);
      if (paths.has(path)) throw new Error(`removal apply: path is claimed twice: ${path}`);
      paths.add(path);
    }
  }
}

/**
 * Recheck every planned present/absent fact immediately before mutation.
 * Unsupported filesystem objects here are stale-plan failures: discovery had
 * already proved a readable regular file or absence, and that proof changed.
 */
export function preflightRemoval(
  plan: RemovalPlan,
  ports: RemovalApplyPorts = DEFAULT_PORTS,
): RemovalFailure | null {
  assertPlan(plan);

  const stale: string[] = [];
  for (const removal of plan.removals) {
    for (const path of [removal.source, removal.base]) {
      const detail = staleDetail(plan.root, path, ports.inspect(path.path, plan.root));
      if (detail !== null) stale.push(detail);
    }
  }
  const receiptDetail = staleDetail(
    plan.root,
    { path: plan.receipt.path, sha256: plan.receipt.sha256 },
    ports.inspect(plan.receipt.path, plan.root),
  );
  if (receiptDetail !== null) stale.push(receiptDetail);

  if (stale.length === 0) return null;
  return {
    kind: "stale-plan",
    message: `The project changed after the removal plan was computed:\n${stale
      .map((line) => `  ${line}`)
      .join("\n")}\nNothing was removed. Re-run the command to plan against the current state.`,
  };
}

function emptyOutcome(
  plan: RemovalPlan,
  dryRun: boolean,
  failure: RemovalFailure | null = null,
): RemovalApplyOutcome {
  return {
    ok: false,
    dryRun,
    removals: [],
    receipt: { path: plan.receipt.path, written: false },
    updateState: null,
    failure,
  };
}

/**
 * Remove selected sources, then their pristine bases, then write the projected
 * receipt last, all through one exact-byte pre-image journal.
 */
export function applyRemoval(
  plan: RemovalPlan,
  ports: RemovalApplyPorts = DEFAULT_PORTS,
): RemovalApplyOutcome {
  const dryRun = plan.dryRun;
  if (!plan.ok) return emptyOutcome(plan, dryRun);
  if (plan.removals.length === 0) {
    if (!dryRun) throw new Error("removal apply: a real transaction must select at least one file");
    assertPlan(plan);
    return { ...emptyOutcome(plan, true), ok: true };
  }
  const stale = preflightRemoval(plan, ports);
  if (stale !== null) return emptyOutcome(plan, dryRun, stale);
  if (dryRun) return { ...emptyOutcome(plan, true), ok: true };

  const journal = ports.createJournal();
  try {
    for (const removal of plan.removals) {
      if (removal.source.sha256 !== null) journal.remove(removal.source.path);
    }
    for (const removal of plan.removals) {
      if (removal.base.sha256 !== null) journal.remove(removal.base.path);
    }
    journal.write(plan.receipt.path, plan.receipt.projectedText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const unwound = journal.unwind();
    if (!unwound.ok) {
      return emptyOutcome(plan, false, {
        kind: "rollback-failed",
        message:
          `${detail}\nThe rollback then failed, so the tree may be inconsistent: ` +
          `${unwound.detail ?? "no detail"}`,
        paths: [...unwound.unrestored].map((path) => toReceiptPath(path, plan.root)).sort(compare),
      });
    }
    return emptyOutcome(plan, false, {
      kind: "write-failed",
      message: `${detail}\nEvery path removed or written by this run was restored to its previous contents.`,
    });
  }

  const success = (verification?: VerificationOutcome): RemovalApplyOutcome => ({
    ok: true,
    dryRun: false,
    removals: plan.removals.map((removal) => ({
      itemId: removal.itemId,
      destination: removal.destination,
      source: removal.source.sha256 === null ? "already-missing" : "removed",
      base: removal.base.sha256 === null ? "already-missing" : "removed",
    })),
    receipt: { path: plan.receipt.path, written: true },
    updateState: { changed: true, versioningRequired: true },
    failure: null,
    ...(verification === undefined ? {} : { verification }),
  });

  if (plan.verification !== null && plan.verification !== undefined) {
    const verify = ports.verify ?? defaultRemovalVerification;
    let verification: VerificationOutcome;
    try {
      const projected = JSON.parse(plan.receipt.projectedText) as Receipt;
      for (const path of verificationManagedPaths(verificationPlan(plan), projected)) {
        journal.capture?.(path);
      }
      verification = verify(plan, plan.verification);
    } catch (error) {
      const unwound = journal.unwind();
      const detail = error instanceof Error ? error.message : String(error);
      return emptyOutcome(plan, false, {
        kind: unwound.ok ? "verification-failed" : "rollback-failed",
        message: unwound.ok
          ? `${detail}\nEvery Manteen-managed pre-image captured for this removal was restored.`
          : `${detail}\nThe rollback then failed: ${unwound.detail ?? "no detail"}`,
        ...(unwound.ok
          ? {}
          : {
              paths: [...unwound.unrestored]
                .map((path) => toReceiptPath(path, plan.root))
                .sort(compare),
            }),
      });
    }
    if (verification.status !== "failed") return success(verification);
    const unwound = journal.unwind();
    if (!unwound.ok) {
      return {
        ...emptyOutcome(plan, false, {
          kind: "rollback-failed",
          message:
            `${verification.failure?.message ?? "Project verification failed."}\n` +
            `The rollback then failed: ${unwound.detail ?? "no detail"}`,
          paths: [...unwound.unrestored]
            .map((path) => toReceiptPath(path, plan.root))
            .sort(compare),
        }),
        verification,
      };
    }
    return {
      ...emptyOutcome(plan, false, {
        kind: "verification-failed",
        message:
          `${verification.failure?.message ?? "Project verification failed."}\n` +
          "Every Manteen-managed pre-image captured for this removal was restored.",
      }),
      verification,
    };
  }

  return success();
}
