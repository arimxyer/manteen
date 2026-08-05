/**
 * Phase 1 — decide. The only phase that can ask a human anything.
 *
 * Turns each `Disposition` (what plan PREDICTED) into a `WriteResult` (what
 * apply will DO). Three of the four answers are pure functions of the flags;
 * the fourth — a destination that exists with different content, in an
 * interactive run where neither `--overwrite` nor `--no-overwrite` was typed —
 * is the one question that genuinely needs an answer, and it is asked here
 * because D18 puts every decision above every mutation. That ordering is what
 * makes cancelling zero-mutation: phase 2 (deps) has not run, the journal has
 * not opened, and there is no receipt to retract.
 *
 * ONE PROMPT, NOT ONE PER FILE. `manteen add @base/data-grid` over an existing
 * project has three conflicting destinations, and three sequential confirms is
 * three chances to lose track of which file the current question is about. The
 * grouped multiselect shows all of them at once with per-file attribution, so
 * the answer is given against the whole set.
 *
 * PRE-SELECTION: NOTHING. The two options are not symmetric in what a stray
 * Enter costs. With nothing selected (and `required: false`, so an empty
 * submission is accepted) a reflexive Enter keeps every file — a no-op the user
 * can redo with `--overwrite`. With everything selected, the same keystroke
 * destroys files manteen never wrote and, for anything not under version
 * control, destroys them unrecoverably. The cost we are accepting is real and
 * one-sided in the other direction: a user who wants all of them pays `a` (or
 * one keystroke per file), and their durable escape is `--overwrite` / `--yes`,
 * which skip this prompt entirely. Stock shadcn asks per file and defaults to
 * No; this is the same default, asked once.
 *
 * THE THEME IS NOT ON THE LIST, deliberately:
 *
 * - It is not overwritten. D5/D7 FOLD it — `mergeThemeSource` runs with
 *   `prefer: "base"`, so the user's existing values win on every conflicting
 *   leaf and the merge is additive. There is no destruction to consent to, and
 *   the additions are already reported (`theme-conflict` warnings at plan time,
 *   and `--dry-run` prints the whole merge as a unified diff — the only content
 *   preview in the tool, and it exists for exactly this file).
 * - It has no way to say no. `ApplyOutcome.theme` is `{ path, written }` and
 *   `plan/types.ts` is frozen: there is no `skipped` channel for a theme, so a
 *   declined theme could not be reported without lying about it.
 * - Phase 4 is its own phase for the same reason. A theme entry among these
 *   checkboxes would read as "replace my theme?", which is the one thing the
 *   fold exists to never do.
 *
 * `--dry-run` RUNS THIS PHASE BUT DOES NOT ASK. A dry run writes nothing, so
 * the answer cannot change anything: `cli/index.ts`'s `renderDryRun` reads
 * `plan.files[].disposition` rather than the outcome, and both answers were
 * measured to produce byte-identical stdout and a byte-identical tree. What the
 * question DID change was whether a preview terminates — under a pty with
 * nobody at the keyboard, `manteen add … --dry-run` sat on a rendered
 * multiselect forever, having asked for consent to a replacement that cannot
 * occur ("N existing files would be replaced" — none would). A preview that
 * blocks is not a preview.
 *
 * This is a scoped reading of D19, not a deviation from it. D19 reaches into
 * apply for PHASE 0: its stated rationale is that "the uniqueness, containment
 * and hash invariants live in apply's preflight as defence in depth" and that a
 * plan-only dry run "structurally cannot report the collision it exists to
 * preview". Phase 1 is named in D19 for sequencing — it is where a decision
 * would go — not because soliciting one is the point. It still runs; it just has
 * no human to consult.
 *
 * The undecided destinations resolve to `skipped`, which the earlier design read
 * as a lie ("neither `written` nor `skipped` is true of an undecided conflict").
 * That argument does not survive the fact that under `dryRun`, `files` is
 * ALREADY a forecast rather than an observation — a `create` destination reports
 * `written` today and nothing was written, which `cli/index.ts` states outright.
 * As a forecast, `skipped` is the conservative and correct one: nothing is
 * replaced until someone answers, and a dry run never asks.
 */
import type { ApplyOptions, CanonicalId, Plan, PlannedFile, WriteResult } from "../plan/types";
import { toReceiptPath } from "../receipt/path";
import { CANCELLED, cancelled, multiselect } from "../ui";

/** One conflicting destination, as the prompt needs to render it. */
export interface OverwriteCandidate {
  /**
   * ABSOLUTE — the key `decideWrites` returns and `write-files.ts` looks up.
   * The port answers with these verbatim rather than with indices, so a port
   * that reorders or filters its input cannot silently mis-assign an answer.
   */
  destination: string;
  /** Root-relative POSIX. What a human reads; never join against it. */
  label: string;
  /** Attribution — one of the four true things (see `hintFor`). */
  hint: string;
  itemId: CanonicalId;
}

export interface OverwriteRequest {
  message: string;
  /** Never empty, and never contains an `identical` or `create` destination. */
  candidates: OverwriteCandidate[];
}

/**
 * What the port answers.
 *
 * `overwrite` holds the ABSOLUTE destinations the user chose to replace;
 * everything not in it is kept. `{ cancelled: false, overwrite: [] }` is a
 * complete, valid answer — "none of them" — and is a different outcome from
 * `{ cancelled: true }`, which means the user walked away. That is the
 * difference between exit 0 with every file `skipped` and exit 130 with nothing
 * attempted, so the two must not collapse into one empty-ish value.
 *
 * A discriminated union rather than `src/ui.ts`'s `CANCELLED` symbol, which is
 * what the clack wrappers speak. A `Symbol()` has identity, not structure: a
 * caller that cannot import the exact instance cannot construct the value, and
 * the e2e tier reaches `apply()` through the built `dist/index.mjs`, which
 * re-exports `apply` and not the ui facade. A port whose cancel case is
 * unconstructible by its own tests is a port that only ever gets its happy path
 * tested. Discriminating is still a compile error to skip, which is the property
 * the symbol was chosen for; the symbol stays at the clack edge, below.
 */
export type OverwriteAnswer = { cancelled: true } | { cancelled: false; overwrite: string[] };

/**
 * Phase 1's injected port: the grouped overwrite question.
 *
 * It exists as a port and not as a direct `multiselect` call so the whole
 * decision matrix is exercisable in-process, under real node, without a
 * pseudo-terminal. A prompt that can only be driven through a pty is a prompt
 * that does not get tested.
 */
export type OverwritePrompt = (request: OverwriteRequest) => Promise<OverwriteAnswer>;

/**
 * Phase 1's result.
 *
 * A union rather than a nullable map because the two outcomes lead to different
 * exit codes and there is no sensible `results` for a cancellation — apply must
 * return before phase 2, not proceed with an empty decision set.
 */
export type Decision =
  | { cancelled: false; results: ReadonlyMap<string, WriteResult> }
  | { cancelled: true; results: null };

export async function decideWrites(
  plan: Plan,
  options: ApplyOptions,
  prompt?: OverwritePrompt,
): Promise<Decision> {
  const results = new Map<string, WriteResult>();
  /** Disposition `overwrite` with no flag answer — the prompt's whole input. */
  const undecided: PlannedFile[] = [];

  for (const file of plan.files) {
    switch (file.disposition) {
      case "identical":
        // Never offered: the bytes on disk already equal what we would write, so
        // there is nothing to decide. It is still an ownership claim, which is
        // why it is recorded rather than dropped — see write-files.ts.
        results.set(file.destination, "identical");
        break;
      case "create":
        results.set(file.destination, "written");
        break;
      case "overwrite":
        // `--yes` arrives here already folded into `overwrite: true` by
        // `cli/index.ts`; `--force` never does, because it is a different axis
        // and `destination-exists` is not forceable.
        if (options.overwrite === true) results.set(file.destination, "written");
        else if (options.overwrite === "no") results.set(file.destination, "skipped");
        else undecided.push(file);
        break;
    }
  }

  if (undecided.length === 0) return { cancelled: false, results };

  // D19 — see the module comment. Above BOTH wiring assertions below on purpose:
  // a dry run is read-only, so it must not need a terminal and must not need a
  // port. `apply()`'s dry-run return is still the thing that stops phase 2.
  if (options.dryRun === true) {
    for (const file of undecided) results.set(file.destination, "skipped");
    return { cancelled: false, results };
  }

  if (!options.interactive) throw new Error(nonInteractiveMessage(undecided, plan.root));
  if (prompt === undefined) throw new Error(missingPortMessage(undecided, plan.root));

  const answer = await prompt({
    message: promptMessage(undecided.length),
    candidates: undecided.map((file) => ({
      destination: file.destination,
      label: toReceiptPath(file.destination, plan.root),
      hint: hintFor(file),
      itemId: file.itemId,
    })),
  });

  if (answer.cancelled) return { cancelled: true, results: null };

  // Driven off `undecided`, not off the answer: a port that returns a
  // destination we never offered cannot introduce a decision, and one that
  // omits a destination it WAS offered still gets the safe default. Both are
  // port bugs, and neither may reach `write-files.ts` as a missing key — which
  // it throws on, correctly, but only after phase 2 has already installed.
  const chosen = new Set(answer.overwrite);
  for (const file of undecided) {
    results.set(file.destination, chosen.has(file.destination) ? "written" : "skipped");
  }

  return { cancelled: false, results };
}

function promptMessage(count: number): string {
  const files = count === 1 ? "file" : "files";
  return (
    `${count} existing ${files} would be replaced. Select the ones to overwrite — ` +
    `anything left unselected is kept as it is.`
  );
}

/**
 * The four true things the hint can say, and no fifth.
 *
 * A terse twin of `plan/index.ts`'s `describeOwner`, which composes the same
 * four facts into the prose of the `destination-exists` diagnostic. They are not
 * shared because they are not the same string: that one is a sentence fragment
 * inside a message that has already named the file, this one is a column beside
 * it. Keeping one function and formatting at the call site would put diagnostic
 * grammar into the prompt's layout.
 *
 * The fourth case is the one worth naming: same item, same hash as the receipt
 * records, yet the content differs — nobody edited the file, the registry item
 * changed. That is an update, and saying "modified since manteen wrote it"
 * about it would accuse the user of an edit they did not make.
 */
function hintFor(file: PlannedFile): string {
  const owner = file.priorOwner;
  if (owner === null) return "not installed by manteen";

  const from = owner.registry === null ? "" : ` from ${owner.registry}`;
  if (owner.itemId !== file.itemId) return `installed by ${owner.itemId}${from}`;

  const drifted = file.existing !== null && file.existing.sha256 !== owner.installedSha256;
  return drifted
    ? `installed by ${owner.itemId}${from}, edited since`
    : `installed by ${owner.itemId}${from}, item changed upstream`;
}

/** Root-relative, and bounded — a 200-node plan must not print 200 paths here. */
const MAX_LISTED = 5;

function listPaths(files: readonly PlannedFile[], root: string): string {
  const paths = files.map((file) => toReceiptPath(file.destination, root));
  if (paths.length <= MAX_LISTED) return paths.join(", ");
  return `${paths.slice(0, MAX_LISTED).join(", ")} (+${paths.length - MAX_LISTED} more)`;
}

/**
 * Unreachable, and a wiring assertion rather than user advice.
 *
 * §1's refusal table makes `destination-exists` + non-interactive + neither flag
 * a plan-stage error, so `plan.ok` is false and `apply()` returns from its first
 * line. The user-facing message — which names BOTH flags, because a CI user
 * cannot see a prompt and has to pick one — is `checkDestinations`' in
 * `plan/index.ts`. Restating it here would be a second place for that advice to
 * drift; what this says instead is which gate failed to run.
 */
function nonInteractiveMessage(files: readonly PlannedFile[], root: string): string {
  return (
    `apply: ${listPaths(files, root)} exist with different content in a non-interactive run with ` +
    `neither --overwrite nor --no-overwrite. The destination-exists gate refuses that combination ` +
    `(§1's refusal table), so plan.ok would be false and apply returns before phase 1 — reaching ` +
    `here means the gate did not run.`
  );
}

/** Also unreachable: `apply()` defaults the port to the clack implementation. */
function missingPortMessage(files: readonly PlannedFile[], root: string): string {
  return (
    `apply: ${listPaths(files, root)} need an overwrite decision and no prompt port was ` +
    `provided. Phase 1 refuses rather than guessing: writing would destroy the user's file and ` +
    `skipping would silently drop a file they asked for.`
  );
}

/**
 * The real port. `apply()` wires this by default; tests inject their own.
 *
 * `required: false` is load-bearing, not a default worth inheriting: clack
 * refuses an empty submission when it is true, and an empty selection here is a
 * complete answer — the user declining every one of them.
 *
 * The cancel banner is printed HERE rather than in `cli/index.ts` because this
 * is the only frame that knows a clack prompt is on screen. clack's cancel
 * closes the open prompt block; printing it from a caller that may have had no
 * prompt at all would emit a bare "Operation cancelled" bar under nothing.
 */
export const clackOverwritePrompt: OverwritePrompt = async (request) => {
  const answer = await multiselect<string>({
    message: request.message,
    options: request.candidates.map((candidate) => ({
      value: candidate.destination,
      label: candidate.label,
      hint: candidate.hint,
    })),
    // Empty on purpose — see PRE-SELECTION in the module comment.
    initialValues: [],
    required: false,
  });

  if (answer === CANCELLED) {
    cancelled("Cancelled — nothing was installed and nothing was written.");
    return { cancelled: true };
  }
  return { cancelled: false, overwrite: answer };
};
