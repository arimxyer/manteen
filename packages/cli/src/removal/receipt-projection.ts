/** Pure D42 receipt projection. It never removes an item or artifact provenance. */
import type { Receipt } from "../plan/types";
import type { RemovalReceiptProjection, RemovalSelection } from "./types";

/** Removal preserves the receipt's existing item/file order; only exact rows disappear. */
export function serializeProjectedRemovalReceipt(receipt: Receipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

function key(selection: RemovalSelection): string {
  return `${selection.itemId}\u0000${selection.destination}`;
}

export function projectRemovalReceipt(
  receipt: Receipt,
  selections: readonly RemovalSelection[],
): RemovalReceiptProjection {
  const wanted = new Map<string, RemovalSelection>();
  for (const selection of selections) {
    const selectionKey = key(selection);
    if (wanted.has(selectionKey)) {
      return { ok: false, reason: "duplicate-selection", selection };
    }
    wanted.set(selectionKey, selection);
  }

  const found = new Set<string>();
  const items = receipt.items.map((item) => {
    const files = item.files.filter((file) => {
      const selectionKey = key({ itemId: item.id, destination: file.destination });
      if (!wanted.has(selectionKey)) return true;
      found.add(selectionKey);
      return false;
    });
    return files.length === item.files.length ? item : { ...item, files };
  });

  for (const [selectionKey, selection] of wanted) {
    if (!found.has(selectionKey)) {
      return { ok: false, reason: "record-not-found", selection };
    }
  }

  if (selections.length === 0) {
    return { ok: true, changed: false, receipt, removed: [] };
  }
  return {
    ok: true,
    changed: true,
    receipt: { ...receipt, items },
    removed: [...selections],
  };
}
