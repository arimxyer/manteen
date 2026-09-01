/**
 * The inventory contract — what `list`, `info`, `diff` and `update` read, and
 * what they hand back to the renderer.
 *
 * `src/plan/types.ts` is the contract for INSTALLING. This is the contract for
 * INSPECTING, and it is a separate file for the same reason `ApplyFailureKind`
 * is a separate channel from `Diagnostic`: `plan/types.ts` is frozen, and every
 * `DiagnosticCode` must have an emitter or be listed as pending
 * (`scripts/guard-diagnostics.mjs`). "This registry publishes no index" is not a
 * plan-stage refusal and must never acquire a code in that enum — so
 * `InventoryNote` below is the only legal channel for it, not a style choice.
 *
 * Two readers produce everything here and they answer different questions:
 *
 *   installed.ts   what THIS PROJECT has, from `manteen.lock.json`
 *   available.ts   what a REGISTRY offers, from D21's per-registry `index` URL
 *
 * Nothing in this file, or in either reader, ever writes. `update` is the only
 * command that mutates and it does so exclusively through `plan()`/`apply()` —
 * every gate, the pre-image journal, temp+rename and the receipt live on that
 * path, and a command that writes files itself gets none of them.
 *
 * Secrets: every URL-shaped field here is REDACTED (`${VAR}` left literal),
 * exactly as `PlanItem.sourceUrl` and `ReceiptItem.sourceUrl` are. The single
 * expanded URL in this feature is `IndexRequest.url`, which is documented at its
 * declaration and never reaches a result shape.
 */

import type {
  ApplyOutcome,
  CanonicalId,
  Plan,
  PlannedStyleSource,
  ReceiptPath,
  ReceiptUnreadable,
  ThemeSourceKind,
} from "../plan/types";
import type { MantineMeta, MantineProps, MantineUsage, ThemeSummary } from "../plan/validate-item";
import type { VerificationOutcome } from "../verification/types";

/** Re-exported so a command needs one import for the inspect vocabulary. */
export type {
  MantineMeta,
  MantineProp,
  MantineProps,
  MantineUsage,
  ThemeSummary,
} from "../plan/validate-item";

// ---- notes ------------------------------------------------------------------

/**
 * Why something a command was asked about is absent from the result.
 *
 * NOT a `DiagnosticCode` — see the module docblock. These are informational by
 * construction: none of them refuses a run on its own. A command decides its own
 * exit code (`list` with every registry skipped is arguably still a successful
 * listing of nothing; `info` on an item that exists nowhere is not).
 */
export type InventoryNoteCode =
  /** The registry declares no `index`, so it cannot be listed at all (D21). */
  | "no-index"
  /** The `index` URL, a header or a param references an unset `${VAR}`. The
   *  request is NOT sent: a URL with a hole in it published to a registry's
   *  access log leaks the shape of the user's config. */
  | "index-missing-env"
  /** The index URL could not be fetched — network, status, or too large. */
  | "index-unreachable"
  /** The index was fetched and is not a document we recognise as an index. */
  | "index-invalid"
  /** An index entry was skipped because it named no item. */
  | "index-entry-dropped"
  /** An index entry's name cannot be a `CanonicalId`, so it is listed but is not
   *  installable. `AvailableItem.id` is `null` for exactly these. */
  | "index-name-uninstallable"
  /** `manteen.lock.json` does not exist. Ordinary, never an error: most projects
   *  have never run `manteen add`. */
  | "no-receipt"
  /** `manteen.lock.json` exists and could not be parsed, validated, or is from a
   *  future `lockfileVersion`. */
  | "receipt-unreadable"
  /** The named item is not recorded in the receipt. */
  | "not-installed"
  /** The named item is installed (or was asked for) and its registry's index
   *  does not list it. */
  | "not-in-index"
  /** A namespace named on the command line is not in `manteen.json`. */
  | "unknown-namespace";

/**
 * One thing a command could not answer, in a shape every renderer can print the
 * same way.
 *
 * `message` is a complete sentence and is the only field guaranteed printable.
 * It never contains an expanded `${VAR}`: every note built from a fetch failure
 * takes its URL from `LoadedDoc.redactedUrl` and its detail from a loader, both
 * of which are authored to be secret-free.
 *
 * **A note is never mixed into a `Diagnostic[]`, and a renderer must not switch
 * on `code` alone.** Two spellings collide across the two vocabularies —
 * `unknown-namespace` and `receipt-unreadable` are values of BOTH
 * `DiagnosticCode` and `InventoryNoteCode` — and they mean opposite things: the
 * diagnostic is a blocking refusal, the note is informational and blocks
 * nothing. They are deliberately not renamed, because each reads correctly in
 * its own channel; keeping the channels apart is what makes that safe.
 */
export interface InventoryNote {
  code: InventoryNoteCode;
  message: string;
  /** The namespace this is about, when it is about one. */
  registry?: string;
  /** The item this is about, when it is about one. */
  itemId?: CanonicalId;
  /** REDACTED. The only URL form safe to print. */
  redactedUrl?: string;
}

// ---- installed --------------------------------------------------------------

/**
 * The two hashes every recorded artefact carries, and the reason they are two.
 *
 * `recordedSha256` is what manteen WROTE — copied verbatim out of the receipt,
 * never recomputed. `currentSha256` is what is on disk NOW. The pair is what
 * lets `diff` tell a local edit apart from an upstream change, which is why it
 * is computed once here rather than twice in two commands.
 *
 * HASH DOMAINS, and getting this wrong passes every ASCII fixture:
 * Receipt file/theme hashes encode the STRING manteen accepted as UTF-8, while
 * `currentSha256` hashes RAW FILE BYTES. The domains compare only because writes
 * use explicit UTF-8 with no BOM or newline translation.
 */
export interface HashPair {
  /** From the receipt. 64 lowercase hex characters, structurally validated. */
  recordedSha256: string;
  /** Of the bytes on disk now; `null` when the file does not exist. */
  currentSha256: string | null;
}

/**
 * Local state, DERIVED rather than stored.
 *
 * `PlannedFile.priorOwner`'s docblock states the rule this follows: the drift
 * test is deliberately not a precomputed boolean, so a cached verdict cannot
 * disagree with the hashes it was computed from. `localStatus()` in
 * `installed.ts` is the single implementation.
 */
export type LocalStatus = "unchanged" | "modified" | "missing";

export interface InstalledFile extends HashPair {
  /** ABSOLUTE, resolved from the receipt's POSIX-relative form. */
  destination: string;
  /** Exactly as stored: POSIX, relative to `root`. Print THIS, not the absolute
   *  form — a receipt written on Windows and read on Linux must render alike. */
  receiptPath: ReceiptPath;
  wireType: string;
  /** ABSOLUTE path to the exact pristine ancestor used by update. */
  basePath: string;
  /** Hash of the exact pristine ancestor recorded in the receipt. */
  baseSha256: string;
  /** Hash of the base bytes on disk now; null when the sidecar is missing OR
   *  cannot be read. Both mean "no usable ancestor" to every consumer, and the
   *  coded refusal for the second case belongs to `plan()`, not to a report. */
  baseCurrentSha256: string | null;
}

export interface InstalledItem {
  id: CanonicalId;
  /** `PlanItem.namespace`; `null` for a bare `url:` ref, which has none. */
  registry: string | null;
  /** REDACTED. */
  sourceUrl: string;
  wireType: string;
  /** Appeared as a root ref in some run. Sticky across refreshes — a transitive
   *  re-reach never demotes an explicit install. `update` with no arguments
   *  should default to the direct set; `--all` includes the rest. */
  direct: boolean;
  /** Sorted by `receiptPath`, by code unit. Sorted by `fromReceiptState`, NOT
   *  taken on trust from the file — nothing validates a receipt's order. */
  files: InstalledFile[];
}

/**
 * The folded theme, as the receipt records it.
 *
 * A theme is FOLDED, not owned (D5) — it never appears in
 * `InstalledItem.files`, and no item may be said to own it. It is recorded here
 * because `diff` and `update` both need to know whether the user hand-edited it
 * since the last fold.
 */
export interface InstalledTheme extends HashPair {
  /** ABSOLUTE. */
  destination: string;
  receiptPath: ReceiptPath;
  /** CUMULATIVE across runs, in fold order, deduped on (itemId, path) — not
   *  only the last run's contributions. */
  sources: readonly { itemId: CanonicalId; kind: ThemeSourceKind; path: string }[];
}

export interface InstalledStyles extends HashPair {
  destination: string;
  receiptPath: ReceiptPath;
  sources: readonly PlannedStyleSource[];
}

/**
 * Where the inventory came from, so a command can say "no receipt yet" without
 * inspecting `items.length` and guessing.
 *
 * All three arms yield an EMPTY `items` — absence and unreadability are not
 * errors here, they are states with different remedies. `unreadable` mirrors
 * `plan()`'s behaviour exactly: `buildIndex` also returns an empty map for it,
 * so nothing in this codebase reads records out of a receipt it could not fully
 * validate.
 */
export type InstalledSource =
  | { state: "absent"; path: string }
  | { state: "ok"; path: string }
  | {
      state: "unreadable";
      path: string;
      reason: ReceiptUnreadable;
      detail: string;
      sawVersion?: number;
    };

export interface Installed {
  /** ABSOLUTE project root. Every `destination` is under it. */
  root: string;
  source: InstalledSource;
  /** Sorted by id, by code unit — see `byId` in `installed.ts` for why this is
   *  sorted rather than taken on trust. Empty unless `source.state` is `"ok"`. */
  items: InstalledItem[];
  theme: InstalledTheme | null;
  styles: InstalledStyles | null;
  /** At most one, and only for `no-receipt` / `receipt-unreadable`. */
  notes: InventoryNote[];
}

// ---- available --------------------------------------------------------------

/**
 * One item a registry's index advertises.
 *
 * The index is a REGISTRY-CONTROLLED document whose fields are printed to a
 * terminal, so `name`, `title` and `description` have been stripped of control
 * and bidirectional-override characters and bounded in length. `rawName` is the
 * untouched string, kept because `list` and `add` must agree about what the item
 * is called.
 */
export interface AvailableItem {
  /** The canonical id `add` would take, or `null` when the published name
   *  cannot be one — `parseRef` is the single detector of that, so a name
   *  `list` shows as uninstallable is exactly a name `add` would reject. */
  id: CanonicalId | null;
  /** Verbatim from the index. May contain anything; do not print it. */
  rawName: string;
  /** Sanitized for display. */
  name: string;
  registry: string;
  /** Wire item type, e.g. `registry:ui`. Sanitized. `null` when the index does
   *  not publish one — a bare-string index entry names an item and nothing
   *  else, and inventing `registry:ui` for it would be a guess a renderer would
   *  print as fact. */
  type: string | null;
  /** Sanitized; `null` when the index does not publish one. */
  title: string | null;
  description: string | null;
  /** `meta.mantine` as the index publishes it. See `IndexMeta`. */
  mantine: IndexMeta | null;
}

/**
 * `meta.mantine` from an index ENTRY.
 *
 * `MantineMeta` minus item-document-only theme metadata, and the exclusion is structural rather
 * than documentary on purpose: `themeFragment` inlines the FULL SOURCE of a
 * theme file, and a type that admits the field is a renderer one autocomplete
 * away from dumping it into a listing. `themeSummary` is derived only beside a
 * fragment, so it is item-document metadata too. The kit emits only `requires`
 * and `provider` in an index (`build-registry.ts` `buildIndex`), so nothing is lost.
 *
 * DISPLAY ONLY. Every string here has been through `sanitize`, which truncates
 * past a bound — a pathological 200-character `requires` comes back with an
 * ellipsis on it and would then fail `semver.validRange`. Anything that
 * EVALUATES a range must read it off the item document (`ItemDetail.meta`, or
 * `PlanItem.requires`), never off a listing.
 */
export type IndexMeta = Omit<MantineMeta, "themeFragment" | "themeSummary">;

/** One registry's index, fetched and parsed. */
export interface RegistryListing {
  registry: string;
  /** REDACTED. */
  redactedUrl: string;
  /** The index's own `name` / `homepage`, sanitized; `null` when absent. */
  title: string | null;
  homepage: string | null;
  /** Sorted by `rawName`, by code unit — the order of `items` in an index is the
   *  registry's choice and must not decide our output. */
  items: AvailableItem[];
}

export interface Available {
  /** Sorted by namespace, by code unit. */
  registries: RegistryListing[];
  /** Every registry's items, flattened in `registries` order. */
  items: AvailableItem[];
  /** Registries that could not be listed, and why. One per registry at most,
   *  plus per-entry notes. Sorted by (registry, code). */
  notes: InventoryNote[];
}

// ---- item detail (`info`) ---------------------------------------------------

/**
 * One file an item ships, WITHOUT its content.
 *
 * `ValidatedItem.files[].content` is the whole source of the file. `info` prints
 * a summary, so the projection drops it and keeps the size — which is the useful
 * part of it — rather than trusting four renderers to remember not to print it.
 */
export interface DetailFile {
  path: string;
  wireType: string;
  /** `files[].target`, or `null`. */
  target: string | null;
  /** `Buffer.byteLength(content, "utf8")`. */
  bytes: number;
}

/** `MantineMeta` with the inlined theme source replaced by its path, for the
 *  same reason `DetailFile` drops `content`. */
export interface DetailMeta {
  requires?: string;
  provider?: string;
  stylesApi?: Record<string, string[]>;
  props?: MantineProps;
  usage?: MantineUsage;
  themeFragment?: { path: string; bytes: number };
  themeSummary?: ThemeSummary;
}

/**
 * The item DOCUMENT, as opposed to the index ENTRY.
 *
 * Richer than `AvailableItem` — it is what the registry actually serves for one
 * item, so it knows the files, the npm dependencies and the registry
 * dependencies. `info` fetches it; `list` never does, because one fetch per
 * listed item is not a listing.
 *
 * `title` and `description` are absent on purpose: the wire item carries them
 * but `ValidatedItem` does not, and re-parsing the raw document to recover two
 * strings would put a second wire reader in the codebase. `InfoResult.available`
 * is where they come from.
 */
export interface ItemDetail {
  /** As the DOCUMENT names itself, which may differ from the name that was
   *  asked for — `name-mismatch` is a real diagnostic. */
  name: string;
  wireType: string;
  /** REDACTED. */
  redactedUrl: string;
  /** Optional markdown authored for this item. Verbatim in JSON; terminal
   * renderers sanitize and bound it before display. */
  docs?: string;
  files: DetailFile[];
  dependencies: string[];
  devDependencies: string[];
  registryDependencies: string[];
  cssImports: string[];
  meta: DetailMeta;
}

// ---- command results --------------------------------------------------------

/** Stable query fields, strongest identity fields first. */
export type ListQueryMatchField = "id" | "name" | "title" | "description";

/** The strongest reason a row matched, in deterministic relevance order. */
export type ListQueryRank =
  | "exact-id"
  | "exact-name"
  | "exact-title"
  | "title-prefix"
  | "identity-substring"
  | "title-substring"
  | "description-substring";

/** One row of `manteen list`: what the registry offers, and whether we have it. */
export interface ListRow {
  item: AvailableItem;
  /** The receipt's record for `item.id`, or `null`. Always `null` when
   *  `item.id` is `null` — an uninstallable name cannot have been installed. */
  installed: InstalledItem | null;
  /** Fields whose normalized value contains the current query, in stable
   * identity-to-description order. Empty when no query was supplied. */
  queryMatches: ListQueryMatchField[];
  /** Strongest deterministic match, or null when no query was supplied. */
  queryRank: ListQueryRank | null;
}

export interface ListGroup {
  /** Namespace for configured/recorded registries; null for direct URL installs. */
  registry: string | null;
  /** REDACTED. */
  redactedUrl: string | null;
  title: string | null;
  homepage: string | null;
  rows: ListRow[];
}

export interface ListResult {
  /** Sorted by namespace. */
  groups: ListGroup[];
  notes: InventoryNote[];
}

/**
 * `manteen info <ref>`.
 *
 * All three sources are independently nullable and every combination is
 * reachable: an item installed from a registry that publishes no index has
 * `installed` only; a listed item that 404s on fetch has `available` only; a
 * `url:` ref has `detail` only. `notes` says which are missing and why.
 */
export interface InfoResult {
  id: CanonicalId;
  registry: string | null;
  /** From the registry's index. */
  available: AvailableItem | null;
  /** From `manteen.lock.json`. */
  installed: InstalledItem | null;
  /** From the item document itself. */
  detail: ItemDetail | null;
  notes: InventoryNote[];
}

/**
 * What moved at one destination, across THREE hashes rather than two.
 *
 * This is the whole reason `diff` exists as its own command: "the file changed"
 * is four different situations with four different remedies, and an installer
 * that collapses them tells a user with a deliberate local edit the same thing
 * it tells a user who is simply behind.
 */
export type FileChange =
  /** disk === recorded === upstream. */
  | "unchanged"
  /** disk !== recorded, upstream === recorded. The user edited it; `update`
   *  would overwrite the edit. */
  | "local-only"
  /** disk === recorded, upstream !== recorded. Cleanly updatable. */
  | "upstream-only"
  /** Both moved. Default update either proposes a clean merge or refuses a
   *  conflict; `DiffFile.outcome` says which. */
  | "both"
  /** The file is gone from disk. Default update refuses; `--take-upstream`
   *  restores it. */
  | "missing"
  /** The receipt records it and the item no longer ships it. `update` leaves it
   *  alone; nothing in v1 deletes a file manteen wrote. */
  | "removed-upstream"
  /** The item ships it and the receipt has no record. A new file. */
  | "added-upstream"
  /** Upstream could not be fetched, so only the local pair is known. */
  | "unavailable";

export interface DiffFile {
  itemId: CanonicalId;
  /** ABSOLUTE. */
  destination: string;
  /** POSIX, root-relative. Print this. */
  receiptPath: ReceiptPath;
  /** `null` for `added-upstream`. */
  recordedSha256: string | null;
  /** `null` when the file is not on disk. */
  currentSha256: string | null;
  /** `null` for `removed-upstream` and `unavailable`. */
  upstreamSha256: string | null;
  /** Exact pristine ancestor hash from the v3 receipt. */
  baseSha256: string | null;
  /** Current sidecar hash, so corrupt/missing bases cannot produce a preview. */
  baseCurrentSha256: string | null;
  change: FileChange;
  /** What default update proposes for this destination. */
  outcome:
    | "unchanged"
    | "local-only"
    | "upstream-only"
    | "merged"
    | "conflict"
    | "missing-local"
    | "removed-upstream"
    | "added-upstream"
    | "unavailable";
  /** The three independently meaningful comparisons. All are null under --stat. */
  patches: {
    baseToLocal: string | null;
    baseToIncoming: string | null;
    localToResult: string | null;
  };
}

export interface DiffItem {
  id: CanonicalId;
  registry: string | null;
  /** REDACTED. */
  sourceUrl: string;
  files: DiffFile[];
}

/** The theme's own three-way state. `upstreamSha256` is `plan.theme.sha256` —
 *  the FOLD of the current fragments over the current base, not a registry
 *  file, because the theme is composed rather than copied (D5/D7). */
export interface DiffTheme extends HashPair {
  destination: string;
  receiptPath: ReceiptPath;
  upstreamSha256: string | null;
  change: FileChange;
  patch: string | null;
}

export interface DiffStyles extends HashPair {
  destination: string;
  receiptPath: ReceiptPath;
  upstreamSha256: string | null;
  change: FileChange;
  patch: string | null;
}

export interface DiffResult {
  root: string;
  /** Sorted by id. */
  items: DiffItem[];
  theme: DiffTheme | null;
  styles: DiffStyles | null;
  notes: InventoryNote[];
}

export type UpdateSkipReason =
  /** Not recorded in the receipt, so there is nothing to update. */
  | "not-installed"
  /** Named on the command line and its namespace is not configured. */
  | "unknown-namespace"
  /** Local adaptations exist, but upstream did not move; update preserved them. */
  | "local-only"
  /** No file needs a write and no local-only adaptation needs calling out. */
  | "up-to-date"
  /** Its registry could not be reached. */
  | "unavailable";

export interface UpdateSkip {
  id: CanonicalId;
  reason: UpdateSkipReason;
  /** A complete sentence. Never contains an expanded `${VAR}`. */
  detail: string;
}

/** A failure before or outside apply's returned `ApplyOutcome` contract. */
export type UpdateCommandFailureKind =
  | "receipt-unreadable"
  | "selection-failed"
  | "planning-failed"
  | "apply-failed"
  | "verification-failed"
  | "setup-failed";

export interface UpdateCommandFailure {
  kind: UpdateCommandFailureKind;
  message: string;
  /** Absolute internally; machine projection makes these root-relative. */
  paths?: string[];
}

/**
 * `manteen update`.
 *
 * A discriminated union rather than a pair of nullable fields, because two of
 * the four combinations those would allow are unreachable and each of the four
 * commands would guess a different invariant about which.
 *
 * SETTLED (roadmap, "Decisions taken"): update re-merges the theme DIRECTLY, with
 * no confirmation diff. `mergeThemeSource` is idempotent and keeps existing
 * values on conflict, and the receipt records pre-update hashes, so the
 * operation is recoverable. `manteen diff` is the command for looking first.
 */
export type UpdateResult =
  | { kind: "nothing-to-do"; selected: readonly []; skipped: UpdateSkip[]; notes: InventoryNote[] }
  | {
      /** The command could not safely reach or complete a returned apply outcome. */
      kind: "failed";
      failure: UpdateCommandFailure;
      /** Conservative for unexpected apply/verification throws. */
      mutated: boolean;
      selected: CanonicalId[];
      skipped: UpdateSkip[];
      notes: InventoryNote[];
    }
  | {
      kind: "refused";
      /** Carries the blocking diagnostics; the renderer prints `plan.diagnostics`
       *  exactly as `add` does. */
      plan: Plan;
      selected: CanonicalId[];
      skipped: UpdateSkip[];
      notes: InventoryNote[];
    }
  | {
      /** The apply stage was entered. Inspect `outcome` for whether it previewed,
       *  completed, failed before writes, rolled back, or could not roll back. */
      kind: "attempted";
      plan: Plan;
      outcome: ApplyOutcome;
      /** Post-apply project checks. Never part of ApplyOutcome or its journal. */
      verification: VerificationOutcome;
      selected: CanonicalId[];
      skipped: UpdateSkip[];
      notes: InventoryNote[];
    };
