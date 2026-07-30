/**
 * `apply()` — the only stage that writes.
 *
 * Phase order (D18, extended by §5a's receipt):
 *
 *   0 preflight    read-only; re-hash, re-prove containment and uniqueness
 *   1 decide       read-only; every question the user could be asked is asked here
 *                  (`decide.ts` — one grouped overwrite prompt, behind a port)
 *   2 install deps subprocess, OUTSIDE the journal
 *   3 write files  ┐
 *   4 write theme  ├ one shared pre-image journal
 *   5 write receipt┘
 *
 * Phase 4 is one `journal.write` of `plan.theme.text` and nothing more. It has
 * no `write-theme.ts` module because there is nothing for one to hold: D7 put
 * the entire merge in `plan()`, so the only decision left here is whether
 * `changed` is true.
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

import type { ApplyFn, ApplyOptions, ApplyOutcome, Plan, WriteResult } from "../plan/types";
import { mergeReceipt, serializeReceipt } from "../receipt/write";
import { clackOverwritePrompt, decideWrites, type OverwritePrompt } from "./decide";
import { installDeps } from "./install-deps";
import { createJournal } from "./journal";
import { preflight } from "./preflight";
import { writeFiles } from "./write-files";
import { writeStyles } from "./write-styles";
import { writeTheme } from "./write-theme";

export type {
  Decision,
  OverwriteAnswer,
  OverwriteCandidate,
  OverwritePrompt,
  OverwriteRequest,
} from "./decide";
export { decideWrites } from "./decide";

/**
 * The impure edges apply() is allowed to have injected.
 *
 * Exactly one today, and the bar for a second is high: a port earns its place
 * when the alternative is a test that needs a terminal, a network, or a clock.
 * `installDeps` deliberately is NOT one — it already refuses to run under
 * `dryRun`, and the e2e tier proves the no-install case by asserting no lockfile
 * appeared, which is evidence about the project rather than about a stub.
 */
export interface ApplyPorts {
  /**
   * Phase 1's grouped overwrite question. Defaulted to the clack implementation
   * so the shipped CLI needs no wiring, and overridable so the whole decision
   * matrix — decline all, take a subset, cancel — is exercisable in-process
   * under real node without a pseudo-terminal.
   */
  prompt: OverwritePrompt;
}

const CLACK_PORTS: ApplyPorts = { prompt: clackOverwritePrompt };

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
    styles: plan.styles === null ? null : { path: plan.styles.destination, written: false },
    receipt: { path: plan.receipt.path, written: false },
    failure: null,
  };
}

function outcomeFiles(
  plan: Plan,
  results: ReadonlyMap<string, WriteResult>,
): ApplyOutcome["files"] {
  return plan.files.map((file) => {
    const result = results.get(file.destination);
    if (result === undefined)
      throw new Error(`apply: phase 1 recorded no decision for ${file.destination}.`);
    return { destination: file.destination, result };
  });
}

/*
 * WHY EVERY FAILURE RETURN BELOW SETS `files: []`.
 *
 * (A plain block rather than a doc comment: it documents three returns inside
 * `applyPlan`, not the declaration that follows it.)
 *
 * `outcomeFiles` above projects phase 1's DECISIONS, which is the truth only on
 * a return that carried them out. Carrying that projection onto a failure return
 * is how a run that wrote nothing printed `written  src/components/ui/…` on
 * stdout while its own stderr said the tree had been restored — `cli/index.ts`
 * documents `renderOutcome` as printing "what apply() OBSERVED", and a
 * rolled-back destination was observed as not-written. `manteen add … >
 * report.txt` captured only the half that lied.
 *
 * `WriteResult` is `written | identical | skipped` and `plan/types.ts` is
 * frozen, so there is no value for "attempted, then unwound" and no value for
 * "we no longer know". Two rejected alternatives, both of which trade one false
 * claim for another:
 *
 * - Re-map `written` to `skipped`. The contract defines `skipped` as the user
 *   declining, so a consumer still could not tell a decline from a failure.
 * - Report the `rollback-failed` unrestored set as `written`, on the theory that
 *   those destinations hold our bytes. THEY MAY NOT: `journal.write` pushes its
 *   entry BEFORE calling `place()` (journal.ts, deliberately — a rename that
 *   fails halfway must still be covered), so a write that failed outright is
 *   still journalled, and its unwind then fails for the same reason the write
 *   did. Measured: a run whose destination directory is read-only reports that
 *   destination as unrestored while the file on disk is the user's original,
 *   byte for byte. `unrestored` means "could not prove the pre-image is back",
 *   not "we wrote it".
 *
 * So the outcome claims nothing about files, which is the same shape — and the
 * same reason — as the cancel return: no decision was carried out. Nothing is
 * lost. `ApplyFailure.paths` still carries the touched set (`write-failed`) and
 * the unrestored set (`rollback-failed`), and only the failure channel can say
 * "this one is now indeterminate, run `git checkout --` on it", which is the
 * sentence a `WriteResult` cannot form.
 */

/**
 * `ports` is a THIRD, OPTIONAL parameter rather than a field on `ApplyOptions`
 * because `plan/types.ts` is frozen — and it stays optional so `apply` still
 * satisfies `ApplyFn`, whose two-parameter shape every caller's mapping is
 * written against (TypeScript ignores trailing optional parameters when
 * checking arity, so the `satisfies` below is a real check, not a widened one).
 */
async function applyPlan(
  plan: Plan,
  options: ApplyOptions,
  ports: ApplyPorts = CLACK_PORTS,
): Promise<ApplyOutcome> {
  // `apply()` reads plan.ok and never re-derives a verdict (§1). `failure` stays
  // null on purpose: the reason is already in plan.diagnostics, and ApplyFailure
  // is for things that go wrong in THIS stage.
  if (!plan.ok) return emptyOutcome(plan, options);

  // ---- phase 0: preflight (read-only) --------------------------------------
  const stale = preflight(plan);
  if (stale !== null) return { ...emptyOutcome(plan, options), failure: stale };

  // ---- phase 1: decide (read-only) -----------------------------------------
  const decision = await decideWrites(plan, options, ports.prompt);

  // The cancel return sits ABOVE phase 2, which is the entire reason phase 1 is
  // ordered before it: no dependency was installed, no journal was opened, no
  // receipt was touched. `ok` stays false — a cancelled run did not apply — and
  // `cli/index.ts` reads `cancelled` first and exits 130 without printing a
  // write report for writes that never happened.
  if (decision.cancelled) return { ...emptyOutcome(plan, options), cancelled: true };

  const results = decision.results;
  const files = outcomeFiles(plan, results);

  // D19: a dry run has now done everything that can be done without writing —
  // including the uniqueness, containment and hash checks a plan-only preview
  // structurally cannot report. The decisions ride out so the preview can show
  // what each destination would get — as a FORECAST, not an observation: a
  // `create` destination reads `written` here and nothing was written, and an
  // undecided conflict reads `skipped` because phase 1 does not ask under
  // `dryRun` (decide.ts). `renderDryRun` reads the Plan, so a CLI user sees the
  // Disposition either way and only a programmatic caller reads this back.
  //
  // It returns ABOVE the install deliberately, and `theme.written` stays false
  // on the way out: a dry run mutates nothing, so a preview that claimed the
  // theme was written would be describing a file that still holds its old text.
  // `installDeps` enforces the same boundary from its own side and throws if it
  // is ever reached with `dryRun`, so the two cannot drift into disagreeing
  // about where D19 stops.
  if (options.dryRun === true) {
    return { ...emptyOutcome(plan, options), ok: true, files };
  }

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
    // `files: []` — not phase 1's decisions. The install failed BEFORE the
    // journal opened, so not one destination was touched, which is exactly what
    // this failure's own message tells the user.
    return { ...emptyOutcome(plan, options), dependencies, failure: deps.failure };
  }

  const journal = createJournal();
  // Both declared OUTSIDE the try, because both are read by the success return
  // below and a `let` inside a block is not in scope there. They are also the
  // two flags whose default must be `false`: every failure path unwinds the
  // journal, so a run that threw wrote neither.
  let themeWritten = false;
  let stylesWritten = false;
  let receiptWritten = false;

  try {
    // ---- phase 3: write files ----------------------------------------------
    writeFiles(plan.files, results, journal);

    // ---- phase 4: write theme ----------------------------------------------
    // `journal`, the SAME one phase 3 just wrote through — not a second journal.
    // That is what makes a phase-5 failure unwind the folded theme along with the
    // components it was folded for, and it is asserted from both directions in
    // `e2e/gates.node-e2e.mjs`. The rest of the rule lives in write-theme.ts.
    themeWritten = writeTheme(plan.theme, journal);

    // ---- phase 5: write managed package styles -----------------------------
    stylesWritten = writeStyles(plan.styles, journal);

    // ---- phase 6: write receipt --------------------------------------------
    // An unreadable receipt forced past merges from `null`: the prior records are
    // discarded, which the receipt-unreadable diagnostic states before the user
    // forces.
    const prior = plan.receipt.present && plan.receipt.ok ? plan.receipt.receipt : null;
    const priorRaw = plan.receipt.present ? plan.receipt.raw : null;

    // `results` rather than the plan, because a `PlannedFile` with disposition
    // `overwrite` may never have been written. Recording its sha256 would claim
    // content we did not write and authorize a future silent overwrite of a file
    // that is entirely the user's.
    const text = serializeReceipt(mergeReceipt(prior, plan, results, themeWritten, stylesWritten));

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
        // `files: []` — the one failure where the per-destination state is
        // genuinely UNKNOWN, and the enum has no word for it. `unwound.unrestored`
        // below says which ones, in the channel that can also say what to do.
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
      // Every pre-image is back on disk, so nothing this run decided to write
      // survives it. `touched` below still names what was attempted.
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
    // `emptyOutcome` hardcodes `written: false` for both of these, so a success
    // that does not override them reports a theme it just wrote as unwritten.
    // Every OTHER return in this function keeps the `false` correctly — the
    // journal unwound, or nothing ran at all.
    theme: plan.theme === null ? null : { path: plan.theme.destination, written: themeWritten },
    styles: plan.styles === null ? null : { path: plan.styles.destination, written: stylesWritten },
    receipt: { path: plan.receipt.path, written: receiptWritten },
  };
}

/**
 * `cancelled` is set by exactly one path: the phase-1 prompt returning clack's
 * cancel symbol. It is never inferred from an empty selection — selecting no
 * files is a complete answer ("keep all of them", exit 0 with everything
 * `skipped`), and collapsing the two would map a deliberate decline onto 130.
 */
export const apply = applyPlan satisfies ApplyFn;
