/**
 * `manteen diff` — what changed since install, in BOTH directions.
 *
 * Three hashes per destination, not two:
 *
 *   recorded   `manteen.lock.json` — what manteen wrote
 *   current    the bytes on disk now
 *   upstream   what the registry serves today
 *
 * "The file changed" is four situations with four different remedies
 * (`FileChange` in `inventory/types.ts` names all eight states), and an
 * installer that collapses them tells a user with a deliberate local edit the
 * same thing it tells a user who is simply behind. Distinguishing them is the
 * entire reason this command exists.
 *
 * REPORTS, NEVER JUDGES. `runDiff` returns 0 whether or not there are
 * differences, whether or not the receipt is missing, and whether or not
 * `plan.ok` is false — `plan.ok` is never read. A difference is the ANSWER to
 * `diff`, not a failure of it, and a non-zero exit here would make the command
 * unusable in the shell pipelines people put a diff in. The other two exit
 * codes stay the integrator's: 2 for a config failure before this is called,
 * and 1 for a throw (see "Throws" below).
 *
 * WRITES NOTHING, and cannot: the only `node:fs` call in this file is
 * `readFileSync`. `packages/cli/test/diff.test.ts` proves it with a hash
 * manifest over the whole fixture tree.
 *
 * ---
 *
 * **Upstream arrives through `plan()`, and that is the contract's own design.**
 * `DiffTheme.upstreamSha256` is documented as `plan.theme.sha256` — the FOLD of
 * the current fragments over the current base — which is only obtainable from a
 * plan. Going through `plan()` also means diff resolves refs, expands `${VAR}`,
 * picks a loader and validates wire items through exactly one implementation
 * rather than a second one that would eventually disagree with `add`.
 *
 * `apply()` is never called and never imported. Nothing here mutates.
 *
 * SECRETS: this module performs no env expansion and touches no expanded URL.
 * `plan()` owns that boundary and hands back only redacted `sourceUrl`s; the
 * index reader (`inventory/available.ts`), which is the one place an expanded
 * `IndexRequest.url` exists, is deliberately NOT imported — `diff` has no use
 * for an index. The expanded-secret surface of this file is exactly zero.
 *
 * Throws: nothing of its own. `plan()`'s throws and the snapshot's non-ENOENT
 * read errors (EACCES, EISDIR — `installed.ts` documents why a read-only command
 * must not swallow them) propagate to the shell, which prints them and exits 1
 * the same way `add` does.
 */
import type { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createPatch } from "diff";

import type { Streams } from "../cli/render";
import {
  loadProjectConfig,
  PROCESS_STREAMS,
  renderDiagnostic,
  renderJson,
  renderNotes,
  renderThrown,
  sortNotes,
} from "../cli/render";
import type { LoadedConfig } from "../config/types";
import type { FileHasher } from "../inventory/installed";
import { fromReceiptState, localStatus, ownerLabel } from "../inventory/installed";
import type {
  DiffFile,
  DiffItem,
  DiffResult,
  DiffStyles,
  DiffTheme,
  FileChange,
  Installed,
  InstalledItem,
  InventoryNote,
  LocalStatus,
} from "../inventory/types";
import { plan as planUpstream } from "../plan/index";
import { parseRef } from "../plan/ref";
import type {
  CanonicalId,
  Diagnostic,
  Plan,
  PlanFn,
  PlanItem,
  PlannedFile,
  PlannedTheme,
  ReceiptState,
} from "../plan/types";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { toReceiptPath } from "../receipt/path";
import { readReceipt } from "../receipt/read";

/** `reportDiff` completes or throws; there is no refusal it can compute. The
 *  shell at the bottom of this file owns the other two codes. */
const EXIT_OK = 0;
const EXIT_REFUSED = 1;

// ---- ports ------------------------------------------------------------------

/**
 * One file's bytes, or `null` when it does not exist.
 *
 * **MUST THROW for any read failure that is not ENOENT**, the same rule
 * `FileHasher` states at its own declaration. An EACCES answered as `null` reads
 * as "the file is gone", and a `diff` that reports a deletion that did not
 * happen is a lie a user acts on.
 */
export type ByteReader = (absolutePath: string) => Buffer | null;

/**
 * The hash AND the text of a destination, from ONE read.
 *
 * The natural spelling — hash the file, then read it again for the patch — is
 * the TOCTOU hole `plan/index.ts`'s `readThemeBase` documents: the two reads can
 * see different bytes, and the report would then classify a file from one
 * version while printing a patch of another. Reading once and deriving both is
 * what makes the verdict and the patch describe the same content.
 *
 * The two fields also live in DIFFERENT HASH DOMAINS on purpose, matching the
 * rest of the codebase: `sha256` is of the RAW BYTES (the domain
 * `ReceiptState.sha256`, `PlannedFile.existing` and `HashPair.currentSha256`
 * all use), while `text` is the UTF-8 decoding the patch renderer needs.
 * Hashing the decoded string instead would agree on every ASCII fixture and
 * diverge only on a file with a BOM — i.e. it would ship green.
 *
 * Cached per absolute path, so the receipt's hash pass and the patch renderer
 * cannot disagree and no destination is read twice.
 */
export interface FileSnapshot {
  /** Satisfies `FileHasher`, so it can be handed straight to `fromReceiptState`. */
  hash: FileHasher;
  text: (absolutePath: string) => string | null;
}

export function createFileSnapshot(read: ByteReader = readBytes): FileSnapshot {
  const seen = new Map<string, { sha256: string; text: string } | null>();

  const load = (absolutePath: string): { sha256: string; text: string } | null => {
    const cached = seen.get(absolutePath);
    if (cached !== undefined) return cached;

    const bytes = read(absolutePath);
    const entry =
      bytes === null
        ? null
        : {
            sha256: createHash("sha256").update(bytes).digest("hex"),
            text: bytes.toString("utf8"),
          };
    seen.set(absolutePath, entry);
    return entry;
  };

  return {
    hash: (absolutePath) => load(absolutePath)?.sha256 ?? null,
    text: (absolutePath) => load(absolutePath)?.text ?? null,
  };
}

/** ENOENT and only ENOENT becomes absence. See `ByteReader`. */
function readBytes(absolutePath: string): Buffer | null {
  try {
    return readFileSync(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Every I/O touch, as a parameter — `diff` is testable with no network and no
 * filesystem.
 *
 * `renderDiagnostic` has NO default on purpose. `plan()`'s diagnostics are the
 * only channel that can explain why an item came back `unavailable`
 * (`fetch-failed`) or why a file reads as `removed-upstream`
 * (`target-refused-type`), so they have to be printed — but the renderer for
 * them already exists in `cli/index.ts`, which cannot be imported (it has a
 * shebang and runs a program on import). Writing a second one here is exactly
 * the duplication that makes two commands' output drift apart, so the shell
 * passes its own in.
 */
export interface DiffPorts {
  /** `plan` from `plan/index.ts`. Injected so a test needs no network. */
  plan: PlanFn;
  /** Selection-only receipt read; see `runDiff`. */
  readReceiptState: (root: string) => ReceiptState;
  snapshot: FileSnapshot;
  renderDiagnostic: (diagnostic: Diagnostic, root: string) => string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

export type DiagnosticRenderer = DiffPorts["renderDiagnostic"];

/**
 * Production wiring. `renderDiagnostic` is the shell's, for the reason above.
 *
 * Impure only in that it constructs the real reader and the real snapshot;
 * neither reads anything until it is called.
 */
export function createDiffPorts(renderDiagnostic: DiagnosticRenderer): DiffPorts {
  const read = createReceiptReader();
  const validate = createReceiptValidator();
  return {
    plan: planUpstream,
    readReceiptState: (root) => readReceipt(root, read, validate),
    snapshot: createFileSnapshot(),
    renderDiagnostic,
    stdout: (chunk) => process.stdout.write(chunk),
    stderr: (chunk) => process.stderr.write(chunk),
  };
}

// ---- options ----------------------------------------------------------------

export interface DiffOptions {
  /**
   * Item ids to compare. EMPTY means every installed item — `diff` is a report,
   * so it defaults to the whole receipt rather than to the direct set the way
   * `update` does.
   */
  refs: readonly string[];
  /** Emit the `DiffResult` as JSON on stdout instead of the human report. */
  json?: boolean;
  /** Summary only: no `patch` is computed, which is the case
   *  `DiffFile.patch`'s docblock anticipates. */
  stat?: boolean;
}

// ---- the command ------------------------------------------------------------

/**
 * Compare, report, exit 0. THE CORE — `runDiff` at the bottom of this file is
 * the shell that loads config, wires the real ports and calls this.
 *
 * Takes a `LoadedConfig` rather than a directory: config loading and the
 * renderer for a config failure belong to `cli/render.ts`, and duplicating
 * either here would give the shell two ways to fail at exit 2. Same signature
 * shape as `plan()` for that reason.
 *
 * TWO RECEIPT READS, deliberately, and only one of them reaches the output.
 * `plan()` needs to be told WHICH items to fetch, and that list comes from the
 * receipt — so the receipt has to be read before `plan()` can run. That read
 * (`ports.readReceiptState`) is used for ref selection and for nothing else: no
 * hash, no row and no note is derived from it. Everything in the report comes
 * from `fromReceiptState(plan.receipt, …)`, which is the read `plan()` gated on
 * — the rule `inventory/installed.ts` states for any command holding a `Plan`.
 * A reviewer looking for the divergence hazard that docblock warns about will
 * find the answer here: the inventory has exactly one source.
 *
 * Passing every installed id as a ROOT ref distorts `requestedBy` (everything
 * reads as `<root>`) and `direct`. Both are inert: this plan is used as a read
 * of what upstream currently serves and is never applied, and the receipt is
 * never rewritten from it.
 */
export async function reportDiff(
  config: LoadedConfig,
  options: DiffOptions,
  ports: DiffPorts,
): Promise<number> {
  const root = config.root;
  const selection = select(config, ports.readReceiptState(root), options.refs);

  /**
   * `overwrite: true` is inert except for the one thing it is here for: without
   * it, `checkDestinations` emits a `destination-exists` error for every file
   * that differs from what upstream serves — which is precisely the set `diff`
   * exists to list, so the report would arrive buried in refusals about a write
   * that is never going to happen. `plan.ok` is not read.
   *
   * It does NOT suppress `directoryAtDestination`, and that is correct: a
   * directory sitting at a destination is a real thing the user needs to know
   * about, and it is emitted from the hash pass rather than from
   * `checkDestinations`.
   */
  const planned = await ports.plan(config, [...selection.ids], {
    interactive: false,
    overwrite: true,
  });

  const result = buildDiff({
    plan: planned,
    scope: selection.scope,
    snapshot: ports.snapshot,
    patches: options.stat !== true,
    notes: selection.notes,
  });

  const explaining = planned.diagnostics.filter((diagnostic) => diagnostic.severity !== "info");

  if (options.json === true) {
    // ONE document, and stderr stays empty. Notes AND diagnostics both travel
    // inside it — the `JsonEnvelope` rule. `DiffResult` has no `diagnostics`
    // field (`inventory/types.ts` is frozen), but the DOCUMENT is not a
    // `DiffResult`: it already carries the three envelope keys, and dropping
    // the diagnostics would leave a consumer with an `unavailable` item and no
    // way to learn it was a `fetch-failed`.
    ports.stdout(renderDiffJson(result, explaining));
    return EXIT_OK;
  }

  /**
   * Diagnostics first and on stderr: they explain the rows that follow, and
   * keeping stdout to the report alone is what lets `manteen diff` be piped.
   *
   * `info` is dropped, and only `info`. Errors and warnings are the only
   * channel that can say WHY an item came back `unavailable` (`fetch-failed`)
   * or why a file the item still ships reads as `removed-upstream`
   * (`target-refused-type`) — a report without them makes the user guess. An
   * `info` says what a component OFFERS (`styles-api` fires once per item that
   * declares selectors), which is `info`'s job and is noise on a command run to
   * see what moved. Filtering by severity is not judging the result: `plan.ok`
   * is still never read and the exit code is still 0.
   */
  for (const diagnostic of explaining) {
    ports.stderr(ports.renderDiagnostic(diagnostic, planned.root));
  }
  ports.stderr(renderNotes(result.notes));
  ports.stdout(renderDiff(result));

  return EXIT_OK;
}

// ---- selection ---------------------------------------------------------------

interface Selection {
  /** Refs handed to `plan()`. Sorted, deduped, and never containing an item
   *  whose namespace `manteen.json` no longer configures. */
  ids: CanonicalId[];
  /** Which installed items appear in the report. `null` = all of them. */
  scope: ReadonlySet<CanonicalId> | null;
  notes: InventoryNote[];
}

/**
 * Which installed items to compare, and why the others were dropped.
 *
 * Selection happens BEFORE `plan()` so that `manteen diff @house/never-installed`
 * emits the `not-installed` note the contract provides instead of fetching the
 * item and reporting every file as `added-upstream`. The consequence is worth
 * stating: after this filter, a plan item that is not in the receipt can only be
 * a NEW TRANSITIVE DEPENDENCY, so `added-upstream` has one unambiguous meaning.
 *
 * An installed item whose namespace has since been removed from `manteen.json`
 * is kept in `scope` and left out of `ids`: it still has recorded files worth
 * reporting, and its upstream is genuinely unknowable, which is exactly
 * `unavailable`.
 */
function select(config: LoadedConfig, state: ReceiptState, refs: readonly string[]): Selection {
  const notes: InventoryNote[] = [];
  const recorded = new Map<CanonicalId, string | null>();
  if (state.present && state.ok) {
    for (const item of state.receipt.items) recorded.set(item.id, item.registry);
  }

  let scope: ReadonlySet<CanonicalId> | null = null;
  let wanted: CanonicalId[];

  if (refs.length === 0) {
    wanted = [...recorded.keys()];
  } else {
    const chosen = new Set<CanonicalId>();
    const seen = new Set<string>();
    for (const ref of refs) {
      // Deduped on the RAW argument as well as on the id: `diff x x` is a typo,
      // not a request for two reports, and a repeated bad name is reported once.
      if (seen.has(ref)) continue;
      seen.add(ref);

      const parsed = parseRef(ref);
      if (parsed.kind !== "namespaced" && parsed.kind !== "url") {
        // `parseRef` is the single detector of what `add` accepts, so a ref it
        // will not resolve is a ref that cannot name an installed item. There is
        // no `InventoryNoteCode` for "unqualified name" and inventing one means
        // editing a file this command does not own, so the code says what is
        // true (it is not installed) and the message says what to type.
        notes.push({
          code: "not-installed",
          message: `"${ref}" is not an item id. Name the item as it is recorded in manteen.lock.json, e.g. @house/data-table.`,
        });
        continue;
      }

      if (!recorded.has(parsed.id)) {
        notes.push({
          code: "not-installed",
          itemId: parsed.id,
          message: `${parsed.id} is not recorded in manteen.lock.json, so there is nothing to compare. Install it with \`manteen add ${parsed.id}\`.`,
        });
        continue;
      }
      chosen.add(parsed.id);
    }
    scope = chosen;
    wanted = [...chosen];
  }

  const ids: CanonicalId[] = [];
  for (const id of wanted) {
    const registry = recorded.get(id) ?? null;
    if (registry !== null && !config.registries.has(registry)) {
      const known = [...config.registries.keys()].sort();
      notes.push({
        code: "unknown-namespace",
        registry,
        itemId: id,
        message:
          known.length > 0
            ? `${id} was installed from ${registry}, which manteen.json no longer configures, so what the registry serves today cannot be read. Registered: ${known.join(", ")}.`
            : `${id} was installed from ${registry}, and manteen.json configures no registries, so what the registry serves today cannot be read.`,
      });
      continue;
    }
    ids.push(id);
  }

  return { ids: ids.sort(byCodeUnit), scope, notes };
}

// ---- the comparison -----------------------------------------------------------

export interface DiffInput {
  /** The plan built from the selection. Its `receipt` is the ONLY receipt the
   *  report is built from. */
  plan: Plan;
  scope: ReadonlySet<CanonicalId> | null;
  snapshot: FileSnapshot;
  /** False under `--stat`: every `patch` comes back `null`. */
  patches: boolean;
  notes: readonly InventoryNote[];
}

/**
 * The whole three-way join. Pure with respect to the filesystem — every read
 * goes through `snapshot`, which is a parameter.
 */
export function buildDiff(input: DiffInput): DiffResult {
  const { plan, scope, snapshot, patches } = input;
  const root = plan.root;

  const installed = fromReceiptState(plan.receipt, root, snapshot.hash);
  const upstream = new Map(plan.items.map((item) => [item.id, item]));
  const known = new Set(installed.items.map((item) => item.id));

  const items: DiffItem[] = [];

  for (const item of installed.items) {
    if (scope !== null && !scope.has(item.id)) continue;
    items.push(compareItem(item, upstream.get(item.id) ?? null, root, snapshot, patches));
  }

  // Plan items with no receipt record. After `select` these can only be new
  // transitive dependencies — something an item started depending on since it
  // was installed — and hiding them would make the report under-state what
  // `update` is about to do.
  for (const item of plan.items) {
    if (known.has(item.id)) continue;
    items.push(newItem(item, root, snapshot, patches));
  }

  /**
   * A selection that matched NO item asked about nothing, so the theme is not
   * reported at all.
   *
   * Without this, `manteen diff @house/never-installed` plans zero items, folds
   * zero fragments, and the theme comes back `unavailable` — a claim that we
   * tried to read its upstream and could not, when in fact nothing was asked.
   * Every other scoped run DOES report the theme, and should: the fold covers
   * exactly the named items' fragments, which is precisely "what would `update
   * <these>` do to my theme".
   */
  const asked = scope === null || scope.size > 0;

  return {
    root,
    items: items.sort((a, b) => byCodeUnit(a.id, b.id)),
    theme: asked ? compareTheme(installed, plan.theme, snapshot, patches) : null,
    styles: asked ? compareStyles(installed, plan.styles, snapshot, patches) : null,
    notes: sortNotes([...input.notes, ...installed.notes]),
  };
}

/** One installed item against what the registry serves for it now. */
function compareItem(
  item: InstalledItem,
  planned: PlanItem | null,
  root: string,
  snapshot: FileSnapshot,
  patches: boolean,
): DiffItem {
  // `null` means the item never made it into the graph this run — an unreachable
  // registry, an invalid document, a namespace no longer configured. Its files
  // get `unavailable` rather than `removed-upstream`, because "the registry
  // stopped shipping this file" and "we could not ask" are not the same answer.
  const available = planned !== null;
  const remaining = new Map((planned?.files ?? []).map((file) => [file.destination, file]));

  const files: DiffFile[] = [];
  for (const file of item.files) {
    const upstream = remaining.get(file.destination) ?? null;
    remaining.delete(file.destination);
    files.push(
      row({
        itemId: item.id,
        destination: file.destination,
        receiptPath: file.receiptPath,
        recordedSha256: file.recordedSha256,
        currentSha256: file.currentSha256,
        upstream,
        available,
        snapshot,
        patches,
      }),
    );
  }

  // Destinations the item ships now and the receipt has no record of. Joined
  // WITHIN the item rather than across the whole tree: `structuralProblem` and
  // `checkCollisions` each guarantee uniqueness on their own side, but a
  // destination recorded under one item and planned under another is a
  // `receipt-collision`, and folding those two into one row would invent an
  // itemId for it. Reported as a removal under the old owner and an addition
  // under the new one, which is what actually happened.
  for (const file of remaining.values()) {
    files.push(
      row({
        itemId: item.id,
        destination: file.destination,
        receiptPath: toReceiptPath(file.destination, root),
        recordedSha256: null,
        currentSha256: snapshot.hash(file.destination),
        upstream: file,
        available,
        snapshot,
        patches,
      }),
    );
  }

  return {
    id: item.id,
    registry: item.registry,
    sourceUrl: item.sourceUrl,
    files: files.sort((a, b) => byCodeUnit(a.receiptPath, b.receiptPath)),
  };
}

/** A plan item with no receipt record: every file is an addition. */
function newItem(item: PlanItem, root: string, snapshot: FileSnapshot, patches: boolean): DiffItem {
  const files = item.files.map((file) =>
    row({
      itemId: item.id,
      destination: file.destination,
      receiptPath: toReceiptPath(file.destination, root),
      recordedSha256: null,
      currentSha256: snapshot.hash(file.destination),
      upstream: file,
      available: true,
      snapshot,
      patches,
    }),
  );

  return {
    id: item.id,
    registry: item.namespace,
    sourceUrl: item.sourceUrl,
    files: files.sort((a, b) => byCodeUnit(a.receiptPath, b.receiptPath)),
  };
}

interface RowInput {
  itemId: CanonicalId;
  destination: string;
  receiptPath: string;
  recordedSha256: string | null;
  currentSha256: string | null;
  upstream: PlannedFile | null;
  available: boolean;
  snapshot: FileSnapshot;
  patches: boolean;
}

function row(input: RowInput): DiffFile {
  const change = classify(input);
  return {
    itemId: input.itemId,
    destination: input.destination,
    receiptPath: input.receiptPath,
    recordedSha256: input.recordedSha256,
    currentSha256: input.currentSha256,
    upstreamSha256: input.upstream?.sha256 ?? null,
    change,
    patch:
      input.patches && input.upstream !== null && PATCHABLE.has(change)
        ? filePatch(
            input.receiptPath,
            input.snapshot.text(input.destination) ?? "",
            input.upstream.content,
          )
        : null,
  };
}

/**
 * The eight states, in the one order that makes each of them true.
 *
 * `available` is tested first because an item we could not fetch tells us
 * nothing about upstream, and every later rung would otherwise read the absent
 * `upstream` as "the registry dropped this file".
 *
 * `removed-upstream` outranks `missing`: when the item no longer ships a file,
 * `update` cannot restore it, so reporting "missing — update restores it" would
 * promise something that will not happen.
 */
function classify(input: RowInput): FileChange {
  if (!input.available) return "unavailable";
  if (input.recordedSha256 === null) return "added-upstream";
  if (input.upstream === null) return "removed-upstream";
  if (input.currentSha256 === null) return "missing";

  const localChanged = input.currentSha256 !== input.recordedSha256;
  const upstreamChanged = input.upstream.sha256 !== input.recordedSha256;
  if (localChanged && upstreamChanged) return "both";
  if (localChanged) return "local-only";
  if (upstreamChanged) return "upstream-only";
  return "unchanged";
}

/** The states where a patch is both computable and worth computing. */
const PATCHABLE: ReadonlySet<FileChange> = new Set<FileChange>([
  "local-only",
  "upstream-only",
  "both",
  "missing",
  "added-upstream",
]);

// ---- the theme ----------------------------------------------------------------

/**
 * The folded theme's own three-way state, which does NOT use `classify`.
 *
 * The fold's BASE is the current on-disk file (D6), so `plan.theme.sha256`
 * already incorporates the user's local edits — `mergeThemeSource` keeps
 * existing values on conflict. A naive hash comparison would therefore see
 * `upstream !== recorded` on a purely local edit and report `both`, when the
 * truth is `local-only`. `PlannedTheme.changed` is the honest upstream axis: it
 * is `base === null || text !== base.text`, i.e. exactly "would `apply()` rewrite
 * this file", which is the question a user has.
 *
 * A `DiffTheme` needs a recorded hash (`HashPair.recordedSha256` is not
 * nullable), so a project whose receipt records no theme reports `theme: null`
 * even when this run's plan would fold one. That is a first INSTALL, not a diff,
 * and `add --dry-run` already previews it.
 */
function compareTheme(
  installed: Installed,
  planned: PlannedTheme | null,
  snapshot: FileSnapshot,
  patches: boolean,
): DiffTheme | null {
  const theme = installed.theme;
  if (theme === null) return null;

  // A `config.theme` that has been repointed since the install makes the two
  // describe different files; comparing them would be a category error.
  const upstream = planned !== null && planned.destination === theme.destination ? planned : null;

  const change: FileChange =
    theme.currentSha256 === null
      ? "missing"
      : upstream === null
        ? "unavailable"
        : themeChange(localStatus(theme), upstream.changed);

  return {
    destination: theme.destination,
    receiptPath: theme.receiptPath,
    recordedSha256: theme.recordedSha256,
    currentSha256: theme.currentSha256,
    upstreamSha256: upstream?.sha256 ?? null,
    change,
    patch:
      patches && upstream !== null && change !== "unchanged"
        ? themePatch(theme.receiptPath, snapshot.text(theme.destination) ?? "", upstream.text)
        : null,
  };
}

function themeChange(local: LocalStatus, changed: boolean): FileChange {
  if (local === "modified") return changed ? "both" : "local-only";
  return changed ? "upstream-only" : "unchanged";
}

function compareStyles(
  installed: Installed,
  planned: Plan["styles"],
  snapshot: FileSnapshot,
  patches: boolean,
): DiffStyles | null {
  const styles = installed.styles;
  if (styles === null) return null;

  const upstream = planned !== null && planned.destination === styles.destination ? planned : null;
  const change: FileChange =
    styles.currentSha256 === null
      ? "missing"
      : upstream === null
        ? "unavailable"
        : artifactChange(
            styles.currentSha256 !== styles.recordedSha256,
            upstream.sha256 !== styles.recordedSha256,
          );

  return {
    destination: styles.destination,
    receiptPath: styles.receiptPath,
    recordedSha256: styles.recordedSha256,
    currentSha256: styles.currentSha256,
    upstreamSha256: upstream?.sha256 ?? null,
    change,
    patch:
      patches && upstream !== null && change !== "unchanged"
        ? themePatch(styles.receiptPath, snapshot.text(styles.destination) ?? "", upstream.text)
        : null,
  };
}

function artifactChange(localChanged: boolean, upstreamChanged: boolean): FileChange {
  if (localChanged && upstreamChanged) return "both";
  if (localChanged) return "local-only";
  if (upstreamChanged) return "upstream-only";
  return "unchanged";
}

// ---- patches ------------------------------------------------------------------

/**
 * ON DISK -> UPSTREAM, in that direction, always.
 *
 * Load-bearing and not a preference: of the three hashes, only two sides have
 * CONTENT. `recorded` exists solely as a hash in `manteen.lock.json` — manteen
 * does not keep a copy of what it wrote — so a patch against the recorded
 * version is not computable at all.
 *
 * The consequence to keep in mind before "fixing" this: for a `local-only` file
 * the patch shows the user's own edit being REVERTED, because upstream still
 * equals what was recorded. That is correct. It is what `manteen update` would
 * do to that file, which is the question `diff` is asked.
 */
const ON_DISK = "on disk";
const UPSTREAM = "upstream";

/** jsdiff's own default is 4; three is the unified-diff convention. */
const FILE_CONTEXT = 3;

/**
 * The theme gets FULL context, up to a bound, exactly as `add --dry-run`'s
 * preview does — and for the same reason. The fold is the only thing manteen
 * does that REWRITES a file the user wrote, so "what survived" matters as much
 * as "what was added", and three lines around one inserted `components.Table`
 * entry answers only the second. A theme is one small file.
 */
const MAX_FULL_CONTEXT = 400;

function filePatch(label: string, before: string, after: string): string | null {
  return makePatch(label, before, after, FILE_CONTEXT);
}

function themePatch(label: string, before: string, after: string): string | null {
  const lineCount = before.split("\n").length;
  return makePatch(label, before, after, lineCount <= MAX_FULL_CONTEXT ? lineCount : FILE_CONTEXT);
}

function makePatch(label: string, before: string, after: string, context: number): string | null {
  if (before === after) return null;

  const patch = createPatch(label, before, after, ON_DISK, UPSTREAM, { context });

  // jsdiff prefixes every patch with `Index: <file>` and a rule of `=`, which is
  // an RCS artifact and not part of a unified diff. The `---`/`+++`/`@@` body is.
  const body = patch.split("\n").slice(2).join("\n").trimEnd();

  // No hunk survived. Reachable when the two sides differ in bytes but not in
  // their UTF-8 decoding — a BOM is the real case — and an empty patch under a
  // `both` heading reads as a rendering bug.
  return body.includes("@@") ? body : null;
}

// ---- rendering ------------------------------------------------------------------

/** Widest member of `FileChange`. */
const VERB_WIDTH = 16;

/**
 * The human report.
 *
 * `unchanged` rows are counted and not listed, which is the diff idiom: a
 * command that prints every file it looked at buries the four that moved. They
 * are all present under `--json`.
 */
export function renderDiff(result: DiffResult): string {
  const blocks: string[] = [];
  let changed = 0;
  let unchanged = 0;

  for (const item of result.items) {
    const moved = item.files.filter((file) => file.change !== "unchanged");
    changed += moved.length;
    unchanged += item.files.length - moved.length;
    if (moved.length === 0) continue;

    blocks.push(renderBlock(`${item.id}  ${ownerLabel(item)}`, moved));
  }

  const theme = result.theme;
  if (theme !== null) {
    if (theme.change === "unchanged") unchanged += 1;
    else {
      changed += 1;
      blocks.push(renderBlock("theme", [theme]));
    }
  }

  const styles = result.styles;
  if (styles !== null) {
    if (styles.change === "unchanged") unchanged += 1;
    else {
      changed += 1;
      blocks.push(renderBlock("styles", [styles]));
    }
  }

  return `${[...blocks, summarize(result, changed, unchanged)].join("\n")}\n`;
}

/**
 * "No changes" and "nothing to compare" are different answers, and stdout has to
 * say which.
 *
 * The case that forces this: `manteen diff @house/never-installed` compares an
 * empty selection, so there is nothing to report — and printing "No changes."
 * for it tells a user their uninstalled item is up to date. The explanation is a
 * note and notes go to stderr, which a pipeline routinely discards.
 *
 * Same distinction `installed.ts` makes when it emits `no-receipt` rather than
 * staying silent: "you have nothing installed" and "manteen has never run here"
 * have different next steps.
 */
function summarize(result: DiffResult, changed: number, unchanged: number): string {
  if (changed > 0) return `${count(changed, "change")}, ${unchanged} unchanged.`;

  const empty = result.items.length === 0 && result.theme === null && result.styles === null;
  if (empty && result.notes.length > 0) {
    return `Nothing to compare — see the ${count(result.notes.length, "note")} above.`;
  }
  return `No changes.${unchanged === 0 ? "" : ` ${count(unchanged, "file")} unchanged.`}`;
}

/** One item's rows, then its patches. Shared by the file blocks and the theme. */
function renderBlock(
  heading: string,
  rows: readonly { change: FileChange; receiptPath: string; patch: string | null }[],
): string {
  const lines = [heading];
  for (const file of rows) {
    lines.push(`  ${file.change.padEnd(VERB_WIDTH)}  ${file.receiptPath}`);
  }
  for (const file of rows) {
    if (file.patch !== null) lines.push("", file.patch);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The whole result, in the shared envelope.
 *
 * `DiffResult`'s own fields are spread verbatim — every one is already redacted
 * (`DiffItem.sourceUrl` comes from the receipt, which is committed to VCS and
 * therefore cannot hold an expanded `${VAR}`), so this is a straight
 * serialization rather than a projection. Only the three envelope keys are
 * added: `command` so a consumer can tell which command wrote the document,
 * `root` (already present, absolute by contract) and `ok`.
 *
 * `ok` is UNCONDITIONALLY true, and that is the honest answer rather than a
 * placeholder: a difference is the ANSWER to `diff`, never a failure of it, and
 * `runDiff` returns 0 in every arm it reaches. The only non-zero exits are a
 * config failure, which never gets this far, and a throw.
 */
export function renderDiffJson(
  result: DiffResult,
  diagnostics: readonly Diagnostic[] = [],
): string {
  // Destructured rather than spread-last: `...result` after `root` would
  // re-supply it, so the envelope keys sit at the top and `root` is written
  // exactly once. `notes` stays last, per the envelope.
  const { root, notes, ...rest } = result;
  return renderJson({ command: "diff", root, ok: true, ...rest, diagnostics, notes });
}

// ---- ordering -------------------------------------------------------------------

/**
 * By CODE UNIT, never `localeCompare` — the latter makes output depend on the
 * machine's locale, and this repo asserts byte-identical output.
 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

// ---- the shell ------------------------------------------------------------------

export interface DiffFlags {
  /** As commander supplies it — `--cwd`, defaulted to `process.cwd()`. */
  cwd: string;
  json?: boolean;
  stat?: boolean;
}

/**
 * `manteen diff [refs...]`, from argv to an exit code.
 *
 * `reportDiff` above deliberately cannot fail; this wrapper is where the other
 * two exit codes live, and there are exactly two:
 *
 *   2    a config problem, found before anything was fetched. Shared with every
 *        other command via `loadProjectConfig`.
 *   1    a throw — `plan()`'s, or the snapshot's non-ENOENT read errors (EACCES,
 *        EISDIR), which `installed.ts` requires a read-only command NOT to
 *        swallow. Rendered exactly as `add` renders a throw out of `plan()`.
 *
 * `renderDiagnostic` is handed in from `cli/render.ts` rather than defaulted
 * inside `createDiffPorts`, which keeps that factory honest about being the one
 * seam a test replaces.
 */
export async function runDiff(
  refs: readonly string[],
  flags: DiffFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const loaded = loadProjectConfig(flags.cwd, streams.stderr);
  if (!loaded.ok) return loaded.exit;

  const ports: DiffPorts = {
    ...createDiffPorts(renderDiagnostic),
    stdout: streams.stdout,
    stderr: streams.stderr,
  };

  try {
    return await reportDiff(
      loaded.config,
      { refs, json: flags.json === true, stat: flags.stat === true },
      ports,
    );
  } catch (error) {
    streams.stderr("error  diff\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }
}
