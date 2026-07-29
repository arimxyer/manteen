/**
 * `manteen update` — re-fetch what is installed and re-apply it.
 *
 * This is the one inspect-era command that MUTATES, so it is the one that must
 * not invent a path of its own. It owns exactly one decision — **which refs** —
 * and hands them to the existing `plan()` and `apply()` untouched. Everything
 * that makes `add` safe rides along for free and cannot be had any other way:
 * the collision gates (in-run and cross-run), the Mantine version gate, apply's
 * preflight, the shared pre-image journal, temp+rename, the theme fold, and the
 * receipt written last. A command that re-implemented writing would get none of
 * them, and would get none of them *silently*.
 *
 * ── The overwrite question is deliberately NOT special-cased ────────────────
 * Every file an update actually changes has disposition `overwrite` — that is
 * what "changed" means here — so `update` flows through W4's decision surface
 * exactly as `add` does: the grouped prompt, `--overwrite`, `--no-overwrite`,
 * `--yes`. Two reasons that is right rather than merely convenient:
 *
 *  - A locally modified file is indistinguishable, at the disposition level,
 *    from a file the registry changed. Updating either one replaces bytes on
 *    disk. `decide.ts`'s `hintFor` already tells the two apart in the prompt
 *    ("edited since" vs "item changed upstream") — its fourth case was written
 *    for precisely this command — so the user gets the distinction where it is
 *    actionable, per file, instead of a global flag that guesses for them.
 *  - `PlanOptions.overwrite` is one boolean for the whole run. There is no
 *    per-file channel, so "auto-overwrite the untouched ones, ask about the
 *    edited ones" cannot be expressed without bypassing the gate — and the
 *    bypass is exactly the thing that would silently discard someone's edit.
 *
 * CONSEQUENCE THE INTEGRATOR MUST SURFACE: a non-interactive `manteen update`
 * with neither `--overwrite` nor `--yes` refuses, essentially always, because
 * `checkDestinations` emits `destination-exists` at error severity for every
 * changed file — and `--dry-run` does not exempt it, since `dryRun` lives on
 * `ApplyOptions` and `plan()` never sees it, so a CI PREVIEW is unavailable
 * without `--overwrite` too. (Interactive is fine either way: the same gate
 * downgrades to `info` when there is a prompt to ask at.) That is §1's refusal
 * table working as specified, not a defect — but the help text has to say it.
 *
 * ── The theme ───────────────────────────────────────────────────────────────
 * SETTLED (roadmap, "Decisions taken"): update re-merges the theme DIRECTLY,
 * with no confirmation diff. Nothing here needs to implement that — `plan()`
 * folds and `apply()` phase 4 writes, the same as `add` — and nothing here may
 * undo it. `mergeThemeSource` runs `prefer: "base"`, so the user's values win on
 * every conflicting leaf, and the receipt keeps the pre-update hash. `manteen
 * diff` is the command for looking first.
 *
 * ── DEVIATION, recorded ─────────────────────────────────────────────────────
 * The brief for this file said "no arguments means every installed item". It
 * ships as **the direct set by default, `--all` for the superset**, which is
 * what `InstalledItem.direct`'s own docblock in `inventory/types.ts` specifies.
 * The mechanical reason: `receipt/write.ts` computes
 * `direct: (priorItem?.direct ?? false) || item.requestedBy.includes("<root>")`
 * and that flag is STICKY — only a future `manteen remove` clears it. Handing
 * every installed item to `plan()` as a root ref would therefore rewrite
 * `direct: true` across every transitive entry of a committed lockfile as a side
 * effect of a maintenance command, and there is no way to pass a ref that is not
 * a root. Nothing is lost by the narrower default: planning the direct set
 * re-fetches every still-reachable transitive item as a dependency, so the only
 * items `--all` adds are ORPHANS — and promoting an orphan is at least a
 * user-typed action. Raised and approved before implementation.
 *
 * ── Errors, and the exit code ───────────────────────────────────────────────
 * This module catches nothing. `plan()`'s throws, the receipt reader's
 * non-ENOENT throw and `FileHasher`'s EISDIR throw all propagate to the caller,
 * which owns exit codes (`cli/index.ts` maps a thrown error to its `renderThrown`
 * + exit 1). Swallowing any of them here would turn "we could not read your
 * project" into "nothing to update".
 *
 * **THE EXIT CODE COMES OFF `outcome`, NEVER OFF `kind`.** `UpdateResult.kind`
 * discriminates which STAGE was reached, not whether it succeeded, and
 * `"applied"` covers three different exits — this is measured, not asserted:
 *
 *   nothing-to-do                         -> 0
 *   refused                               -> `blockingExitCode(plan.diagnostics, false)`,
 *                                            which is 2 for `no-package-manager`
 *                                            and 1 otherwise. NOT a flat 1: that
 *                                            row of §1's table is reachable here
 *                                            whenever D17 does not drop a dep.
 *   applied + outcome.cancelled           -> 130 (zero mutation; the prompt was
 *                                            cancelled, `outcome.ok` is false)
 *   applied + outcome.failure !== null    -> 1  (stale-plan, install-failed,
 *                                            write-failed, rollback-failed)
 *   applied + outcome.ok                  -> 0
 *
 * `runAdd` in `cli/index.ts` is the reference for all five rows, including the
 * deliberate `force: false` on `blockingExitCode` — `plan.diagnostics` has
 * already been downgraded by the aggregator, so re-applying `--force` there
 * would forgive a second time.
 */
import type { Command } from "commander";
import { packageManagers } from "nypm";

import type { ApplyPorts } from "../apply/index";
import { apply } from "../apply/index";
import { hashFileBytes } from "../apply/preflight";
import type { JsonEnvelope, Streams } from "../cli/render";
import {
  loadProjectConfig,
  PROCESS_STREAMS,
  renderApplyFailure,
  renderDiagnostics,
  renderDryRun,
  renderJson,
  renderNotes,
  renderOutcome,
  renderThrown,
  sortNotes,
} from "../cli/render";
import type { LoadedConfig } from "../config/types";
import type { FileHasher } from "../inventory/installed";
import { fromReceiptState, itemsById } from "../inventory/installed";
import type { Installed, InventoryNote, UpdateResult, UpdateSkip } from "../inventory/types";
import { blockingExitCode } from "../plan/diagnostics";
import { plan } from "../plan/index";
import { parseRef } from "../plan/ref";
import type {
  ApplyOptions,
  ApplyOutcome,
  CanonicalId,
  Plan,
  PlanFn,
  PlanItem,
  PlanOptions,
} from "../plan/types";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { toReceiptPath } from "../receipt/path";
import type { ReceiptReader, ReceiptValidator } from "../receipt/read";
import { readReceipt } from "../receipt/read";
import { interactiveFromProcess } from "../ui";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const EXIT_CANCELLED = 130;

/** Derived from nypm rather than hardcoded, so a new manager arrives with an
 *  upgrade. Same derivation `cli/index.ts` uses for `add`. */
const PACKAGE_MANAGER_NAMES: string[] = [...new Set(packageManagers.map((pm) => pm.name))];

/**
 * `PlanOptions` plus the two flags that are `update`'s own.
 *
 * Extended rather than restated so the flag set cannot drift from what `plan()`
 * accepts: `force`, `overwrite`, `interactive` and `packageManager` are passed
 * through verbatim and mean exactly what they mean for `add`.
 */
export interface UpdateOptions extends PlanOptions {
  /**
   * `--dry-run`. Delegated to `ApplyOptions.dryRun` — D19's preview is a
   * property of the path this command reuses, not something re-implemented
   * here, so a dry-run update runs plan() plus apply's read-only phases 0 and 1
   * and stops before phase 2, exactly like `add --dry-run`.
   */
  dryRun?: boolean;
  /**
   * `--all`: update transitively-installed items as root refs too, not only the
   * direct set. See the DEVIATION note in the module docblock — this promotes
   * every item it names to `direct: true` in the lockfile, permanently. It earns
   * its place because a transitive item that nothing depends on any more is
   * otherwise unreachable by any command.
   */
  all?: boolean;
}

/**
 * Every I/O edge, injected — so the whole command is drivable in-process with
 * no network, no registry and no terminal.
 *
 * `plan` and `apply` are ports for one reason only: to be STUBBED in a test.
 * They are not an abstraction over the install path — there is exactly one
 * install path and this command must use it. `createUpdatePorts()` wires the
 * real ones, and a caller passing anything else is making a deliberate choice.
 */
export interface UpdatePorts {
  plan: PlanFn;
  /**
   * `apply`'s third parameter is optional, so the real `apply` is assignable
   * here. It is threaded rather than dropped so a test can inject phase 1's
   * overwrite prompt — the decision `update` most needs to exercise — without
   * a pseudo-terminal and without re-wrapping.
   */
  apply: (plan: Plan, options: ApplyOptions, ports?: ApplyPorts) => Promise<ApplyOutcome>;
  applyPorts?: ApplyPorts;
  /** `createReceiptReader()` in production. */
  read: ReceiptReader;
  /** `createReceiptValidator()` in production. */
  validate: ReceiptValidator;
  /** `hashFileBytes` in production; MUST throw for any failure that is not
   *  ENOENT (see `FileHasher`). */
  hash: FileHasher;
}

export function createUpdatePorts(): UpdatePorts {
  return {
    plan,
    apply,
    read: createReceiptReader(),
    validate: createReceiptValidator(),
    hash: hashFileBytes,
  };
}

/**
 * Re-fetch and re-apply installed items.
 *
 * `refs` narrows; empty means the default set (see `UpdateOptions.all`). The
 * result is a discriminated union so the renderer cannot reach for a `plan` on
 * an outcome that never produced one.
 *
 * `selected` names every item whose bytes move — a transitive dependency that
 * was never a root ref included — while `skipped` is only ever about the
 * candidates. `classify` says why the two are scoped differently.
 */
export async function update(
  config: LoadedConfig,
  refs: readonly string[],
  options: UpdateOptions,
  ports: UpdatePorts = createUpdatePorts(),
): Promise<UpdateResult> {
  const root = config.root;

  /**
   * The receipt, read once — and this read is a SELECTION INPUT ONLY.
   *
   * `installed.ts` states that a command holding a `Plan` must use
   * `fromReceiptState(plan.receipt, …)` rather than reading again. That rule is
   * unsatisfiable in its literal form here and the reason is structural: the
   * refs `plan()` needs come OUT of the receipt, so a read must precede the
   * plan. Its purpose is honoured instead — nothing below reports a fact taken
   * from this read; it decides which refs to hand over and nothing else, and
   * every fact the result carries comes off the `Plan` (whose own
   * `plan.receipt` is the one the gates ran against). A file that changes in
   * the window between the two reads is caught where it matters: apply's
   * preflight re-hashes `plan.receipt.path` in both directions of its presence
   * and returns `stale-plan`.
   */
  const installed = fromReceiptState(
    readReceipt(root, ports.read, ports.validate),
    root,
    ports.hash,
  );

  // `installed.notes` carries `no-receipt` / `receipt-unreadable`. Both yield an
  // empty item list, so both fall out below as "no candidates" — which is the
  // point: an UNREADABLE receipt must never reach plan()/apply(). Planning zero
  // refs under `--force` would push past `receipt-unreadable`, and phase 5 would
  // then merge from `null` and delete every ownership record in the file.
  const notes: InventoryNote[] = [...installed.notes];
  const skipped: UpdateSkip[] = [];

  const candidates =
    refs.length > 0
      ? fromRefs(refs, config, installed, notes, skipped)
      : fromReceipt(installed, config, options.all === true, skipped);

  if (candidates.length === 0) {
    return { kind: "nothing-to-do", selected: [], skipped: sortSkips(skipped), notes };
  }

  const planned = await ports.plan(config, [...candidates], {
    force: options.force,
    overwrite: options.overwrite,
    interactive: options.interactive,
    packageManager: options.packageManager,
  });

  const verdict = classify(candidates, planned, config);
  skipped.push(...verdict.skipped);

  if (!planned.ok) {
    return {
      kind: "refused",
      plan: planned,
      selected: verdict.selected,
      skipped: sortSkips(skipped),
      notes,
    };
  }

  /**
   * apply() runs whenever the plan is ok, INCLUDING when every candidate came
   * back `up-to-date`.
   *
   * Short-circuiting on "nothing changed" looks like a free optimisation and is
   * not: an all-`identical` plan is exactly the run `apply/index.ts` phase 5
   * calls out as the most valuable one to record — a destination that already
   * holds our bytes but has no ownership record (a new transitive item, or a
   * project installed before receipts existed) gets claimed by that run and by
   * no other. apply is a no-op when there is genuinely nothing to do: identical
   * files are never written, and phase 5 is gated on the receipt BYTES
   * differing, so an up-to-date project ends with an untouched tree.
   */
  const outcome = await ports.apply(
    planned,
    {
      interactive: options.interactive,
      overwrite: options.overwrite,
      dryRun: options.dryRun,
    },
    ports.applyPorts,
  );

  return {
    kind: "applied",
    plan: planned,
    outcome,
    selected: verdict.selected,
    skipped: sortSkips(skipped),
    notes,
  };
}

// ---- selecting the refs -----------------------------------------------------

/**
 * The default set: items the user installed EXPLICITLY.
 *
 * A transitive item is not skipped here, it is simply not a root — planning its
 * dependents re-fetches it as a dependency, which is why `UpdateSkipReason` has
 * no value for "installed indirectly". `--all` widens the set; see
 * `UpdateOptions.all` for what that costs.
 */
function fromReceipt(
  installed: Installed,
  config: LoadedConfig,
  all: boolean,
  skipped: UpdateSkip[],
): CanonicalId[] {
  const out: CanonicalId[] = [];

  for (const item of installed.items) {
    if (!all && !item.direct) continue;

    const problem = unreachable(item.id, config);
    if (problem !== null) {
      skipped.push(problem);
      continue;
    }
    out.push(item.id);
  }

  return out;
}

/**
 * The narrowed set: what the user named on the command line.
 *
 * Order of the two checks is deliberate. "Is it in the receipt?" comes first
 * because `update` is defined over the installed set — `@house/never-installed`
 * is answered by `not-installed` no matter what its registry says, and pointing
 * at the registry config first would send the user to fix the wrong file.
 */
function fromRefs(
  refs: readonly string[],
  config: LoadedConfig,
  installed: Installed,
  notes: InventoryNote[],
  skipped: UpdateSkip[],
): CanonicalId[] {
  const byId = itemsById(installed);
  const out: CanonicalId[] = [];
  // Covers selected AND skipped ids: `manteen update @house/a @house/a` must
  // neither plan the item twice nor report the same skip twice.
  const seen = new Set<CanonicalId>();

  for (const raw of refs) {
    const parsed = parseRef(raw);

    // An unparseable or bare ref has no `CanonicalId`, and `UpdateSkip.id` is
    // required — so this is a NOTE, not a skip. That split is what keeps
    // `skipped` a list of real items rather than a mix of items and typos.
    // Bare refs stay refused for the resolver's reason: `@house/x` and
    // `@base/x` are different components, and guessing which one the user meant
    // is the shipped bug D8 exists to fix.
    if (parsed.kind === "bare") {
      notes.push({
        code: "unknown-namespace",
        message: `"${raw}" names no registry, and manteen does not guess one. Write it qualified, like @house/${parsed.name}.`,
      });
      continue;
    }
    if (parsed.kind === "invalid") {
      notes.push({
        code: "unknown-namespace",
        message: `"${parsed.input}" cannot be updated because ${parsed.reason}.`,
      });
      continue;
    }

    const id = parsed.id;
    if (seen.has(id)) continue;
    seen.add(id);

    if (byId.get(id) === undefined) {
      skipped.push({
        id,
        reason: "not-installed",
        // Names the lockfile rather than the registry: the remedy is `add`.
        // ROOT-RELATIVE, matching every other path this CLI prints — an
        // absolute tmpdir is unassertable across machines.
        detail: `${id} is not recorded in ${toReceiptPath(installed.source.path, config.root)}, so there is nothing to update. Install it with \`manteen add ${id}\`.`,
      });
      continue;
    }

    const problem = unreachable(id, config);
    if (problem !== null) {
      skipped.push(problem);
      continue;
    }
    out.push(id);
  }

  return out;
}

/**
 * Why this recorded id cannot be handed to `plan()`, or null.
 *
 * Filtering here rather than letting the resolver refuse is the whole reason
 * this function exists. `unknown-namespace` is a BLOCKING, non-forceable
 * diagnostic, so one stale entry — a registry the user removed from
 * `manteen.json`, or a hand-edited lockfile id — would refuse the entire update
 * and leave every other item un-updated with no way forward. As a skip it costs
 * one line of report and nothing else.
 *
 * The namespace is read off `parseRef`'s own output rather than re-split from
 * the string: `parseRef` is the single detector of what a reference means, and
 * a second splitter here is how "which namespace is this" acquires two answers.
 */
function unreachable(id: CanonicalId, config: LoadedConfig): UpdateSkip | null {
  const parsed = parseRef(id);

  if (parsed.kind === "bare" || parsed.kind === "invalid") {
    const reason = parsed.kind === "bare" ? "it names no registry" : parsed.reason;
    return {
      id,
      reason: "unknown-namespace",
      detail: `${id} is recorded in the lockfile but is not a reference manteen can resolve, because ${reason}. Repair or remove that entry.`,
    };
  }

  // A `url:` item carries its own source and needs no registry entry, so there
  // is nothing to check — `parsed.kind === "url"` falls through as reachable.
  if (parsed.kind === "namespaced" && !config.registries.has(parsed.namespace)) {
    return {
      id,
      reason: "unknown-namespace",
      detail: `${parsed.namespace} is no longer configured in ${config.configPath}, so ${id} cannot be re-fetched. Add the registry back, or leave the files as they are.`,
    };
  }

  return null;
}

// ---- reading the plan back --------------------------------------------------

interface Verdict {
  selected: CanonicalId[];
  skipped: UpdateSkip[];
}

/**
 * Read the plan back: what actually moves, and which candidates did not.
 *
 * The two fields are scoped DIFFERENTLY and deliberately so:
 *
 *  - `skipped` is over the CANDIDATES. Every `UpdateSkipReason` is a statement
 *    about something the user named or the receipt recorded, so an item nobody
 *    selected cannot be "skipped".
 *  - `selected` is over the WHOLE PLAN. `manteen update` with no arguments plans
 *    the direct set, and a transitive dependency of a direct item can be the
 *    only thing that changed — `@base/data-grid` unchanged, its `@base/empty-state`
 *    rewritten upstream. Reporting `selected: []` beside a written file is the
 *    one summary that would make a user distrust the tool, so a changed
 *    transitive item is named here even though it was never a root ref.
 *
 * Both halves come out of the SAME plan. There is one `plan()` call: an
 * `up-to-date` candidate rides along in it rather than being excluded by a
 * second, narrowed plan, which would double every fetch and could resolve
 * differently the second time.
 *
 * Order is `plan.items`' — topologically sorted with a lexicographic tiebreak —
 * so a dependency is named before the item that pulled it in.
 */
function classify(
  candidates: readonly CanonicalId[],
  planned: Plan,
  config: LoadedConfig,
): Verdict {
  const items = new Map(planned.items.map((item) => [item.id, item]));

  /**
   * Items that fed a theme fold which actually CHANGED.
   *
   * Without this, a theme-only item is misreported as up-to-date: D5 absorbs a
   * theme-destination file out of the write list, so such an item reaches the
   * plan with `files: []` — and `[].some(…)` is `false`. Coarse on purpose in
   * the safe direction: if the fold changed at all, every contributor to it is
   * treated as having moved, because `PlannedTheme` reports one `changed` flag
   * for the merged result and not one per fragment.
   */
  const foldedTheme = planned.theme?.changed === true ? planned.theme : null;
  const themeContributors = new Set<CanonicalId>(
    foldedTheme?.sources.map((source) => source.itemId) ?? [],
  );

  /**
   * `identical` is plan()'s verdict that the bytes on disk already equal what
   * the registry serves — the only disposition that means "no change". Both
   * `create` (the file is gone; update restores it) and `overwrite` (the file
   * moved, on either side) are real work.
   */
  const moved = (item: PlanItem): boolean =>
    themeContributors.has(item.id) || item.files.some((file) => file.disposition !== "identical");

  const selected = planned.items.filter(moved).map((item) => item.id);
  const skipped: UpdateSkip[] = [];

  for (const id of candidates) {
    const item = items.get(id);
    if (item === undefined) {
      skipped.push(unplanned(id, planned, config));
      continue;
    }
    if (moved(item)) continue;

    skipped.push({
      id,
      reason: "up-to-date",
      // "its own files" rather than "nothing changed": a dependency of this item
      // may well have moved, and `selected` is where that is said.
      detail: `${id} already matches what its registry serves; none of its own files changed.`,
    });
  }

  return { selected, skipped };
}

/**
 * A candidate that produced no plan item.
 *
 * `unavailable` is the only skip reason left, and the contract's one-line gloss
 * for it ("its registry could not be reached") is narrower than the set of ways
 * the resolver can drop an item — a `fetch-failed`, a `missing-env`, D25's node
 * or depth ceiling, or a D9 `resolutions` entry that redirected the reference to
 * a different item entirely. `detail` is the field the user reads, so it says
 * which one rather than repeating the label.
 *
 * `config.resolutions` is CONSULTED here, never re-implemented: the rewrite is
 * `resolve.ts`'s to perform and its `resolution-applied` warning is already in
 * `plan.diagnostics`. Reading the map only lets this sentence name the winner.
 */
function unplanned(id: CanonicalId, planned: Plan, config: LoadedConfig): UpdateSkip {
  const parsed = parseRef(id);
  const name = parsed.kind === "namespaced" ? parsed.name : null;
  const winner = name === null ? undefined : config.resolutions.get(name);

  if (winner !== undefined && winner !== id) {
    return {
      id,
      reason: "unavailable",
      detail: `${id} was not planned: resolutions[${JSON.stringify(name)}] in ${config.configPath} redirects it to ${winner}, which was planned in its place.`,
    };
  }

  return {
    id,
    reason: "unavailable",
    detail: planned.ok
      ? `${id} produced no plan item, so nothing was updated for it.`
      : `${id} could not be resolved; the refusals above say why. Nothing was updated for it.`,
  };
}

/**
 * By id, then by reason, by CODE UNIT — never `localeCompare`, which would make
 * the report depend on `LANG`. `update` is the only one of the four commands
 * whose output a script might diff between runs, and a receipt read in one order
 * must not print in another.
 */
function sortSkips(skips: readonly UpdateSkip[]): UpdateSkip[] {
  return [...skips].sort((a, b) => compare(a.id, b.id) || compare(a.reason, b.reason));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---- rendering --------------------------------------------------------------

/**
 * A skip, in `renderNote`'s shape — `skip  reason  id`, then the detail
 * indented.
 *
 * `skip` rather than `note` or a severity. An `UpdateSkip` is neither: it is not
 * a problem with the project (a note) and it does not block (a diagnostic), it
 * is an item that was named and then left alone. `UpdateSkipReason` shares two
 * spellings with `InventoryNoteCode` (`not-installed`, `unknown-namespace`), so
 * the head word is what keeps the two channels apart on one terminal — the same
 * reason a note is not printed under `error`.
 */
function renderSkip(skip: UpdateSkip): string {
  const lines = [`skip  ${skip.reason}  ${skip.id}`];
  for (const line of skip.detail.split("\n")) lines.push(`  ${line}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The one stdout line that says what moved.
 *
 * Printed ALONGSIDE `renderOutcome`'s per-file verbs rather than instead of
 * them, because the two answer different questions: the verbs say which
 * destinations were written, and this says which ITEMS that was on behalf of —
 * including a transitive dependency that was never a root ref, which is exactly
 * the case `classify` scopes `selected` over the whole plan to catch.
 */
function renderSelected(selected: readonly CanonicalId[]): string {
  if (selected.length === 0) return "";
  return `\nupdated  ${selected.join(", ")}\n`;
}

/**
 * The `--json` document.
 *
 * `kind` is `UpdateResult`'s own discriminator and is carried through verbatim,
 * but a consumer must read `ok` for success — `"applied"` covers a clean run, a
 * cancelled prompt and a write failure alike. That is the same rule the module
 * docblock states for the exit code, restated where a script will hit it.
 *
 * `plan` and `outcome` are PROJECTED, not serialized. `PlannedFile.content` and
 * `PlannedTheme.text` carry whole source files, so `JSON.stringify(result)`
 * would dump the registry's entire payload into a pipe.
 */
function toUpdateJson(
  root: string,
  result: UpdateResult,
  ok: boolean,
): JsonEnvelope & Record<string, unknown> {
  const plan = result.kind === "nothing-to-do" ? null : result.plan;
  const outcome = result.kind === "applied" ? result.outcome : null;

  return {
    command: "update",
    root,
    ok,
    kind: result.kind,
    selected: [...result.selected],
    skipped: result.skipped,
    cancelled: outcome?.cancelled ?? false,
    dryRun: outcome?.dryRun ?? false,
    files:
      outcome === null
        ? (plan?.files ?? []).map((file) => ({
            destination: toReceiptPath(file.destination, root),
            disposition: file.disposition,
          }))
        : outcome.files.map((file) => ({
            destination: toReceiptPath(file.destination, root),
            result: file.result,
          })),
    theme:
      plan?.theme == null
        ? null
        : {
            destination: toReceiptPath(plan.theme.destination, root),
            changed: plan.theme.changed,
            written: outcome?.theme?.written ?? false,
          },
    dependencies:
      outcome === null
        ? null
        : { installed: outcome.dependencies.installed, command: outcome.dependencies.command },
    failure:
      outcome?.failure == null
        ? null
        : { kind: outcome.failure.kind, message: outcome.failure.message },
    diagnostics: plan?.diagnostics ?? [],
    notes: result.notes,
  };
}

// ---- the shell --------------------------------------------------------------

export interface UpdateFlags {
  /** As commander supplies it — `--cwd`, defaulted to `process.cwd()`. */
  cwd: string;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
  /** `undefined` until commander says the user typed one of the two spellings;
   *  `false` means `--no-overwrite`. See `overwriteFrom`. */
  overwrite?: boolean;
  yes?: boolean;
  /** D15's detection override. */
  pm?: string;
}

/**
 * `manteen update [refs...]`, from argv to an exit code.
 *
 * Every decision here is `runAdd`'s, reused rather than re-derived — the
 * three-state overwrite, the `--pm` validation, the interactive predicate, the
 * config split at exit 2 — because `add` and `update` write through the same
 * `plan()`/`apply()` and a flag that meant something different in one of them
 * would be a trap rather than a feature.
 *
 * THE EXIT CODE COMES OFF `outcome`, NEVER OFF `kind`. See the module docblock
 * for the five-row table and why `refused` is not a flat 1.
 */
export async function runUpdate(
  refs: readonly string[],
  flags: UpdateFlags,
  command: Pick<Command, "getOptionValueSource">,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const loaded = loadProjectConfig(flags.cwd, streams.stderr);
  if (!loaded.ok) return loaded.exit;
  const config = loaded.config;

  // Validated before planning, exactly as `runAdd` does and for the same reason:
  // nypm would otherwise take an unknown name as far as building an unrunnable
  // command string. Duplicating the CHECK rather than the LIST — the names come
  // from nypm, so a new package manager arrives with an upgrade.
  if (flags.pm !== undefined && !PACKAGE_MANAGER_NAMES.includes(flags.pm)) {
    streams.stderr(
      `manteen update: --pm ${flags.pm} is not a package manager manteen knows. ` +
        `Expected one of: ${PACKAGE_MANAGER_NAMES.join(", ")}.\n`,
    );
    return EXIT_USAGE;
  }

  const options: UpdateOptions = {
    all: flags.all,
    dryRun: flags.dryRun,
    force: flags.force,
    overwrite: overwriteFrom(flags, command),
    interactive: interactiveFromProcess({ yes: Boolean(flags.yes) }),
    packageManager: flags.pm as UpdateOptions["packageManager"],
  };

  // `update()` catches nothing on purpose (see the module docblock): the receipt
  // reader's non-ENOENT throw and `FileHasher`'s EISDIR must not become "nothing
  // to update". They land here, print, and exit 1 — the same handling `runAdd`
  // gives a throw out of `plan()`.
  let result: UpdateResult;
  try {
    result = await update(config, refs, options);
  } catch (error) {
    streams.stderr("error  update\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  const exit = updateExitCode(result);

  if (flags.json === true) {
    streams.stdout(renderJson(toUpdateJson(config.root, result, exit === EXIT_OK)));
    return exit;
  }

  // Diagnostics, then notes, then skips — widest scope first, and all on stderr
  // so `manteen update --dry-run > plan.txt` captures only what would change.
  if (result.kind !== "nothing-to-do") {
    renderDiagnostics(result.plan.diagnostics, result.plan.root, streams.stderr);
  }
  streams.stderr(renderNotes(sortNotes(result.notes)));
  for (const skip of result.skipped) streams.stderr(renderSkip(skip));

  if (result.kind === "nothing-to-do") {
    // A real answer, not silence: "everything is current" and "you named
    // nothing that is installed" both land here, and the skips above say which.
    streams.stdout("Nothing to update.\n");
    return exit;
  }
  if (result.kind === "refused") return exit;

  // `flags.dryRun`, not `outcome.dryRun` — `runAdd`'s rule. That field is
  // apply()'s echo of the same value, and if it were ever left unset a dry run
  // would render `WriteResult`s for writes that never happened.
  streams.stdout(
    flags.dryRun ? renderDryRun(result.plan) : renderOutcome(result.outcome, result.plan.root),
  );
  streams.stdout(renderSelected(result.selected));
  streams.stderr(renderApplyFailure(result.outcome, result.plan.root));

  return exit;
}

/**
 * Three states out of two flags, character for character `runAdd`'s.
 *
 * Commander presets `overwrite` to `true` when `--no-overwrite` is declared
 * alone, so the option's VALUE cannot distinguish "defaulted" from "typed" — the
 * source can, and it is the only reading that survives however commander orders
 * its defaults.
 *
 * D14: `--yes` implies `--overwrite`, but an explicit `--no-overwrite` wins.
 */
function overwriteFrom(
  flags: UpdateFlags,
  command: Pick<Command, "getOptionValueSource">,
): PlanOptions["overwrite"] {
  const typed = command.getOptionValueSource("overwrite") === "cli";
  if (typed) return flags.overwrite === false ? "no" : true;
  return flags.yes ? true : undefined;
}

/**
 * The five-row table from the module docblock, as code.
 *
 * Exported so the integrator wires the rule rather than re-deriving it, and so
 * it is assertable without a stream.
 */
export function updateExitCode(result: UpdateResult): number {
  if (result.kind === "nothing-to-do") return EXIT_OK;
  if (result.kind === "refused") {
    // `force: false` deliberately: `plan.diagnostics` has already been
    // downgraded by the aggregator, so re-applying `--force` here would forgive
    // a second time. §1's table puts `no-package-manager` at 2, not 1.
    return blockingExitCode(result.plan.diagnostics, false) === EXIT_USAGE
      ? EXIT_USAGE
      : EXIT_REFUSED;
  }
  if (result.outcome.cancelled) return EXIT_CANCELLED;
  return result.outcome.ok ? EXIT_OK : EXIT_REFUSED;
}
