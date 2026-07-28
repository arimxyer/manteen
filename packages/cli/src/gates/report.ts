/**
 * The gate aggregator: every diagnostic the run produced in, one verdict out.
 *
 * `plan.ok` is computed HERE and nowhere else (§1). `apply()` reads it and never
 * re-derives a verdict, and neither does the CLI — a second implementation of
 * this rule is a second answer to "was this run refused?", and the two would
 * eventually disagree on a forceable error.
 *
 * PURE. `--force` arrives as a parameter, like every other piece of ambient
 * state a gate sees.
 */
import { downgradeForced, sortDiagnostics } from "../plan/diagnostics";
import type { Diagnostic } from "../plan/types";

export interface GateReport {
  /** Sorted, with `--force` already applied. This is what lands on the Plan. */
  diagnostics: Diagnostic[];
  ok: boolean;
}

/**
 * `--force` is applied BEFORE the verdict, and it never silences anything: a
 * forceable error becomes a warning and is still printed and still carried in
 * `--json`. That is why `ok` can then be the plain "no errors left" test rather
 * than re-consulting the flag — after the downgrade there is nothing left for
 * the flag to say.
 */
export function aggregate(diagnostics: readonly Diagnostic[], force: boolean): GateReport {
  const applied = sortDiagnostics(downgradeForced(diagnostics, force));
  return { diagnostics: applied, ok: applied.every((d) => d.severity !== "error") };
}
