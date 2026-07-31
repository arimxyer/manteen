/** Phase 5 — write the precomputed Manteen-owned package stylesheet. */
import type { PlannedStyles } from "../plan/types";
import type { Journal } from "./journal";

export function writeStyles(styles: PlannedStyles | null, journal: Journal): boolean {
  if (styles === null || !styles.changed) return false;
  journal.write(styles.destination, styles.text);
  return true;
}
