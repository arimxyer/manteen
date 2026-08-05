/**
 * Refuse registry output inside Manteen's private state tree.
 *
 * Pure. `resolve()` has already proven every destination is inside `root`; this
 * gate only separates project output from `.manteen/`, whose files are written
 * transactionally by apply and must never be registry-owned inputs.
 */
import { diag } from "../plan/diagnostics";
import type { Diagnostic, ResolvedFile } from "../plan/types";
import { isManteenStatePath, toReceiptPath } from "../receipt/path";

export function checkReservedTargets(files: readonly ResolvedFile[], root: string): Diagnostic[] {
  return files
    .filter((file) => isManteenStatePath(file.destination, root))
    .map((file) =>
      diag(
        "target-reserved",
        `${toReceiptPath(file.destination, root)} is inside .manteen/, which is reserved for ` +
          "Manteen's merge bases and transactional state. Choose a project destination outside .manteen/.",
        { items: [file.itemId], path: file.destination },
      ),
    );
}
