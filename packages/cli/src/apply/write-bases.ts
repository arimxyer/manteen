/** Phase 6 — commit pristine upstream ancestors for accepted component files. */
import type { PlannedBaseRemoval, PlannedFile, WriteResult } from "../plan/types";
import type { Journal } from "./journal";

export function writeBases(
  files: readonly PlannedFile[],
  results: ReadonlyMap<string, WriteResult>,
  journal: Journal,
): void {
  for (const file of files) {
    const result = results.get(file.destination);
    if (result !== "written" && result !== "identical") continue;
    if (file.base.existing?.sha256 === file.base.sha256) continue;
    journal.write(file.base.destination, file.base.content);
  }
}

export function removeBases(removals: readonly PlannedBaseRemoval[], journal: Journal): void {
  for (const base of removals) {
    if (base.existing === null) continue;
    journal.remove(base.destination);
  }
}
