/**
 * Phase 3 — the component write pass.
 *
 * Deliberately thin: every decision was already made in phase 1 and every byte
 * of write mechanics lives in the journal. What this module owns is the mapping
 * from a `WriteResult` to an action, and that mapping is the one place the three
 * results stop being interchangeable:
 *
 * - `written`   — the only result that touches disk.
 * - `identical` — the on-disk content already equals `PlannedFile.content`, so
 *                 writing it would move zero bytes and churn an mtime. It still
 *                 transfers receipt ownership (types.ts, `WriteResult`); an
 *                 all-identical run is precisely the run that most needs to.
 * - `skipped`   — the user declined. Not written, and not owned.
 *
 * Ordering is the plan's write-list order (item order, flattened), so a failure
 * mid-phase leaves a prefix written and the journal unwinds it LIFO.
 */
import type { PlannedFile, WriteResult } from "../plan/types";
import type { Journal } from "./journal";

export function writeFiles(
  files: readonly PlannedFile[],
  results: ReadonlyMap<string, WriteResult>,
  journal: Journal,
): void {
  for (const file of files) {
    const result = results.get(file.destination);
    if (result === undefined) {
      // Phase 1 records a decision for every planned destination. A gap means
      // the two lists were built from different sources, and silently skipping
      // would look exactly like a user declining.
      throw new Error(`apply: phase 1 recorded no decision for ${file.destination}.`);
    }
    if (result !== "written") continue;
    journal.write(file.destination, file.content);
  }
}
