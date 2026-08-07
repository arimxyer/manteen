/**
 * Cross-RUN ownership — the half of the shipped bug `gates/collision.ts` cannot
 * see.
 *
 * D8 refuses two distinct ids reaching one destination *within one command*.
 * `@base/empty-state` installed this week over `@house/empty-state` installed
 * last week is a different event: only one of them is in the graph, so there is
 * no group to refuse. This gate joins one destination against what
 * `manteen.lock.json` says manteen wrote there.
 *
 * Complementary, not duplicative: a destination may carry both diagnostics and
 * their messages are distinguishable ("in this run" vs "recorded in
 * manteen.lock.json"). The two gates stay independent so each is testable alone.
 *
 * Pure. The receipt index, the on-disk hashes and `resolutions` all arrive as
 * parameters — `plan/index.ts` is the module that read them.
 *
 * It iterates only the destinations THIS run touches. Sweeping the whole receipt
 * for staleness would report on files unrelated to the command; that is
 * `manteen diff`'s job.
 */
import { bareNameOf } from "../config/registries";
import { diag } from "../plan/diagnostics";
import type { CanonicalId, Diagnostic, ReceiptIndex, ReceiptOwnerRef } from "../plan/types";
import { toReceiptPath } from "../receipt/path";
import { ownerOf } from "../receipt/read";
import { resolutionApplied } from "./collision";

export interface ReceiptGateInput {
  /** Absolute project root. Used only to render root-relative destinations — a
   *  message containing an absolute tmpdir is unassertable across machines. */
  root: string;
  /** Already collapses the absent and unreadable cases to an empty map. */
  index: ReceiptIndex;
  /** From `ResolvedGraph.files`. Destinations are ABSOLUTE. */
  files: readonly { itemId: CanonicalId; destination: string }[];
  items: ReadonlyMap<CanonicalId, { registry: string | null }>;
  /**
   * Absolute destination -> sha256 of the bytes on disk, or `null` when absent.
   * `null`, NEVER `undefined`: every destination iterated here was hashed by the
   * same pass that populated this map, and an `undefined` read inverts steps 3
   * and 4 — "the file is gone" becomes "the file is present with hash
   * undefined".
   */
  existing: ReadonlyMap<string, string | null>;
  /** Bare item name -> winning canonical id (D9). A `Map`, because a plain
   *  object returns a FUNCTION for the inherited keys `toString` and
   *  `constructor` and every lookup would need an `Object.hasOwn` guard. */
  resolutions: ReadonlyMap<string, CanonicalId>;
  /** Absolute, or null. Skipped entirely — a theme file is folded, not owned. */
  themeDestination: string | null;
}

export function checkReceipt(input: ReceiptGateInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  // Sorted by destination so two collisions report in the same order however the
  // resolver flattened its items.
  const files = [...input.files].sort(
    (a, b) => compare(a.destination, b.destination) || compare(a.itemId, b.itemId),
  );

  for (const file of files) {
    if (seen.has(file.destination)) continue;
    seen.add(file.destination);

    // 1. The theme destination is folded, not owned (D5). The writer never
    //    records it under an item, but a hand-edited receipt could — skipping
    //    makes that phantom unreachable rather than merely unlikely. There is
    //    deliberately no theme-drift code either: the fold is non-destructive
    //    (`prefer: "base"` keeps the user's leaves), so a hand-edited theme is
    //    not the hazard a hand-edited about-to-be-overwritten component is.
    if (input.themeDestination !== null && file.destination === input.themeDestination) continue;

    // 2. Unowned, or no receipt, or an unreadable one.
    const owner = ownerOf(input.index, file.destination);
    if (owner === null) continue;

    const onDisk = input.existing.get(file.destination) ?? null;
    // `toReceiptPath` rather than `path.relative` directly: the printed form then
    // matches, byte for byte, what manteen.lock.json records for the same file.
    const where = toReceiptPath(file.destination, input.root);

    // 3. An ordinary reinstall.
    if (owner.itemId === file.itemId) {
      if (onDisk !== null && onDisk !== owner.installedSha256) {
        diagnostics.push(
          diag(
            "receipt-drift",
            `${where} has changed since manteen last accepted it for ${owner.itemId}. It will not be treated as pristine.`,
            { items: [file.itemId], path: file.destination },
          ),
        );
      }
      continue;
    }

    // 4. The receipt is stale: a different item is recorded, but the file is
    //    gone (removed out of band, or a branch switch reverted it). Ownership
    //    transfers and the run proceeds — nothing is being replaced, so refusing
    //    would be theatre — but the transfer is stated.
    if (onDisk === null) {
      diagnostics.push(
        diag(
          "receipt-stale",
          `manteen.lock.json records ${where} as installed by ${describe(owner)}, but the file is gone. ${file.itemId} takes ownership of it.`,
          { items: [file.itemId, owner.itemId].sort(compare), path: file.destination },
        ),
      );
      continue;
    }

    // 5. An AUTHORIZED takeover.
    //
    //    The bare names must MATCH. Testing only `resolutions.get(name of the
    //    incoming item) === incoming.itemId` lets a resolution written about one
    //    name authorize replacing an owner with a different name: with
    //    `{"empty-state": "@base/empty-state"}` in config, `@base/empty-state`
    //    would be waved through over a recorded `@house/empty` that reached the
    //    same destination via `files[].target`.
    //
    //    `bareNameOf` returns null for a `url:` id, so a `url:` owner or a `url:`
    //    incoming can never be authorized and falls through to step 6. That is
    //    correct rather than a gap: a name-keyed resolution cannot name a URL, so
    //    there is nothing for the user to write.
    const ownerName = bareNameOf(owner.itemId);
    const incomingName = bareNameOf(file.itemId);
    const authorized =
      ownerName !== null &&
      ownerName === incomingName &&
      input.resolutions.get(ownerName) === file.itemId;

    if (authorized) {
      // Emitted HERE because nothing else fires on this path: the resolution
      // names the item the user already typed, so the resolver rewrites nothing
      // and never warns — and under `--overwrite` in CI there is no prompt to
      // carry the message either. Without this the takeover is completely
      // silent, which is the shipped bug with a permission slip.
      diagnostics.push(
        resolutionApplied({
          name: ownerName,
          winner: file.itemId,
          loser: owner.itemId,
          redirected: [],
        }),
      );
      continue;
    }

    // 6. An unauthorized cross-run collision.
    diagnostics.push(
      diag("receipt-collision", collisionMessage(where, owner, file.itemId, input), {
        items: [file.itemId, owner.itemId].sort(compare),
        path: file.destination,
      }),
    );
  }

  return diagnostics;
}

/** `registry ?? id`, so two colliding `url:` refs stay distinguishable. */
function describe(owner: ReceiptOwnerRef): string {
  return owner.registry === null ? owner.itemId : `${owner.itemId} (${owner.registry})`;
}

function collisionMessage(
  destination: string,
  owner: ReceiptOwnerRef,
  incoming: CanonicalId,
  input: ReceiptGateInput,
): string {
  const registry = input.items.get(incoming)?.registry ?? null;
  const incomingLabel = registry === null ? incoming : `${incoming} (${registry})`;

  const lines = [
    `${destination} is recorded in manteen.lock.json as installed by ${describe(owner)}.`,
    "",
    `  recorded  ${describe(owner)}`,
    `  incoming  ${incomingLabel}`,
    "",
    "Content ships verbatim, so these two implementations cannot both live here",
    "and picking one breaks the callers of the other.",
    "",
    ...remedy(owner.itemId, incoming),
  ];
  return lines.join("\n");
}

/**
 * A `resolutions` entry is name-keyed, so it can only be suggested when both ids
 * share a bare name. Two differently-named items whose targets coincide cannot
 * be expressed by it, and a `url:` ref has no bare name at all — printing the
 * suggestion in either case hands the user a remedy that does not work.
 */
function remedy(loser: CanonicalId, winner: CanonicalId): string[] {
  const loserName = bareNameOf(loser);
  const winnerName = bareNameOf(winner);
  if (loserName === null || loserName !== winnerName) {
    return [
      "These items do not share a bare name, so a `resolutions` entry cannot",
      "address them. Change the conflicting `target` in one registry, or remove",
      `the ${loser} entry from manteen.lock.json to hand the destination back.`,
    ];
  }
  return [
    "Pick a winner in manteen.json — it persists, so CI decides the same way:",
    "",
    '  "resolutions": {',
    `    "${winnerName}": "${winner}"`,
    "  }",
  ];
}

/** UTF-16 code units, locale-independent. Never `localeCompare`. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
