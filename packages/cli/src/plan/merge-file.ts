/** Exact three-way merge: line diff3 first, then D41's TS fallback. Pure. */
import { diff3Merge } from "node-diff3";

import { isTypeScriptMergeSource, mergeTypeScriptExactly } from "./merge-typescript";

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

export function mergeFile(
  local: string,
  base: string,
  incoming: string,
  sourcePath?: string,
): FileMergeResult {
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

  if (conflicts.length === 0) return { ok: true, content: merged.join("") };

  // D41: AST identity is a conflict-only fallback for registry TypeScript.
  // It may return only exact source slices after reconstructing both complete
  // sides. Any uncertainty preserves the original diff3 conflict metadata.
  if (sourcePath !== undefined && isTypeScriptMergeSource(sourcePath)) {
    const exact = mergeTypeScriptExactly({ sourcePath, base, local, incoming });
    if (exact.ok) return { ok: true, content: exact.content };
  }

  return { ok: false, conflicts };
}
