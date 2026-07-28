/**
 * Destination collision — the in-RUN half of the shipped bug (D8).
 *
 * Identity dedupe keys on canonical id, so an item reached both directly and
 * transitively is one item and never reaches this gate. What this gate catches
 * is two DISTINCT canonical ids resolving to one destination:
 * `@house/empty-state` exports `EmptyStateProps` as
 * `{title, description, icon, action}` and `@base/empty-state` exports
 * `{title}`. Picking either breaks the other's callers, so there is no correct
 * answer at a prompt — hence error, non-forceable, and a durable remedy in
 * config rather than a flag.
 *
 * Its cross-RUN counterpart is `receipt.ts`, which joins one destination against
 * `manteen.lock.json`. The two are independent on purpose: a destination can
 * carry both diagnostics, and their messages are distinguishable ("in this run"
 * vs "recorded in manteen.lock.json").
 *
 * Pure: no fs, no fetch, no env. Ambient state arrives as parameters.
 */
import { bareNameOf } from "../config/registries";
import { diag } from "../plan/diagnostics";
import type { CanonicalId, Diagnostic, ResolvedFile } from "../plan/types";
import { toReceiptPath } from "../receipt/path";

/** One item's claim on a destination, as the message renders it. */
interface Claimant {
  itemId: CanonicalId;
  sourcePath: string;
}

/**
 * Group the write list by destination and refuse every group reached by more
 * than one canonical id.
 *
 * Takes the file list rather than the whole `ResolvedGraph` so a unit test can
 * state the collision in two lines; `plan/index.ts` calls it with `graph.files`.
 * `root` is used only to render root-relative destinations — a message
 * containing an absolute tmpdir is unassertable across machines.
 */
export function checkCollisions(files: readonly ResolvedFile[], root: string): Diagnostic[] {
  const groups = new Map<string, Claimant[]>();
  for (const file of files) {
    const claimants = groups.get(file.destination);
    const claim = { itemId: file.itemId, sourcePath: file.sourcePath };
    if (claimants) claimants.push(claim);
    else groups.set(file.destination, [claim]);
  }

  const diagnostics: Diagnostic[] = [];
  // Destinations in sorted order, so a plan with two collisions reports them the
  // same way whatever order the resolver flattened its items in.
  for (const destination of [...groups.keys()].sort(compare)) {
    const claimants = dedupe(groups.get(destination) ?? []);
    const ids = [...new Set(claimants.map((claim) => claim.itemId))].sort(compare);
    if (ids.length < 2) continue;

    // `path` is the ABSOLUTE destination, matching `PlannedFile.destination`, so
    // a reporter joins on it rather than parsing it back out of `message`. The
    // message renders it root-relative — an absolute tmpdir is unassertable, and
    // `toReceiptPath` is borrowed for its POSIX normalization so the printed form
    // matches what `manteen.lock.json` records for the same file.
    diagnostics.push(
      diag("target-collision", collisionMessage(toReceiptPath(destination, root), claimants, ids), {
        items: ids,
        path: destination,
      }),
    );
  }
  return diagnostics;
}

/**
 * The `resolution-applied` warning (D9), built here so the collision vocabulary
 * lives in one module.
 *
 * `resolve.ts` is what calls this: resolutions are applied during resolve, which
 * rewrites the loser, and after that rewrite `dependsOn` on every dependent
 * points at the winner — so the redirected set is unrecoverable from a
 * `ResolvedGraph` and only the code doing the rewrite can enumerate it. That is
 * also why this gate never sees a resolved collision at all.
 *
 * Warn, not info: a resolution substitutes a differently-typed implementation
 * behind an import specifier the registry author wrote. `data-table.tsx:51`
 * renders `<EmptyState title description />`; redirecting it onto a component
 * with no `description` prop is a direction-dependent hazard, not a note.
 */
export function resolutionApplied(input: {
  /** The `resolutions` key — a bare item name. */
  name: string;
  winner: CanonicalId;
  loser: CanonicalId;
  /** Items whose reference to `loser` was rewritten to `winner`. May be empty
   *  when the loser was named directly on the command line. */
  redirected: readonly CanonicalId[];
}): Diagnostic {
  const dependents = [...input.redirected].sort(compare);
  const lines = [
    `Resolved "${input.name}" to ${input.winner}; ${input.loser} was dropped.`,
    "",
    "A resolution substitutes a differently-typed implementation behind an import",
    "specifier the registry author wrote, so check the props line up.",
  ];
  if (dependents.length > 0) {
    lines.splice(1, 0, "", "Redirected:", ...dependents.map((id) => `  ${id}`));
  }
  return diag("resolution-applied", lines.join("\n"), { items: [input.winner, input.loser] });
}

function collisionMessage(
  destination: string,
  claimants: readonly Claimant[],
  ids: readonly CanonicalId[],
): string {
  const rows = [...claimants].sort(
    (a, b) => compare(a.itemId, b.itemId) || compare(a.sourcePath, b.sourcePath),
  );
  const width = Math.max(...rows.map((row) => row.itemId.length));
  const lines = [
    `${ids.length} items resolve to the same destination: ${destination}`,
    "",
    ...rows.map((row) => `  ${row.itemId.padEnd(width)}  ${row.sourcePath}`),
    "",
    "Content ships verbatim: these files cannot be renamed, and picking one",
    "breaks the callers of the others.",
    "",
    ...remedy(ids),
  ];
  return lines.join("\n");
}

/**
 * A `resolutions` entry is name-keyed (§5 open question 3), so it can only be
 * suggested when every claimant shares one bare name. Two differently-named
 * items whose `files[].target` values coincide cannot be expressed by it, and a
 * `url:` ref has no bare name at all — printing the suggestion in either case
 * hands the user a remedy that does not work.
 */
function remedy(ids: readonly CanonicalId[]): string[] {
  const names = ids.map(bareNameOf);
  const name = names[0];
  const winner = ids[0]; // lexicographically first, so the suggestion is stable
  const shared =
    name !== null && name !== undefined && winner !== undefined && names.every((n) => n === name);
  if (!shared) {
    return [
      "These items do not share a bare name, so a `resolutions` entry cannot",
      "address them. Change the conflicting `target` in one registry, or point",
      "the alias it resolves through at a different directory.",
    ];
  }
  return [
    "Pick a winner in manteen.json — it persists, so CI decides the same way:",
    "",
    '  "resolutions": {',
    `    "${name}": "${winner}"`,
    "  }",
  ];
}

/** Keyed on the (id, sourcePath) PAIR: one item may legitimately appear twice in
 *  a group via two different source files, and that is worth printing. */
function dedupe(claimants: readonly Claimant[]): Claimant[] {
  const seen = new Set<string>();
  const out: Claimant[] = [];
  for (const claim of claimants) {
    const key = JSON.stringify([claim.itemId, claim.sourcePath]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

/** Default comparator semantics — UTF-16 code units, locale-independent.
 *  `localeCompare` would make the message depend on the machine's LANG. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
