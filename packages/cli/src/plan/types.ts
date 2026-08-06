/**
 * The plan/apply contract — the sole declaration site for every cross-stage type.
 *
 * Nothing here is implementation. Six modules' worth of code is written against
 * this file, so a type that is missing or wrong is not a local problem; it is a
 * blocked phase. Read the layering before changing anything:
 *
 *   ResolvedGraph   <- resolve(), which touches NO filesystem and NO network
 *   Plan            <- ResolvedGraph + everything that required reading disk
 *   ApplyOutcome    <- apply(), the only stage that writes
 *
 * `ResolvedFile` vs `PlannedFile` makes that boundary structural rather than
 * conventional: a resolved file cannot carry `sha256`, `existing` or
 * `disposition`, because computing any of them means reading the filesystem and
 * `resolve()` is not allowed to. If you find yourself wanting one of those three
 * inside the resolver, the layering is telling you the check belongs in a gate.
 */
import type { MergeConflict } from "manteen-kit";
import type { PackageManagerName } from "nypm";

import type { LoadedConfig } from "../config/types";

/** Re-exported so consumers of the contract need only one import. */
export type { MergeConflict };

export type CanonicalId = string; // "@house/data-table" | "url:https://x/r/a.json"
export type Severity = "error" | "warn" | "info";

export type DiagnosticCode =
  | "unknown-namespace"
  | "missing-env"
  | "fetch-failed"
  | "wire-invalid"
  | "file-no-content"
  | "css-unsupported"
  | "css-dependency-missing"
  | "meta-invalid-requires"
  | "meta-degraded"
  | "target-collision"
  | "target-escapes-root"
  | "target-reserved"
  | "target-refused-type"
  | "resolution-applied"
  | "dependency-cycle"
  | "bare-dep-assumed-local"
  | "bare-dep-unresolvable"
  | "name-mismatch"
  | "dependency-range-conflict"
  | "dependency-range-narrowed"
  | "mantine-version-mismatch"
  | "mantine-version-unknown"
  | "mantine-malformed-metadata"
  | "provider-missing"
  | "styles-api"
  | "theme-base-unmergeable"
  | "theme-conflict"
  | "destination-exists"
  | "no-package-manager"
  | "depth-exceeded"
  | "node-limit"
  | "response-too-large"
  // ---- beyond §1's list, kept contiguous so the §1 block stays auditable ----
  // Install receipt (§5a). Cross-RUN ownership; `target-collision` is the
  // in-run case.
  | "receipt-collision"
  | "receipt-stale"
  | "receipt-unreadable"
  | "receipt-drift"
  | "merge-base-unreadable"
  | "update-conflict"
  /**
   * §5a resolution 4: the version gate reads `@mantine/core` ONLY, so a
   * `@mantine/hooks@^9` sitting on a mismatched major would otherwise pass in
   * silence. This fires from the dependency union rather than the version gate
   * — the gate has no installed version for a non-core package to compare
   * against — and it warns rather than refuses, because the range it doubts is
   * a registry author's declaration about a package we do not gate.
   */
  | "mantine-non-core-unsatisfied"
  // ---- W6 init ------------------------------------------------------------
  // Detection/config problems exit 2; transform refusals exit 1. None are
  // forceable: a flag cannot make an ambiguous framework or an unsafe source
  // rewrite deterministic.
  | "init-framework-unrecognized"
  | "init-framework-ambiguous"
  | "init-framework-mismatch"
  | "init-config-conflict"
  | "init-source-unsupported"
  | "init-postcss-unsupported"
  | "init-path-escapes-root"
  // ---- Wc managed global styles -------------------------------------------
  | "global-styles-unconfigured"
  | "global-styles-uninitialized"
  | "global-styles-drift"
  /**
   * §6: content ships verbatim and manteen never transpiles, so a project with
   * only `jsconfig.json` (no `tsconfig.json`) cannot receive an item that ships
   * `.ts`/`.tsx` — there is no real tsconfig for the written syntax to resolve
   * against. Conditioned on the ref, not the project alone, which is why it
   * fires in `plan()` rather than at config load (`LoadedConfig.jsconfigOnly`
   * is set at load; this code is emitted only once a planned item's files are
   * known).
   */
  | "jsconfig-typescript-unsupported";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string; // rendered text; never contains an expanded secret
  items?: CanonicalId[]; // who this is about
  path?: string; // destination or config path, when relevant
  forceable: boolean; // whether --force may downgrade error -> warn
}

// ---- ports -----------------------------------------------------------------

export interface ItemRequest {
  id: CanonicalId;
  url: string; // expanded — never stored on the Plan
  redactedUrl: string; // ${VAR} left literal — this is what the Plan stores
  headers: Record<string, string>; // expanded — never stored on the Plan
}

export type LoadedDoc =
  | { ok: true; doc: unknown; redactedUrl: string }
  | {
      ok: false;
      reason: "network" | "status" | "not-json" | "too-large";
      status?: number;
      redactedUrl: string;
      detail?: string;
    };

export type ItemLoader = (req: ItemRequest) => Promise<LoadedDoc>;

export type TargetResolver = (
  file: { path: string; type: string; target?: string },
  item: { id: CanonicalId; namespace: string | null },
) => { destination: string } | { refused: DiagnosticCode; detail: string };

export interface ResolvePorts {
  load: ItemLoader;
  target: TargetResolver;
  env: Record<string, string | undefined>;
}

// ---- resolve ---------------------------------------------------------------
// Everything below is producible without reading a byte off disk.

/**
 * A file the resolver has placed but not yet inspected on disk.
 *
 * `content` is shipped verbatim and is never transformed — several decisions
 * (D4, D5, the "we never rewrite content" line in §6) rest on that.
 */
export interface ResolvedFile {
  itemId: CanonicalId;
  sourcePath: string; // files[].path, verbatim from the wire item
  wireType: string; // "registry:ui" | ...
  destination: string; // ABSOLUTE, proven inside root
  content: string;
}

export interface ResolvedItem {
  id: CanonicalId;
  namespace: string | null;
  name: string;
  wireType: string;
  sourceUrl: string; // REDACTED
  requestedBy: (CanonicalId | "<root>")[];
  dependsOn: CanonicalId[];
  requires?: string; // meta.mantine.requires, only when validRange
  provider?: string; // meta.mantine.provider identifier
  stylesApi?: Record<string, string[]>;
  cssImports: string[];
  files: ResolvedFile[]; // theme-destination files are NOT here (D5)
}

/**
 * One contribution to the folded theme, in fold order.
 *
 * Two sources produce these and D6 interleaves them into a single sequence:
 * a planned file whose destination equals the resolved `config.theme` (absorbed
 * out of the write list, `kind: "absorbed-file"`), and `meta.mantine.themeFragment`
 * (`kind: "meta-fragment"`). `path` is the source path for reporting, never a
 * destination — nothing is written at it.
 */
export type ThemeSourceKind = "absorbed-file" | "meta-fragment";

export interface ThemeFragment {
  itemId: CanonicalId;
  kind: ThemeSourceKind;
  path: string;
  content: string;
}

/**
 * The resolver's whole output. Gates consume this — never a `Plan` — which is
 * what keeps them off the filesystem. Anything a gate needs that requires disk
 * (the installed Mantine version, existing-destination hashes, the receipt
 * index) arrives as a separate parameter.
 */
export interface ResolvedGraph {
  root: string; // absolute project root = dirname(manteen.json)
  configPath: string;
  items: ResolvedItem[]; // topologically sorted, lexicographic tiebreak
  files: ResolvedFile[]; // flattened in item order — the write list
  dependencies: PlannedDependency[];
  themeFragments: ThemeFragment[]; // fold order; empty when nothing contributes
  diagnostics: Diagnostic[];
}

// ---- plan ------------------------------------------------------------------

/**
 * What plan() PREDICTS will happen at a destination.
 *
 * Deliberately not the same type as `WriteResult`, which is what apply()
 * OBSERVED. A predicted `overwrite` becomes an observed `skipped` whenever the
 * user declines, and conflating the two is how a receipt comes to claim a file
 * manteen never wrote.
 */
export type Disposition = "create" | "overwrite" | "identical";

export interface PlannedFile extends ResolvedFile {
  /** Of the final destination text this plan will accept/write. Under `add`
   *  this equals the pristine upstream hash; under `update` it may be the hash
   *  of a conflict-free merged result. */
  sha256: string;
  /** The pristine registry bytes that become the next three-way ancestor. */
  upstream: { content: string; sha256: string };
  /** The committed sidecar that stores `upstream` outside the JSON receipt. */
  base: PlannedBase;
  existing: { sha256: string } | null; // pre-image hash, for TOCTOU + disposition
  disposition: Disposition;
  /**
   * Who the receipt says owns this destination; null when unowned, when there
   * is no receipt, or when the receipt was unreadable. Feeds the overwrite
   * prompt's attribution.
   *
   * `existing.sha256 !== priorOwner.installedSha256` is the drift test — deliberately
   * NOT stored as a precomputed boolean, so the two hashes cannot drift apart
   * from a cached verdict.
   */
  priorOwner: ReceiptOwnerRef | null;
}

export interface PlannedBase {
  destination: string; // ABSOLUTE, under `<root>/.manteen/bases/`
  content: string; // exact pristine upstream bytes
  sha256: string;
  /** Pre-image hash for apply preflight and journal decisions. */
  existing: { sha256: string } | null;
}

export interface PlannedDependency {
  name: string; // "@mantine/core"
  range: string; // "^9"
  dev: boolean;
  wantedBy: CanonicalId[];
}

export interface PlannedTheme {
  destination: string; // ABSOLUTE = resolved config.theme
  base: { sha256: string } | null; // null when the file does not exist yet
  text: string; // FINAL folded text — apply writes exactly this
  sha256: string;
  changed: boolean; // false => apply skips phase 4 entirely
  added: string[];
  importsAdded: string[];
  conflicts: MergeConflict[]; // re-exported from manteen-kit
  sources: { itemId: CanonicalId; kind: ThemeSourceKind; path: string }[]; // fold order
}

export interface PlannedStyleSource {
  itemId: CanonicalId;
  /** Canonical ids this item declared; only installed style sources affect order. */
  dependsOn: CanonicalId[];
  /** Package stylesheet specifiers, in author order. */
  imports: string[];
}

export interface PlannedStyles {
  destination: string; // ABSOLUTE = resolved config.styles
  base: { sha256: string } | null;
  text: string; // FINAL generated bytes
  sha256: string;
  changed: boolean;
  /** CUMULATIVE final sources, dependency-first then canonical id. */
  sources: PlannedStyleSource[];
}

export type MantineInstall =
  | { state: "found"; version: string; from: string }
  | { state: "not-installed" }
  | { state: "no-node-modules" }
  | { state: "undeterminable"; reason: "pnp" | "no-version" | "unparseable"; marker?: string };

/**
 * `ResolvedItem` with its files upgraded. Spelled out rather than written as
 * `Omit<ResolvedItem, "files">` — this is the item shape every reporter, gate
 * and apply phase reads, and an `Omit` hides the field list from the people who
 * need it most. Keep the two in step: the only difference is `files`.
 */
export interface PlanItem {
  id: CanonicalId;
  namespace: string | null;
  name: string;
  wireType: string;
  sourceUrl: string; // REDACTED
  requestedBy: (CanonicalId | "<root>")[];
  dependsOn: CanonicalId[];
  requires?: string; // meta.mantine.requires, only when validRange
  provider?: string; // meta.mantine.provider identifier
  stylesApi?: Record<string, string[]>;
  cssImports: string[];
  files: PlannedFile[]; // theme-destination files are NOT here (D5)
}

export interface Plan {
  version: 1;
  /** The write semantics used to construct every `PlannedFile`. */
  operation: "add" | "update";
  root: string; // absolute project root = dirname(manteen.json)
  configPath: string;
  items: PlanItem[]; // topologically sorted, lexicographic tiebreak
  files: PlannedFile[]; // flattened in item order — the write list
  /** Obsolete sidecars dropped only by add's historical item-replacement path. */
  removedBases: PlannedBaseRemoval[];
  dependencies: PlannedDependency[];
  packageManager: PackageManagerName; // from nypm, resolved at plan time
  installCommand: string | null; // exactly what apply will run, corepack prefix included
  theme: PlannedTheme | null;
  styles: PlannedStyles | null;
  mantine: MantineInstall;
  /** Read once in plan(); apply() re-reads only to hash-verify in preflight. */
  receipt: ReceiptState;
  diagnostics: Diagnostic[];
  ok: boolean; // see the refusal contract in §1
}

export interface PlannedBaseRemoval {
  destination: string; // ABSOLUTE, under `<root>/.manteen/bases/`
  existing: { sha256: string } | null;
}

export interface PlanOptions {
  force?: boolean;
  overwrite?: boolean | "no";
  interactive: boolean;
  /** `--pm`. D15: detection runs in plan(), and `undefined` reaching nypm's
   *  command builder yields an unrunnable string, so the override is resolved
   *  here rather than at install time. */
  packageManager?: PackageManagerName;
  /** `add` keeps the ordinary overwrite surface; `update` computes from the
   *  recorded pristine base. Defaulted to add for programmatic callers. */
  operation?: "add" | "update";
  /** Update-only explicit destructive mode. Never inferred from `--yes`. */
  takeUpstream?: boolean;
}

// ---- apply -----------------------------------------------------------------

/**
 * What apply actually DID at one destination.
 *
 * `identical` means zero bytes moved AND the on-disk content already equals
 * `PlannedFile.content` — so it DOES transfer ownership; an all-identical run
 * is precisely the run that most needs to record one. `skipped` means the user
 * declined the overwrite (prompt "no" or `--no-overwrite`) — it does NOT.
 */
export type WriteResult = "written" | "identical" | "skipped";

export interface ApplyOptions {
  interactive: boolean;
  overwrite?: boolean | "no";
  /** D19: run plan() plus apply's read-only phases 0 and 1, then stop before
   *  phase 2. Never reaches the receipt write. */
  dryRun?: boolean;
}

/**
 * Why apply() stopped. This is a channel of its own, NOT a `Diagnostic[]`, on
 * purpose: an apply-preflight refusal has no `DiagnosticCode` and must not
 * acquire one. §1's enum names plan-stage verdicts; inventing a code for the
 * TOCTOU refusal would put an apply-only concept into the refusal table.
 */
export type ApplyFailureKind =
  /** A planned destination — or manteen.lock.json, in either direction of its
   *  presence — changed between plan() and apply(). The remedy is to re-run. */
  | "stale-plan"
  /** A write failed; the journal unwound and the tree is back to its pre-images. */
  | "write-failed"
  /** The unwind itself failed. The tree may be inconsistent; the message points
   *  at `git checkout -- <paths>`. */
  | "rollback-failed"
  /** Phase 2 failed. Deliberately not rolled back (D18), and nothing was written. */
  | "install-failed";

export interface ApplyFailure {
  kind: ApplyFailureKind;
  message: string;
  paths?: string[];
}

export interface ApplyOutcome {
  ok: boolean;
  /** User declined at a prompt. Zero mutation, exit 130. */
  cancelled: boolean;
  dryRun: boolean;
  /** One entry per planned destination, in write-list order. */
  files: { destination: string; result: WriteResult }[];
  dependencies: { installed: boolean; command: string | null };
  theme: { path: string; written: boolean } | null;
  styles: { path: string; written: boolean } | null;
  receipt: { path: string; written: boolean };
  /** Whether this successful run changed the receipt or a pristine-base
   *  sidecar. False for previews and every unsuccessful outcome. Callers use
   *  this observed fact to remind users to version the two together. */
  updateState: { changed: boolean };
  failure: ApplyFailure | null;
}

/**
 * The two stage signatures, as callable types rather than `declare function`.
 *
 * A `declare function` here would announce a runtime export this module does not
 * have, and `src/index.ts`'s re-export would hand callers `undefined`. The
 * implementations live in `plan/index.ts` and `apply/index.ts` and should be
 * written `satisfies PlanFn` / `satisfies ApplyFn`.
 */
export type PlanFn = (config: LoadedConfig, refs: string[], options: PlanOptions) => Promise<Plan>;

export type ApplyFn = (plan: Plan, options: ApplyOptions) => Promise<ApplyOutcome>;

// ---- install receipt (manteen.lock.json) -----------------------------------
// Records item -> registry -> destination -> content hash so a destination owned
// by one registry is not silently replaced by a same-named item from another on
// a LATER run. D8's in-run check closes that within one command only.
//
// Hash domain, because the asymmetry is real and a false drift verdict on
// Windows is how it gets discovered: receipt file hashes encode STRINGS as
// UTF-8, while `ReceiptState.sha256` and `PlannedFile.existing` hash RAW FILE
// BYTES. They compare equal only because writes use explicit UTF-8 with no BOM
// or newline translation.

export const RECEIPT_FILENAME = "manteen.lock.json";
export const RECEIPT_VERSION = 3;

/** POSIX, relative to `Plan.root`. Never absolute, never contains a `..` segment. */
export type ReceiptPath = string;

export interface ReceiptFile {
  destination: ReceiptPath;
  wireType: string;
  /** Of the destination result accepted by the last successful run. */
  installedSha256: string;
  /** Of the exact pristine upstream bytes stored in the derived base sidecar. */
  baseSha256: string;
}

export interface ReceiptItem {
  id: CanonicalId;
  /** Exactly `PlanItem.namespace`; null for a bare `url:` ref, which has no
   *  namespace. Reporters print `registry ?? sourceUrl` so two colliding url
   *  refs stay distinguishable. Named `registry` because that is the word §5a
   *  and every diagnostic use; it is not a second concept. */
  registry: string | null;
  /** REDACTED — `${VAR}` left literal. This file is committed; an expanded
   *  token must never reach it. Same rule as `PlanItem.sourceUrl`. */
  sourceUrl: string;
  wireType: string;
  /** Appeared as a root ref in some run. Sticky across refreshes
   *  (`prior.direct || incoming.direct`) because a transitive re-reach must not
   *  demote a user's explicit install. A future `manteen remove` clears it. */
  direct: boolean;
  /** Sorted by destination. The resolved theme destination NEVER appears here:
   *  a theme file is folded, not owned (D5). */
  files: ReceiptFile[];
}

export interface ReceiptTheme {
  destination: ReceiptPath;
  /** Of the folded text apply wrote, or of the unchanged base when
   *  `plan.theme.changed === false`. */
  sha256: string;
  /** CUMULATIVE across runs, in fold order, deduped on (itemId, path).
   *  `plan.theme.sources` lists only the current run's contributions, so
   *  replacing this wholesale would erase earlier provenance. */
  sources: { itemId: CanonicalId; kind: ThemeSourceKind; path: string }[];
}

export interface ReceiptStyles {
  destination: ReceiptPath;
  sha256: string;
  sources: PlannedStyleSource[];
}

export interface Receipt {
  /** Allowed so a user can wire up editor completion. Never emitted by us;
   *  preserved verbatim when already present, so it does not churn each run. */
  $schema?: string;
  lockfileVersion: typeof RECEIPT_VERSION;
  items: ReceiptItem[]; // sorted by id
  theme: ReceiptTheme | null;
  styles: ReceiptStyles | null;
}

export type ReceiptUnreadable =
  | "unparseable"
  | "invalid"
  | "unsupported-version"
  | "future-version";

/**
 * `sha256` is of the RAW BYTES on disk. Apply's preflight re-reads and compares
 * it — the same TOCTOU defence every planned destination gets. `raw` is the
 * pre-image the journal records and the text phase 7 compares against for the
 * byte-equality skip.
 */
export type ReceiptState =
  | { present: false; path: string }
  | { present: true; ok: true; path: string; sha256: string; raw: string; receipt: Receipt }
  | {
      present: true;
      ok: false;
      path: string;
      sha256: string;
      raw: string;
      reason: ReceiptUnreadable;
      detail: string;
      sawVersion?: number;
    };

export interface ReceiptOwnerRef {
  itemId: CanonicalId;
  registry: string | null;
  /** Result accepted by the last successful run. */
  installedSha256: string;
  /** Pristine upstream ancestor stored in the base sidecar. */
  baseSha256: string;
}

/** Key is the ABSOLUTE destination, so it joins directly against `PlannedFile`. */
export type ReceiptIndex = ReadonlyMap<string, ReceiptOwnerRef>;

/**
 * Absolute destination -> sha256 of the bytes on disk, or `null` when the file
 * does not exist.
 *
 * `null`, NEVER `undefined`. plan/index.ts hashes every planned destination in
 * one pass and hands the same map to three consumers (`PlannedFile.existing`,
 * the disposition computation, and `gates/receipt.ts`), so every key a consumer
 * looks up is present. An `undefined` read means the caller was handed a map
 * built from a different destination list — and it inverts the receipt gate's
 * "file is gone" branch into "file is present with hash undefined".
 */
export type ExistingHashes = ReadonlyMap<string, string | null>;
