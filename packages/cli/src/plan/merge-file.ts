/** Exact, line-oriented three-way merge for ordinary registry files. Pure. */
import { diff3Merge } from "node-diff3";

export interface FileMergeConflict {
  localStart: number;
  baseStart: number;
  incomingStart: number;
  localLines: number;
  baseLines: number;
  incomingLines: number;
}

export type FileMergeResult =
  | { ok: true; content: string }
  | { ok: false; conflicts: FileMergeConflict[] };

/** Preserve terminators so LF, CRLF, lone CR and final-newline state survive. */
export function splitExactLines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g) ?? [];
}

export function mergeFile(local: string, base: string, incoming: string): FileMergeResult {
  const regions = diff3Merge(
    splitExactLines(local),
    splitExactLines(base),
    splitExactLines(incoming),
    { excludeFalseConflicts: true },
  );

  const conflicts: FileMergeConflict[] = [];
  const merged: string[] = [];
  for (const region of regions) {
    if (region.ok !== undefined) {
      merged.push(...region.ok);
      continue;
    }
    const conflict = region.conflict;
    if (conflict === undefined) continue;
    conflicts.push({
      localStart: conflict.aIndex,
      baseStart: conflict.oIndex,
      incomingStart: conflict.bIndex,
      localLines: conflict.a.length,
      baseLines: conflict.o.length,
      incomingLines: conflict.b.length,
    });
  }

  return conflicts.length === 0 ? { ok: true, content: merged.join("") } : { ok: false, conflicts };
}
