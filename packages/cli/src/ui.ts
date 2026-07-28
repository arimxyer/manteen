/**
 * The clack facade, and the one place interactivity is decided.
 *
 * Two jobs, both of which exist because their failure modes are silent:
 *
 * 1. `isInteractive` is the SINGLE predicate. Every prompt in the codebase is
 *    gated on the value it returns, computed once in `cli/index.ts` and threaded
 *    down as `PlanOptions.interactive` / `ApplyOptions.interactive`. A module
 *    that re-derives "am I interactive?" from `process.stdout.isTTY` is a bug —
 *    `--yes` and `CI` would not reach it.
 *
 * 2. The prompt wrappers normalize clack's cancellation. clack returns a
 *    `symbol` when the user hits Ctrl-C, which is truthy, so a forgotten
 *    `isCancel()` check does not throw — it proceeds with a symbol where a
 *    boolean or an array was expected. Returning `CANCELLED` from a union type
 *    makes the check a compile error to skip.
 *
 * Rendering does NOT live here. Diagnostics and the write report are printed by
 * `cli/index.ts`; clack's `log.*` writes to stdout behind a gutter glyph, and
 * diagnostics have to be greppable on stderr.
 */
import {
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  multiselect as clackMultiselect,
  note as clackNote,
  outro as clackOutro,
  type Option as ClackOption,
} from "@clack/prompts";

/**
 * Returned in place of an answer when the user cancels.
 *
 * The CLI maps this to exit 130. It is a distinct value rather than `null`
 * because "the user said no" and "the user walked away" are different outcomes
 * and only the second one is a cancellation.
 */
export const CANCELLED = Symbol("manteen.cancelled");
export type Cancelled = typeof CANCELLED;

/**
 * @clack/prompts 1.7 defines this as `process.env.CI === "true"` — an exact
 * string comparison. `CI=1`, `CI=yes` and `CI=on` are all FALSE, so a harness
 * that sets one of those takes the *interactive* branch and then blocks forever
 * on a prompt nobody can answer.
 *
 * D14 makes `CI=true` a stated invariant rather than an e2e implementation
 * detail for exactly that reason. Reimplemented here instead of imported so
 * `env` arrives as a parameter and the predicate stays testable in both
 * directions.
 */
export function isCI(env: Record<string, string | undefined>): boolean {
  return env.CI === "true";
}

/**
 * D14: `isTTY && !isCI() && !--yes`.
 *
 * `isTTY` must be true for BOTH stdin and stdout — clack reads keystrokes from
 * one and draws to the other, and a piped stdout with a TTY stdin renders the
 * prompt into the pipe.
 */
export function isInteractive(input: {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  yes: boolean;
}): boolean {
  return input.isTTY && !isCI(input.env) && !input.yes;
}

/**
 * The CLI's single ambient read of TTY state and `process.env`.
 *
 * Everything downstream receives the boolean. Kept next to the pure predicate so
 * the two cannot disagree about which streams count.
 */
export function interactiveFromProcess(options: { yes: boolean }): boolean {
  return isInteractive({
    isTTY: Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY),
    env: process.env,
    yes: options.yes,
  });
}

export function intro(message: string): void {
  clackIntro(message);
}

export function outro(message: string): void {
  clackOutro(message);
}

/** clack's argument order is (body, title); ours is the one every caller guesses. */
export function note(title: string, body: string): void {
  clackNote(body, title);
}

/** The "Operation cancelled" line clack prints before the process exits 130. */
export function cancelled(message: string): void {
  clackCancel(message);
}

export async function confirm(input: {
  message: string;
  initial?: boolean;
}): Promise<boolean | Cancelled> {
  const answer = await clackConfirm({
    message: input.message,
    initialValue: input.initial ?? true,
  });
  return isCancel(answer) ? CANCELLED : answer;
}

/**
 * `{ value, label?, hint? }`, aliased from clack rather than redeclared.
 *
 * Its own type is conditional on `Value extends Primitive` — `label` is optional
 * for a string/number/boolean value and required otherwise — and a hand-written
 * structural twin is not assignable to a deferred conditional type when the
 * value type is still a type parameter. Aliasing makes the pass-through an
 * identity instead of a cast.
 */
export type Choice<T> = ClackOption<T>;

export async function multiselect<T>(input: {
  message: string;
  options: Choice<T>[];
  initialValues?: T[];
  /** clack refuses an empty submission when true. Overwrite prompts want false:
   *  selecting nothing is the user declining every one of them. */
  required?: boolean;
}): Promise<T[] | Cancelled> {
  const answer = await clackMultiselect<T>({
    message: input.message,
    options: input.options,
    initialValues: input.initialValues ?? [],
    required: input.required ?? false,
  });
  return isCancel(answer) ? CANCELLED : answer;
}
