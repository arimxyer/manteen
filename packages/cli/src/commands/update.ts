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
 * ── Ordinary source is a three-way update ───────────────────────────────────
 * `plan()` receives `operation: "update"` and computes from the committed
 * pristine base, the project file and current registry bytes. Conflict-free
 * results apply without an overwrite prompt; conflicts refuse before apply.
 * `--take-upstream` is the one explicit destructive spelling and is never
 * inferred from `--yes` or interactivity.
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
 * Each lifecycle boundary preserves a typed failure for the machine envelope.
 * The initial receipt read is normalized separately so a broken ownership file
 * names `manteen.lock.json`, provides bounded recovery guidance, and never
 * exposes a machine-local absolute path. Swallowing any of these failures would
 * turn "we could not read your project" into "nothing to update".
 *
 * **THE EXIT CODE COMES OFF `outcome`, NEVER OFF `kind`.** `UpdateResult.kind`
 * discriminates which STAGE was reached, not whether it succeeded. The
 * `"attempted"` stage covers every exit after apply was entered:
 *
 *   nothing-to-do                         -> 0
 *   refused                               -> `blockingExitCode(plan.diagnostics, false)`,
 *                                            which is 2 for `no-package-manager`
 *                                            and 1 otherwise. NOT a flat 1: that
 *                                            row of §1's table is reachable here
 *                                            whenever D17 does not drop a dep.
 *   attempted + outcome.cancelled         -> 130 (zero mutation; the prompt was
 *                                            cancelled, `outcome.ok` is false)
 *   attempted + outcome.failure !== null  -> 1  (stale-plan, install-failed,
 *                                            write-failed, verification-failed,
 *                                            rollback-failed)
 *   attempted + outcome.failure caused by
 *             failed verification         -> 1  (the file transaction is restored)
 *   attempted + outcome.ok + verification
 *             not failed                  -> 0
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
  renderUpdateStateAdvisory,
  sortNotes,
} from "../cli/render";
import type { LoadedConfig } from "../config/types";
import type { FileHasher } from "../inventory/installed";
import { fromReceiptState, itemsById } from "../inventory/installed";
import type {
  Installed,
  InventoryNote,
  UpdateCommandFailureKind,
  UpdateResult,
  UpdateSkip,
} from "../inventory/types";
import { blockingExitCode, diag, sortDiagnostics } from "../plan/diagnostics";
import { digestPlan, planDigestMatches } from "../plan/digest";
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
import { readReceipt, receiptPathFor } from "../receipt/read";
import {
  createVerificationPorts,
  plannedVerificationOutcome,
  type VerificationOutput,
  type VerificationPorts,
  verifyAppliedUpdate,
} from "../verification/run";
import { VERIFICATION_BOUNDARY, type VerificationOutcome } from "../verification/types";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const EXIT_CANCELLED = 130;

/** Preserve the lifecycle phase when a port throws instead of returning data. */
export class UpdateCommandError extends Error {
  constructor(
    readonly kind: Exclude<UpdateCommandFailureKind, "receipt-unreadable" | "setup-failed">,
    message: string,
    readonly mutated: boolean,
    readonly paths?: string[],
  ) {
    super(message);
    this.name = "UpdateCommandError";
  }
}

function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function receiptReadMessage(root: string, error: unknown): string {
  const receiptPath = receiptPathFor(root);
  const detail = thrownMessage(error).split(receiptPath).join("manteen.lock.json");
  return (
    `manteen.lock.json could not be read: ${detail}. ` +
    "Restore it as a regular readable file, or restore it from another trusted copy, before retrying."
  );
}

function stageError(
  kind: UpdateCommandError["kind"],
  error: unknown,
  mutated: boolean,
): UpdateCommandError {
  return error instanceof UpdateCommandError
    ? error
    : new UpdateCommandError(kind, thrownMessage(error), mutated);
}

/** Derived from nypm rather than hardcoded, so a new manager arrives with an
 *  upgrade. Same derivation `cli/index.ts` uses for `add`. */
const PACKAGE_MANAGER_NAMES: string[] = [...new Set(packageManagers.map((pm) => pm.name))];

/**
 * `PlanOptions` plus the two flags that are `update`'s own.
 *
 * Extended rather than restated so the flag set cannot drift from what `plan()`
 * accepts: force, interactivity and package-manager selection are passed
 * through; overwrite/reset is deliberately update-specific.
 */
export type UpdateOptions = Omit<PlanOptions, "overwrite" | "operation" | "takeUpstream"> & {
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
  /** Explicitly discard local adaptations for files still shipped upstream. */
  takeUpstream?: boolean;
  /** Refuse before apply unless the fresh read-only preview has this digest. */
  expectPlan?: string;
};

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
  /** `apply`'s third parameter remains threaded for programmatic parity. Update
   * reaches it only after source conflicts were resolved in plan. */
  apply: (plan: Plan, options: ApplyOptions, ports?: ApplyPorts) => Promise<ApplyOutcome>;
  applyPorts?: ApplyPorts;
  /** `createReceiptReader()` in production. */
  read: ReceiptReader;
  /** `createReceiptValidator()` in production. */
  validate: ReceiptValidator;
  /** `hashFileBytes` in production; MUST throw for any failure that is not
   *  ENOENT (see `FileHasher`). */
  hash: FileHasher;
  /** Post-apply only. It is intentionally not an ApplyPort. */
  verification: VerificationPorts;
}

export function createUpdatePorts(
  output: VerificationOutput = (chunk) => {
    process.stderr.write(chunk);
  },
): UpdatePorts {
  const read = createReceiptReader();
  const validate = createReceiptValidator();
  return {
    plan,
    apply,
    read,
    validate,
    hash: hashFileBytes,
    verification: {
      ...createVerificationPorts(output, hashFileBytes),
      readReceipt: read,
      validateReceipt: validate,
    },
  };
}

function unavailableVerification(
  config: LoadedConfig,
  options: UpdateOptions,
  planned: Plan,
): VerificationOutcome {
  if (config.raw.verification?.update === undefined) {
    return { ...VERIFICATION_BOUNDARY, status: "not-configured", checks: [], failure: null };
  }
  if (options.verify === false)
    return { ...VERIFICATION_BOUNDARY, status: "skipped", checks: [], failure: null };
  if (planned.verification === null) {
    // Reachable only on a refused plan. An ok plan with configured verification
    // must carry the exact definitions the runner will revalidate.
    return { ...VERIFICATION_BOUNDARY, status: "planned", checks: [], failure: null };
  }
  return plannedVerificationOutcome(planned.verification);
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
  let receiptState: ReturnType<typeof readReceipt>;
  try {
    receiptState = readReceipt(root, ports.read, ports.validate);
  } catch (error) {
    throw new UpdateCommandError("selection-failed", receiptReadMessage(root, error), false, [
      receiptPathFor(root),
    ]);
  }

  let installed: Installed;
  try {
    installed = fromReceiptState(receiptState, root, ports.hash);
  } catch (error) {
    throw stageError("selection-failed", error, false);
  }

  // An unreadable receipt must never become the successful no-receipt case. It
  // cannot safely reach plan/apply because that would merge ownership from
  // null, but returning "nothing-to-do" tells an agent the broken state is
  // healthy. Preserve it as a command-native failure instead.
  const notes: InventoryNote[] = [...installed.notes];
  const skipped: UpdateSkip[] = [];
  if (installed.source.state === "unreadable") {
    return {
      kind: "failed",
      failure: {
        kind: "receipt-unreadable",
        message:
          notes.find((note) => note.code === "receipt-unreadable")?.message ??
          "manteen.lock.json is unreadable and must be repaired before update can continue.",
      },
      mutated: false,
      selected: [],
      skipped: [],
      notes: [],
    };
  }

  const candidates =
    refs.length > 0
      ? fromRefs(refs, config, installed, notes, skipped)
      : fromReceipt(installed, config, options.all === true, skipped);

  if (candidates.length === 0) {
    return { kind: "nothing-to-do", selected: [], skipped: sortSkips(skipped), notes };
  }

  let planned: Plan;
  try {
    planned = await ports.plan(config, [...candidates], {
      force: options.force,
      interactive: options.interactive,
      packageManager: options.packageManager,
      operation: "update",
      takeUpstream: options.takeUpstream,
      verify: options.verify,
    });
  } catch (error) {
    throw stageError("planning-failed", error, false);
  }

  const planDigest = digestPlan(planned, {
    refs: candidates,
    all: options.all,
    force: options.force,
    packageManager: options.packageManager,
    takeUpstream: options.takeUpstream,
    verify: options.verify,
  });
  planned.planDigest = planDigest;
  if (!planDigestMatches(planDigest, options.expectPlan)) {
    const expected = options.expectPlan?.toLowerCase() ?? "";
    const mismatch = diag(
      "plan-mismatch",
      `The fresh update plan is ${planDigest}, not the explicitly authorised ${expected}. Re-run --dry-run --json and review the new plan before applying it.`,
    );
    const refusedPlan: Plan = {
      ...planned,
      diagnostics: sortDiagnostics([...planned.diagnostics, mismatch]),
      ok: false,
    };
    const verdict = classify(candidates, refusedPlan, config);
    skipped.push(...verdict.skipped);
    return {
      kind: "refused",
      plan: refusedPlan,
      selected: verdict.selected,
      skipped: sortSkips(skipped),
      notes,
    };
  }

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
   * not: an all-`identical` plan is exactly the run `apply/index.ts` phase 7
   * calls out as the most valuable one to record — a destination that already
   * holds our bytes but has no ownership record (a new transitive item, or a
   * project installed before receipts existed) gets claimed by that run and by
   * no other. apply is a no-op when there is genuinely nothing to do: identical
   * files are never written, and phase 7 is gated on the receipt BYTES
   * differing, so an up-to-date project ends with an untouched tree.
   */
  let outcome: ApplyOutcome;
  try {
    outcome = await ports.apply(
      planned,
      {
        // Source conflicts were decided in plan. `true` means "apply that exact
        // conflict-free result", not "replace with pristine upstream".
        interactive: false,
        overwrite: true,
        dryRun: options.dryRun,
      },
      ports.applyPorts,
    );
  } catch (error) {
    // A throwing apply port violated the normal returned-outcome contract. It
    // may have thrown after a write, so never report a reassuring false here.
    throw stageError("apply-failed", error, options.dryRun !== true);
  }

  let verification = unavailableVerification(config, options, planned);
  if (outcome.verification !== undefined) {
    verification = outcome.verification;
  } else if (verification.status === "planned" && planned.verification !== null) {
    if (!outcome.ok) {
      verification = { ...VERIFICATION_BOUNDARY, status: "skipped", checks: [], failure: null };
    } else if (!outcome.dryRun) {
      try {
        verification = await verifyAppliedUpdate(planned, planned.verification, ports.verification);
      } catch (error) {
        throw stageError("verification-failed", error, true);
      }
    }
  }

  return {
    kind: "attempted",
    plan: planned,
    outcome,
    verification,
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
   * `identical` means update proposes no destination write. `create` and
   * `overwrite` are real work after the three-way planner has either chosen
   * incoming bytes or produced a conflict-free merge.
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

    const localOnly = item.files.some(
      (file) =>
        file.priorOwner !== null &&
        file.upstream.sha256 === file.priorOwner.baseSha256 &&
        file.existing !== null &&
        file.existing.sha256 !== file.priorOwner.baseSha256,
    );

    skipped.push({
      id,
      reason: localOnly ? "local-only" : "up-to-date",
      detail: localOnly
        ? `${id} has local adaptations and no upstream source change; update preserved the project bytes.`
        : `${id} needs no source write; none of its own files changed.`,
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

export type UpdatePayloadKind =
  | "nothing-to-do"
  | "refused"
  | "previewed"
  | "cancelled"
  | "applied"
  | "rolled-back"
  | "rollback-failed"
  | "failed";

/** Project the internal stage union into the truthful command outcome. */
export function updatePayloadKind(result: UpdateResult): UpdatePayloadKind {
  if (result.kind !== "attempted") return result.kind;
  if (result.outcome.dryRun) return "previewed";
  if (result.outcome.cancelled) return "cancelled";
  if (result.outcome.ok) return "applied";
  if (
    result.outcome.failure?.kind === "write-failed" ||
    result.outcome.failure?.kind === "verification-failed"
  )
    return "rolled-back";
  if (result.outcome.failure?.kind === "rollback-failed") return "rollback-failed";
  return "failed";
}

/**
 * The `--json` document.
 *
 * The public `kind` is an OUTCOME, not `UpdateResult`'s internal stage
 * discriminator. In particular, a successfully restored transaction is
 * `"rolled-back"`, never `"applied"`. `failure.kind` retains the narrower cause.
 *
 * `plan` and `outcome` are PROJECTED, not serialized. `PlannedFile.content` and
 * `PlannedTheme.text` carry whole source files, so `JSON.stringify(result)`
 * would dump the registry's entire payload into a pipe.
 */
function toUpdateJson(
  root: string,
  result: UpdateResult,
  ok: boolean,
  fallbackVerification: VerificationOutcome,
  requestedDryRun: boolean,
): JsonEnvelope & Record<string, unknown> {
  const plan = result.kind === "refused" || result.kind === "attempted" ? result.plan : null;
  const outcome = result.kind === "attempted" ? result.outcome : null;
  const verification = result.kind === "attempted" ? result.verification : fallbackVerification;
  const planDigest = plan?.planDigest ?? null;
  const failure = result.kind === "failed" ? result.failure : (outcome?.failure ?? null);

  return {
    command: "update",
    root,
    ok,
    kind: updatePayloadKind(result),
    ...(result.kind === "failed" ? { mutated: result.mutated } : {}),
    planDigest,
    selected: [...result.selected],
    skipped: result.skipped,
    cancelled: outcome?.cancelled ?? false,
    // Echo argv, not apply reachability. A resolution refusal and a no-op still
    // need to tell a machine caller that this invocation prohibited mutation.
    dryRun: requestedDryRun,
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
    styles:
      plan?.styles == null
        ? null
        : {
            destination: toReceiptPath(plan.styles.destination, root),
            changed: plan.styles.changed,
            written: outcome?.styles?.written ?? false,
          },
    dependencies:
      outcome === null
        ? null
        : { installed: outcome.dependencies.installed, command: outcome.dependencies.command },
    failure:
      failure === null
        ? null
        : {
            kind: failure.kind,
            message: failure.message,
            ...(failure.paths === undefined
              ? {}
              : {
                  paths: [...new Set(failure.paths.map((path) => toReceiptPath(path, root)))],
                }),
          },
    updateState:
      outcome === null
        ? null
        : {
            changed: outcome.updateState.changed,
            versioningRequired: outcome.updateState.changed,
          },
    verification: {
      status: verification.status,
      checks: verification.checks.map((check) => ({
        script: check.script,
        command: check.command,
        result: check.result,
        exitCode: check.exitCode,
        signal: check.signal,
      })),
      failure:
        verification.failure === null
          ? null
          : verification.failure.kind === "managed-byte-drift"
            ? {
                ...verification.failure,
                paths: verification.failure.paths.map((path) => toReceiptPath(path, root)),
              }
            : verification.failure,
    },
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
  takeUpstream?: boolean;
  expectPlan?: string;
  /** Commander sets false only for --no-verify. */
  verify?: boolean;
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
  _command: Pick<Command, "getOptionValueSource">,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const loaded = loadProjectConfig(flags.cwd, streams.stderr);
  if (!loaded.ok) return loaded.exit;
  const config = loaded.config;
  const fallbackVerification: VerificationOutcome =
    config.raw.verification === undefined
      ? { ...VERIFICATION_BOUNDARY, status: "not-configured", checks: [], failure: null }
      : { ...VERIFICATION_BOUNDARY, status: "skipped", checks: [], failure: null };

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
    interactive: false,
    packageManager: flags.pm as UpdateOptions["packageManager"],
    takeUpstream: flags.takeUpstream,
    expectPlan: flags.expectPlan,
    verify: flags.verify,
  };

  // `update()` preserves lifecycle throws as typed command errors (see the
  // module docblock). They land here, project into JSON when requested, and
  // exit 1 rather than becoming a successful "nothing to update" result.
  let result: UpdateResult;
  try {
    result = await update(config, refs, options, createUpdatePorts(streams.stderr));
  } catch (error) {
    const failure =
      error instanceof UpdateCommandError
        ? error
        : {
            kind: "setup-failed" as const,
            message: thrownMessage(error),
            mutated: false,
            paths: undefined,
          };
    if (flags.json === true) {
      streams.stdout(
        renderJson(
          toUpdateJson(
            config.root,
            {
              kind: "failed",
              failure: {
                kind: failure.kind,
                message: failure.message,
                ...(failure.paths === undefined ? {} : { paths: failure.paths }),
              },
              mutated: failure.mutated,
              selected: [],
              skipped: [],
              notes: [],
            },
            false,
            fallbackVerification,
            flags.dryRun === true,
          ),
        ),
      );
      return EXIT_REFUSED;
    }
    streams.stderr("error  update\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  const exit = updateExitCode(result);

  if (flags.json === true) {
    streams.stdout(
      renderJson(
        toUpdateJson(
          config.root,
          result,
          exit === EXIT_OK,
          fallbackVerification,
          flags.dryRun === true,
        ),
      ),
    );
    return exit;
  }

  // Diagnostics, then notes, then skips — widest scope first, and all on stderr
  // so `manteen update --dry-run > plan.txt` captures only what would change.
  if (result.kind === "refused" || result.kind === "attempted") {
    renderDiagnostics(result.plan.diagnostics, result.plan.root, streams.stderr);
  }
  streams.stderr(renderNotes(sortNotes(result.notes)));
  for (const skip of result.skipped) streams.stderr(renderSkip(skip));

  if (result.kind === "failed") {
    streams.stderr(`error  ${result.failure.kind}\n`);
    for (const line of result.failure.message.split("\n")) streams.stderr(`  ${line}\n`);
    return exit;
  }

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
  streams.stderr(renderUpdateStateAdvisory(result.outcome, result.plan));
  if (result.outcome.ok) {
    streams.stderr(renderVerification(result.verification, result.plan.root));
  }

  return exit;
}

/**
 * The five-row table from the module docblock, as code.
 *
 * Exported so the integrator wires the rule rather than re-deriving it, and so
 * it is assertable without a stream.
 */
export function updateExitCode(result: UpdateResult): number {
  if (result.kind === "nothing-to-do") return EXIT_OK;
  if (result.kind === "failed") return EXIT_REFUSED;
  if (result.kind === "refused") {
    // `force: false` deliberately: `plan.diagnostics` has already been
    // downgraded by the aggregator, so re-applying `--force` here would forgive
    // a second time. §1's table puts `no-package-manager` at 2, not 1.
    return blockingExitCode(result.plan.diagnostics, false) === EXIT_USAGE
      ? EXIT_USAGE
      : EXIT_REFUSED;
  }
  if (result.outcome.cancelled) return EXIT_CANCELLED;
  if (!result.outcome.ok) return EXIT_REFUSED;
  return result.verification.status === "failed" ? EXIT_REFUSED : EXIT_OK;
}

export function renderVerification(verification: VerificationOutcome, root: string): string {
  if (verification.status === "not-configured") return "";
  if (verification.status === "skipped") return "skip  verification  --no-verify\n";

  const lines = verification.checks.map(
    (check) =>
      `${verification.status === "planned" && check.result === "not-run" ? "planned" : check.result}  verification  ${check.command}`,
  );
  if (verification.failure !== null) {
    lines.push(`error  verification  ${verification.failure.kind}`);
    for (const line of verification.failure.message.split("\n")) lines.push(`  ${line}`);
    if (verification.failure.kind === "managed-byte-drift") {
      for (const path of verification.failure.paths) lines.push(`  ${toReceiptPath(path, root)}`);
    }
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
