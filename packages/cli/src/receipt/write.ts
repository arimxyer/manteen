/**
 * Producing the next `manteen.lock.json`: merge, then bytes.
 *
 * Pure — this module writes nothing. `apply()` owns the write, as its final
 * mutation (phase 5), inside the same pre-image journal as phases 3 and 4.
 * That ordering is the whole invariant: a rolled-back run leaves a receipt
 * describing the state its files were restored to, and a SIGKILL mid-write
 * leaves one that UNDER-claims. Under-claiming costs a missed cross-run refusal;
 * over-claiming authorizes a future silent overwrite of a file manteen never
 * wrote. That asymmetry is also why `mergeReceipt` takes write OUTCOMES rather
 * than the plan — a `PlannedFile` with disposition `overwrite` may never have
 * been written at all.
 */
import {
  type CanonicalId,
  type Plan,
  RECEIPT_VERSION,
  type Receipt,
  type ReceiptFile,
  type ReceiptItem,
  type ReceiptPath,
  type ReceiptTheme,
  type WriteResult,
} from "../plan/types";
import { toReceiptPath } from "./path";

/** ABSOLUTE destination -> what phases 3 and 4 actually did there. */
export type WriteResults = ReadonlyMap<string, WriteResult>;

/**
 * Canonical bytes. `JSON.stringify` emits keys in insertion order, so every
 * object is rebuilt here through one construction site with one fixed field
 * order — two code paths producing the same receipt with different key order
 * pass every semantic test and fail only the determinism test.
 *
 * Sorting uses the default comparator, never `localeCompare`: the latter is
 * locale-dependent, and this file has to be byte-identical across machines and
 * CI legs. `theme.sources` is NOT sorted — fold order is semantic (D6).
 *
 * The trailing newline matches the kit's `writeRegistry`.
 */
export function serializeReceipt(receipt: Receipt): string {
  const canonical: Record<string, unknown> = {};
  // Emitted only when the user added one for editor completion; never by us.
  if (receipt.$schema !== undefined) canonical["$schema"] = receipt.$schema;
  canonical["lockfileVersion"] = receipt.lockfileVersion;
  canonical["items"] = [...receipt.items]
    .sort((a, b) => compare(a.id, b.id))
    .map((item) => ({
      id: item.id,
      registry: item.registry,
      sourceUrl: item.sourceUrl,
      wireType: item.wireType,
      direct: item.direct,
      files: [...item.files]
        .sort((a, b) => compare(a.destination, b.destination))
        .map((file) => ({
          destination: file.destination,
          wireType: file.wireType,
          sha256: file.sha256,
        })),
    }));
  canonical["theme"] = receipt.theme
    ? {
        destination: receipt.theme.destination,
        sha256: receipt.theme.sha256,
        sources: receipt.theme.sources.map((source) => ({
          itemId: source.itemId,
          kind: source.kind,
          path: source.path,
        })),
      }
    : null;

  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/**
 * Fold this run's outcomes into the prior receipt.
 *
 * `prior` is `null` on a first run AND when `--force` pushed past an unreadable
 * receipt — forcing discards every prior ownership record, which the
 * `receipt-unreadable` message states before the user forces.
 */
export function mergeReceipt(
  prior: Receipt | null,
  plan: Plan,
  results: WriteResults,
  themeWritten: boolean,
): Receipt {
  const root = plan.root;
  const priorItems = new Map<CanonicalId, ReceiptItem>();
  for (const item of prior?.items ?? []) priorItems.set(item.id, item);

  // 1. Rebuild every item this run touched. Prior claims of a rebuilt item at
  //    destinations NOT planned this run are dropped by construction: an item
  //    whose file list shrank must not keep claiming a destination it no longer
  //    produces, or a later unrelated item lands on a `receipt-collision` that
  //    nothing can clear.
  const rebuilt: ReceiptItem[] = [];
  const recorded = new Set<ReceiptPath>();

  for (const item of plan.items) {
    const priorItem = priorItems.get(item.id) ?? null;
    const priorFiles = new Map<ReceiptPath, ReceiptFile>();
    for (const file of priorItem?.files ?? []) priorFiles.set(file.destination, file);

    const files: ReceiptFile[] = [];
    for (const file of item.files) {
      const destination = toReceiptPath(file.destination, root);
      const result = results.get(file.destination);

      if (result === "written" || result === "identical") {
        // `identical` transfers ownership even though zero bytes moved: the
        // on-disk content already equals what we would have written, so the hash
        // is truthful. Gating this on "did we write" regresses the all-identical
        // case — a project installed before receipts existed would stay
        // permanently unprotected, which is the single most valuable thing the
        // receipt does.
        files.push({ destination, wireType: file.wireType, sha256: file.sha256 });
      } else {
        // `skipped` (declined prompt or `--no-overwrite`), or a destination
        // phases 3/4 never reported. We do not own a file we declined to write,
        // so only a prior claim BY THIS SAME ITEM carries over — with its
        // original hash, so a later run reports drift rather than treating the
        // destination as unowned.
        const carried = priorFiles.get(destination);
        if (!carried) continue;
        files.push({
          destination: carried.destination,
          wireType: carried.wireType,
          sha256: carried.sha256,
        });
      }
      recorded.add(destination);
    }

    rebuilt.push({
      id: item.id,
      registry: item.namespace,
      sourceUrl: item.sourceUrl,
      wireType: item.wireType,
      // Sticky: a transitive re-reach must not demote a user's explicit install.
      // A future `manteen remove` is what clears it.
      direct: (priorItem?.direct ?? false) || item.requestedBy.includes("<root>"),
      files,
    });
  }

  // 2. Carry over items this run did not touch.
  const rebuiltIds = new Set(rebuilt.map((item) => item.id));
  const carried = (prior?.items ?? []).filter((item) => !rebuiltIds.has(item.id));

  // 5. The theme merges cumulatively — computed before the ghost sweep, which
  //    consults it.
  const theme = mergeTheme(prior, plan, themeWritten, root);

  // 3. Prune stale claims, keyed on what step 1 actually RECORDED — not on what
  //    it planned. Keying on planned would delete a carried-over owner's record
  //    when the user declined the overwrite: nothing changed on disk, so nothing
  //    should change in the receipt. Only reachable via an authorized takeover,
  //    but a receipt must never hold two claims on one destination — that is
  //    precisely what `parseReceipt` refuses.
  const themeItemIds = new Set(theme?.sources.map((source) => source.itemId) ?? []);
  const survivors: ReceiptItem[] = [];
  for (const item of carried) {
    const files = item.files.filter((file) => !recorded.has(file.destination));
    // 4. Ghost items: zero files AND no theme contribution. The theme.sources
    //    consultation is what keeps an item whose only file was absorbed by the
    //    fold (D5) from being collected away.
    if (files.length === 0 && !themeItemIds.has(item.id)) continue;
    survivors.push({ ...item, files });
  }

  const next: Receipt = {
    lockfileVersion: RECEIPT_VERSION,
    items: [...rebuilt, ...survivors].sort((a, b) => compare(a.id, b.id)),
    theme,
  };
  // 6. `$schema` survives so a user who wired up editor completion keeps it.
  if (prior?.$schema !== undefined) next.$schema = prior.$schema;
  return next;
}

function mergeTheme(
  prior: Receipt | null,
  plan: Plan,
  themeWritten: boolean,
  root: string,
): ReceiptTheme | null {
  // `prior?.theme`, not `prior.theme`: `prior` is null on the first-ever run of
  // any project, and a first run that folds a theme is the common case.
  if (!plan.theme) return prior?.theme ?? null;

  // The fold was planned but never landed — a declined write, or a phase 4 that
  // did not run for a reason other than "nothing changed". Recording
  // `plan.theme.sha256` here would claim folded text that is not on disk.
  // `changed === false` is NOT this case: phase 4 legitimately no-ops and the
  // planned hash equals the base already on disk, so it still records.
  if (plan.theme.changed && !themeWritten) return prior?.theme ?? null;

  // Cumulative, in fold order, deduped on (itemId, path). `plan.theme.sources`
  // lists only THIS run's contributions — the fold reads its base from disk, not
  // from the receipt — so replacing wholesale would erase the record that an
  // earlier item ever contributed, destroying the provenance `manteen update`
  // exists to read.
  const sources = [...(prior?.theme?.sources ?? [])];
  const seen = new Set(sources.map((source) => sourceKey(source.itemId, source.path)));
  for (const source of plan.theme.sources) {
    const key = sourceKey(source.itemId, source.path);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ itemId: source.itemId, kind: source.kind, path: source.path });
  }

  return {
    destination: toReceiptPath(plan.theme.destination, root),
    sha256: plan.theme.sha256,
    sources,
  };
}

/** JSON, not a delimiter: no separator character is illegal inside a path. */
function sourceKey(itemId: CanonicalId, path: string): string {
  return JSON.stringify([itemId, path]);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
