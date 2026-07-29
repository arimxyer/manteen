/**
 * Phase 4 — the theme write.
 *
 * The thinnest module in the package, and deliberately so: D7 put the ENTIRE
 * merge in `plan()`, so by the time control reaches here `PlannedTheme.text` is
 * final bytes and the only question left is whether to write them. A module that
 * merged anything would be re-introducing the reachable throw D7 exists to move
 * — `mergeThemeSource` throws on a base it cannot read, and a throw at this
 * point lands after phase 3 has already put component files on disk.
 *
 * It exists as its own file rather than as three lines inside `apply/index.ts`
 * for the same reason `write-files.ts` does: §1's package skeleton names it, and
 * the phase boundary is easier to hold when each phase's rule has somewhere to
 * be written down. What it owns is exactly one decision — `changed`.
 *
 * `changed === false` is a real skip and not a missing feature. It means the
 * fold produced text byte-identical to what is already at the destination, which
 * is what a re-run of the same install produces, so writing would move zero
 * bytes and churn an mtime on a file that is very likely in the user's git
 * history. Ownership is not lost by skipping: `mergeReceipt` records
 * `plan.theme.sha256`, which in that case is the hash of the bytes already
 * there.
 *
 * The `journal` parameter is the SAME one phase 3 wrote through, which is the
 * property that makes a later failure — a receipt write that cannot land, say —
 * unwind the folded theme along with the components. A journal created here
 * would restore its own entry and no more, leaving a tree where the theme moved
 * forward and the files it was folded for did not.
 */
import type { PlannedTheme } from "../plan/types";
import type { Journal } from "./journal";

/** Whether bytes were written — the value `ApplyOutcome.theme.written` reports. */
export function writeTheme(theme: PlannedTheme | null, journal: Journal): boolean {
  if (theme === null || !theme.changed) return false;
  // One journalled temp+rename of precomputed text. No merge, no read, no
  // decision beyond the one above.
  journal.write(theme.destination, theme.text);
  return true;
}
