/**
 * `apply()` — the only stage that writes.
 *
 * Phase order (D18, extended by §5a's receipt):
 *
 *   0 preflight    read-only; re-hash, re-prove containment and uniqueness
 *   1 decide       read-only; every question the user could be asked is asked here
 *   2 install deps subprocess, OUTSIDE the journal
 *   3 write files  ┐
 *   4 write theme  ├ one shared pre-image journal
 *   5 write receipt┘
 *
 * Two properties of that order are load-bearing rather than stylistic:
 *
 * - **All decisions precede all mutations**, so cancelling is always
 *   zero-mutation and `--dry-run` (D19) is a real preview rather than a
 *   different code path — it runs 0 and 1 and stops.
 * - **The receipt is the final mutation.** A rollback therefore cannot leave a
 *   receipt describing files that no longer exist, and a SIGKILL leaves one that
 *   under-claims. Under-claiming costs a redundant overwrite prompt; over-claiming
 *   authorizes a future run to silently replace content manteen never wrote.
 *   Every early exit in this function sits ABOVE phase 5 for that reason.
 *
 * Deps are not rolled back (D18). A package manager is not transactional, so
 * `removeDependency` after a partial install can remove something that was
 * already there — and a leftover dependency is inert, while source importing a
 * package that is not installed is a broken build.
 */
// The settled design labels this module `src/plan/receipt.ts`; it landed as
// `src/receipt/write.ts`, with the impure fs + ajv half split into
// `src/receipt/load.ts`. The split is the purity boundary that label was arguing
// for, so the path moved rather than the design.
import { mergeReceipt, serializeReceipt } from "../receipt/write";
import type { ApplyFn, ApplyOptions, ApplyOutcome, Plan, WriteResult } from "../plan/types";
import { installDeps } from "./install-deps";
import { createJournal } from "./journal";
import { preflight } from "./preflight";
import { writeFiles } from "./write-files";

/**
 * Phase 1. Turns each `Disposition` (what plan PREDICTED) into a `WriteResult`
 * (what apply will DO) using only the flags — the decision rules that do not
 * need a human.
 *
 * SEAM: `src/apply/decide.ts` replaces this with the grouped multiselect from
 * `src/ui.ts` for the one case below that genuinely needs an answer. Exported so
 * that swap is a one-line change at the call site rather than a rewrite.
 */
export function decideWrites(plan: Plan, options: ApplyOptions): ReadonlyMap<string, WriteResult> {
  const results = new Map<string, WriteResult>();

  for (const file of plan.files) {
    switch (file.disposition) {
      case "identical":
        // Not a write, but still an ownership claim — see write-files.ts.
        results.set(file.destination, "identical");
        break;
      case "create":
        results.set(file.destination, "written");
        break;
      case "overwrite":
        if (options.overwrite === true) results.set(file.destination, "written");
        else if (options.overwrite === "no") results.set(file.destination, "skipped");
        else throw new Error(overwriteSeamMessage(file.destination, options));
        break;
    }
  }

  return results;
}

function overwriteSeamMessage(destination: string, options: ApplyOptions): string {
  if (options.interactive) {
    return (
      `apply: ${destination} exists with different content and no overwrite decision is available.\n` +
      `The grouped overwrite prompt is phase 1's job and lives in src/apply/decide.ts, which has ` +
      `not landed yet. Refusing rather than guessing: writing would destroy the user's file and ` +
      `skipping would silently drop a file they asked for. Pass --overwrite or --no-overwrite.`
    );
  }
  return (
    `apply: ${destination} exists with different content in a non-interactive run with neither ` +
    `--overwrite nor --no-overwrite. The destination-exists gate refuses that combination (§1's ` +
    `refusal table), so plan.ok would be false and apply returns before phase 1 — reaching here ` +
    `means the gate did not run.`
  );
}

/**
 * The one phase that still has no implementation, checked BEFORE the journal
 * opens so a throw can never be caught by the unwind and mislabeled
 * `write-failed`.
 *
 * Phase 2's row is gone from here because `src/apply/install-deps.ts` landed;
 * this is now phase 4 alone. It is a `throw`, not a fifth `ApplyFailureKind`:
 * the four kinds are runtime outcomes a user can act on, while "this build of
 * apply has no theme writer but was handed a plan with a changed theme" is a
 * composition bug in our own wiring, and giving it a user-facing refusal code
 * would put it in the refusal table.
 */
function assertPhasesWired(plan: Plan): void {
  if (plan.theme !== null && plan.theme.changed) {
    throw new Error(
      `apply: the plan folds a theme into ${plan.theme.destination} and phase 4 ` +
        `(src/apply/write-theme.ts) has not landed. The fold itself already ran in plan() (D7); what ` +
        `is missing is one journalled write of plan.theme.text.`,
    );
  }
}

function emptyOutcome(plan: Plan, options: ApplyOptions): ApplyOutcome {
  return {
    ok: false,
    cancelled: false,
    dryRun: options.dryRun === true,
    files: [],
    // `command` is what apply RAN, not what it could run — null until phase 2
    // actually shells out. `plan.installCommand` is the printed escape hatch and
    // belongs to the reporter.
    dependencies: { installed: false, command: null },
    theme: plan.theme === null ? null : { path: plan.theme.destination, written: false },
    receipt: { path: plan.receipt.path, written: false },
    failure: null,
  };
}

function outcomeFiles(plan: Plan, results: ReadonlyMap<string, WriteResult>): ApplyOutcome["files"] {
  return plan.files.map((file) => {
    const result = results.get(file.destination);
    if (result === undefined) throw new Error(`apply: phase 1 recorded no decision for ${file.destination}.`);
    return { destination: file.destination, result };
  });
}

async function applyPlan(plan: Plan, options: ApplyOptions): Promise<ApplyOutcome> {
  // `apply()` reads plan.ok and never re-derives a verdict (§1). `failure` stays
  // null on purpose: the reason is already in plan.diagnostics, and ApplyFailure
  // is for things that go wrong in THIS stage.
  if (!plan.ok) return emptyOutcome(plan, options);

  // ---- phase 0: preflight (read-only) --------------------------------------
  const stale = preflight(plan);
  if (stale !== null) return { ...emptyOutcome(plan, options), failure: stale };

  // ---- phase 1: decide (read-only) -----------------------------------------
  const results = decideWrites(plan, options);
  const files = outcomeFiles(plan, results);

  // D19: a dry run has now done everything that can be done without writing —
  // including the uniqueness, containment and hash checks a plan-only preview
  // structurally cannot report. The decisions ride out so the preview can show
  // what each destination would get.
  //
  // It returns ABOVE both the seam check and the install deliberately. The
  // check exists to stop a run that would mutate the tree from silently
  // skipping a phase, and a dry run mutates nothing; `installDeps` enforces the
  // same boundary from its own side and throws if it is ever reached with
  // `dryRun`, so the two cannot drift into disagreeing about where D19 stops.
  if (options.dryRun === true) {
    return { ...emptyOutcome(plan, options), ok: true, files };
  }

  assertPhasesWired(plan);

  // ---- phase 2: install dependencies (outside the journal) -----------------
  // Before the journal opens, and its failure returns before it opens: a failed
  // install has written nothing, so there is nothing to unwind, and D18 keeps
  // the dependencies it did add rather than removing packages the project may
  // already have depended on.
  const deps = await installDeps(plan, options);
  // Carried onto EVERY return below, including the failing ones. It is the only
  // record of which batch already touched the user's package.json — dropping it
  // on the failure path is precisely where it matters most.
  const dependencies = { installed: deps.installed, command: deps.command };

  if (deps.failure !== null) {
    return { ...emptyOutcome(plan, options), files, dependencies, failure: deps.failure };
  }

  const journal = createJournal();
  let receiptWritten = false;

  try {
    // ---- phase 3: write files ----------------------------------------------
    writeFiles(plan.files, results, journal);

    // ---- phase 4: write theme ----------------------------------------------
    // SEAM: src/apply/write-theme.ts plugs in here with a single
    // `journal.write(plan.theme.destination, plan.theme.text)` — D7 put the whole
    // merge in plan(), so apply writes `text` verbatim and sets `themeWritten`.
    // `assertPhasesWired` refuses to reach this point with `changed === true`, so
    // `false` is the only state this build can be in; it is not a skip of work
    // that was asked for. A theme with `changed === false` is genuinely nothing
    // to write (the base on disk already equals the fold), which is why that case
    // passes the assertion.
    const themeWritten = false;

    // ---- phase 5: write receipt --------------------------------------------
    // An unreadable receipt forced past merges from `null`: the prior records are
    // discarded, which the receipt-unreadable diagnostic states before the user
    // forces.
    const prior = plan.receipt.present && plan.receipt.ok ? plan.receipt.receipt : null;
    const priorRaw = plan.receipt.present ? plan.receipt.raw : null;

    // `results` rather than the plan, because a `PlannedFile` with disposition
    // `overwrite` may never have been written. Recording its sha256 would claim
    // content we did not write and authorize a future silent overwrite of a file
    // that is entirely the user's.
    const text = serializeReceipt(mergeReceipt(prior, plan, results, themeWritten));

    // Gated on bytes and on NOTHING else. Not on "any file was written", not on
    // plan.theme.changed: a project installed before receipts existed reports
    // every destination `identical`, writes no files at all, and is exactly the
    // project that most needs its ownership recorded. Serialize-compare-then-
    // journal, in that order, so a no-op leaves no journal entry to unwind.
    if (text !== priorRaw) {
      journal.write(plan.receipt.path, text);
      receiptWritten = true;
    }
  } catch (error) {
    const touched = journal.entries().map((entry) => entry.destination);
    const detail = error instanceof Error ? error.message : String(error);
    const unwound = journal.unwind();

    if (!unwound.ok) {
      return {
        ...emptyOutcome(plan, options),
        files,
        dependencies,
        failure: {
          kind: "rollback-failed",
          message:
            `${detail}\nThe rollback then failed, so the tree may be inconsistent: ` +
            `${unwound.detail ?? "no detail"}\nRestore with: git checkout -- ${unwound.unrestored.join(" ")}`,
          paths: unwound.unrestored,
        },
      };
    }

    return {
      ...emptyOutcome(plan, options),
      files,
      dependencies,
      failure: {
        kind: "write-failed",
        message: `${detail}\nEvery file written by this run was restored to its previous contents.`,
        paths: touched,
      },
    };
  }

  return {
    ...emptyOutcome(plan, options),
    ok: true,
    files,
    dependencies,
    receipt: { path: plan.receipt.path, written: receiptWritten },
  };
}

/**
 * `cancelled` is never true in this build — it belongs to the phase-1 prompt,
 * which returns clack's cancel symbol and exits 130 before phase 2. It is on the
 * outcome now rather than added later because every caller's exit-code mapping
 * reads it.
 */
export const apply = applyPlan satisfies ApplyFn;
