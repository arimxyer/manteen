/**
 * Phase 0 — read-only. The last check before anything can be written.
 *
 * Two different kinds of problem land here and they get two different exits,
 * which is the whole reason this module is not one loop:
 *
 * - **A broken plan throws.** Duplicate destinations and paths outside the root
 *   are assertions about `plan()`'s own output — D19 calls preflight "defence in
 *   depth", and `stale-plan`'s remedy ("re-run") is a lie for them, because
 *   re-running reproduces the same plan.
 * - **A changed project returns `stale-plan`.** The user (or a concurrent run, or
 *   a `git checkout`) touched a file between `plan()` and `apply()`. Re-running
 *   really is the fix, and applying anyway would destroy their edit.
 *
 * Hash domain, because getting it wrong passes every fixture and fails a real
 * user: everything here hashes **raw file bytes** — `readFileSync(path)` with no
 * encoding. `PlannedFile.existing.sha256` and `ReceiptState.sha256` are built the
 * same way (types.ts). `PlannedFile.sha256` is the odd one out: it hashes the
 * UTF-8 encoding of the string we are about to write. Decode-then-rehash agrees
 * with byte-hashing on every valid-UTF-8 fixture and diverges only on a file that
 * is not valid UTF-8 — so it would ship green.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { assertInsideRoot } from "../config/aliases";
import type { ApplyFailure, Plan } from "../plan/types";

/** sha256 of the raw bytes at `path`, or `null` when the file does not exist. */
export function hashFileBytes(path: string): string | null {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // EACCES / EISDIR are not absence. Returning `null` for them would let the
    // comparison below read "the file is gone" and the write phase then replace
    // something we were never able to inspect.
    throw error;
  }
  return createHash("sha256").update(bytes).digest("hex");
}

function drifted(path: string, planned: string | null, actual: string | null): string | null {
  if (planned === actual) return null;
  if (planned === null) return `${path} — created since the plan was computed`;
  if (actual === null) return `${path} — removed since the plan was computed`;
  return `${path} — modified since the plan was computed`;
}

export function preflight(plan: Plan): ApplyFailure | null {
  const seen = new Set<string>();
  for (const file of plan.files) {
    if (seen.has(file.destination)) {
      throw new Error(
        `apply preflight: plan.files claims ${file.destination} twice. The write list must be ` +
          `unique per destination — gates/collision.ts refuses two distinct items at one path (D8), ` +
          `so reaching apply with a duplicate means the plan was built wrong, not that the project changed.`,
      );
    }
    seen.add(file.destination);
    // Re-proved here rather than trusted from resolve(): `target-escapes-root` is
    // the one refusal §1's table lists in BOTH plan and apply preflight.
    assertInsideRoot(file.destination, plan.root);
    assertInsideRoot(file.base.destination, plan.root);
  }
  if (plan.theme !== null) assertInsideRoot(plan.theme.destination, plan.root);
  if (plan.styles !== null) assertInsideRoot(plan.styles.destination, plan.root);
  if (plan.verification !== null) {
    assertInsideRoot(plan.verification.packageJson.path, plan.root);
  }
  for (const base of plan.removedBases) assertInsideRoot(base.destination, plan.root);
  assertInsideRoot(plan.receipt.path, plan.root);

  const stale: string[] = [];
  const reasons: string[] = [];

  const note = (path: string, planned: string | null): void => {
    const reason = drifted(path, planned, hashFileBytes(path));
    if (reason === null) return;
    stale.push(path);
    reasons.push(reason);
  };

  for (const file of plan.files) {
    note(file.destination, file.existing?.sha256 ?? null);
    note(file.base.destination, file.base.existing?.sha256 ?? null);
  }
  for (const base of plan.removedBases) note(base.destination, base.existing?.sha256 ?? null);
  if (plan.theme !== null) note(plan.theme.destination, plan.theme.base?.sha256 ?? null);
  if (plan.styles !== null) note(plan.styles.destination, plan.styles.base?.sha256 ?? null);
  if (plan.verification !== null) {
    note(plan.verification.packageJson.path, plan.verification.packageJson.sha256);
  }

  // The receipt's check is asymmetric and BOTH arms are required. `present:false`
  // asserts the file is still absent — if a concurrent run (or a pull, or a
  // colleague's branch) created one in between, merging from `null` would destroy
  // every ownership record it holds. `present:true` re-hashes, including on the
  // `ok:false` arm, because `--force` is about to overwrite a file the user may
  // have just repaired by hand.
  note(plan.receipt.path, plan.receipt.present ? plan.receipt.sha256 : null);

  if (stale.length === 0) return null;

  return {
    kind: "stale-plan",
    message:
      `The project changed after the plan was computed:\n${reasons.map((line) => `  ${line}`).join("\n")}\n` +
      `Nothing was written. Re-run the command to plan against the current state.`,
    paths: stale,
  };
}
