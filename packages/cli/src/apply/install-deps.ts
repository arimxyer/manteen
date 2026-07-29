/**
 * Phase 2 — dependency installation. The only phase that spawns a subprocess,
 * and the only one deliberately left OUTSIDE the pre-image journal (D18).
 *
 * It runs before a single byte is written, because the failure this ordering
 * prevents is asymmetric: a leftover dependency is inert, while source importing
 * a package that is not installed is a broken build. The same asymmetry is why
 * nothing here is ever undone — see `NOT ROLLED BACK` below before "fixing" that.
 *
 * Three things this module deliberately does NOT do, each because doing them is
 * the plausible-looking bug:
 *
 * - **It does not re-filter `plan.dependencies`.** D17's filter — installed
 *   version satisfies the range AND the name is already declared in the
 *   consumer's package.json — ran in `plan()`. Anything still on the plan is
 *   something the project does not declare, so re-deciding here would silently
 *   drop it.
 * - **It does not detect the package manager.** `plan.packageManager` is passed
 *   explicitly on every call. nypm's `resolveOperationOptions` falls back to
 *   `detectPackageManager(process.cwd())` — with `includeParentDirs` and the
 *   `argv[1]` sniff at their *defaults* — which is precisely the pair of hazards
 *   D15 moved detection into `plan()` to remove.
 * - **It does not derive interactivity.** `ApplyOptions.interactive` arrives
 *   already computed by `src/ui.ts` (D14). A module that consults
 *   `process.stdout.isTTY` here would not see `--yes` or `CI=true`.
 */
// `spinner` is imported from clack directly rather than through `src/ui.ts`.
// The facade's two stated jobs are the interactivity predicate and normalizing
// clack's cancellation `symbol`; a spinner returns neither, so wrapping it would
// add a hop without adding a guarantee. If ui.ts ever grows a spinner wrapper,
// this import is the one line to redirect.
import { spinner } from "@clack/prompts";
import { addDependency, type OperationResult, type PackageManagerName } from "nypm";

import type { ApplyFailure, ApplyOptions, Plan, PlannedDependency } from "../plan/types";

/**
 * Maps one-to-one onto `ApplyOutcome.dependencies` plus `ApplyOutcome.failure`,
 * so the caller reports rather than re-derives.
 *
 * `command` is what apply RAN — not `plan.installCommand`, which is the escape
 * hatch a user can paste. It is null when nothing was spawned.
 */
export interface InstallDepsResult {
  /**
   * True only when EVERY batch completed. A partial install (production
   * succeeded, dev failed) reports `false` with a non-null `failure`, and
   * `command` still names the batch that landed — the user has to know a
   * package manager already touched their package.json.
   */
  installed: boolean;
  command: string | null;
  failure: ApplyFailure | null;
}

export interface AddDependenciesInput {
  names: string[];
  cwd: string;
  packageManager: PackageManagerName;
  dev: boolean;
  silent: boolean;
}

/**
 * The subprocess seam, so a test can exercise phase ordering without a network
 * round-trip. The default is nypm and is what every real run uses.
 */
export type AddDependencies = (input: AddDependenciesInput) => Promise<OperationResult>;

const addWithNypm: AddDependencies = (input) =>
  addDependency(input.names, {
    // `resolveOperationOptions` defaults cwd to `process.cwd()`. Running
    // `manteen` from a subdirectory would then install into whichever
    // package.json the shell happened to be sitting next to, which is not
    // necessarily `plan.root`.
    cwd: input.cwd,
    packageManager: input.packageManager,
    dev: input.dev,
    silent: input.silent,
    // `corepack` and `installPeerDependencies` are left at nypm's defaults on
    // purpose. nypm prefixes `corepack` for non-npm/bun/deno managers when
    // `corepack --version` exits 0; that predicate is nypm's own and opting out
    // here would make the spawned argv diverge from what the ecosystem expects
    // (D16). Peer installation stays off — a plan's dependency list is the
    // reconciled union from D10, and adding to it behind the user's back would
    // install packages no diagnostic ever mentioned.
  });

/**
 * `range === ""` renders as a bare package name: an unversioned spec is `react`,
 * and `react@` is a 404. Identical to `installCommandFor`'s renderer in
 * `plan/index.ts` — if the two drift, what runs stops matching what was printed.
 */
function spec(dependency: PlannedDependency): string {
  return dependency.range === "" ? dependency.name : `${dependency.name}@${dependency.range}`;
}

function count(n: number, dev: boolean): string {
  return `${n} ${dev ? "dev " : ""}${n === 1 ? "dependency" : "dependencies"}`;
}

export async function installDeps(
  plan: Plan,
  options: ApplyOptions,
  add: AddDependencies = addWithNypm,
): Promise<InstallDepsResult> {
  // D19: `--dry-run` returns from apply() above this phase. This is a `throw`
  // and not a fifth `ApplyFailureKind` for `assertPhasesWired`'s reason — a
  // dry run that reached a subprocess is a composition bug in our own wiring,
  // not a runtime outcome a user can act on, and giving it a refusal code would
  // put an apply-internal concept into §1's refusal table.
  if (options.dryRun === true) {
    throw new Error(
      "apply: phase 2 was reached during a --dry-run. A dry run must return after phase 1 " +
        "(D19); reaching the install means the early return in apply() moved below this call.",
    );
  }

  if (plan.dependencies.length === 0) {
    return { installed: false, command: null, failure: null };
  }

  // Same split, same order, off the same already-sorted array as
  // `installCommandFor`: production first, then dev. No re-sort and no second
  // filter, so the two batches are byte-for-byte the two commands the plan
  // printed.
  const production = plan.dependencies.filter((d) => !d.dev).map(spec);
  const development = plan.dependencies.filter((d) => d.dev).map(spec);

  const batches: { names: string[]; dev: boolean }[] = [];
  if (production.length > 0) batches.push({ names: production, dev: false });
  if (development.length > 0) batches.push({ names: development, dev: true });

  // Interactive: the spinner owns the terminal, so the package manager's output
  // is piped (`silent: true`) and surfaces only if it fails. Non-interactive:
  // no spinner and nothing captured, so a CI log shows the install as it
  // happens — which is the only record anyone will have of it.
  const silent = options.interactive;
  const progress = options.interactive ? spinner() : null;

  // The headline counts the WHOLE set, so it never appears to shrink when the
  // dev batch takes over below. `production.length === 0` is the all-dev case —
  // saying "3 dependencies" there would misdescribe every one of them.
  const headline = `Installing ${count(plan.dependencies.length, production.length === 0)} with ${plan.packageManager}`;
  progress?.start(headline);

  const ran: string[] = [];

  try {
    for (const batch of batches) {
      // Only the dev batch relabels, and only when a production batch preceded
      // it: a second line repeating the headline's own count reads as a
      // correction rather than as progress.
      if (batch.dev && batches.length > 1) {
        progress?.message(`Installing ${count(batch.names.length, true)} with ${plan.packageManager}`);
      }
      const result = await add({
        names: batch.names,
        cwd: plan.root,
        packageManager: plan.packageManager,
        dev: batch.dev,
        silent,
      });
      // `exec` is absent when nypm was handed an empty name list — impossible
      // here, since a batch is only pushed when non-empty, but the field is
      // optional on `OperationResult` and indexing it blind would be the kind of
      // crash that only shows up on the failure path.
      //
      // What `exec` reports is `packageManager.command` plus args, with NO
      // corepack prefix even when nypm added one. The thrown error message below
      // does include it (`xArgs.flat().join(" ")`), so on failure the user sees
      // the fuller form.
      if (result.exec) ran.push([result.exec.command, ...result.exec.args].join(" "));
    }
  } catch (error) {
    // Stop the spinner BEFORE composing the message. clack renders inside its
    // own frame; a multi-line stderr dump printed while it is still spinning is
    // overwritten by the next frame.
    progress?.error("Dependency install failed");

    // Verbatim. When `silent` was true, nypm's thrown message is the failing
    // argv followed by the captured stdout and stderr — that transcript IS the
    // remedy (an EACCES, a 404 package, a peer conflict), and collapsing it to
    // "install failed" throws away the only copy.
    const detail = error instanceof Error ? error.message : String(error);

    return {
      installed: false,
      command: ran.length > 0 ? ran.join(" && ") : null,
      failure: {
        kind: "install-failed",
        message:
          `${detail}\n` +
          // NOT ROLLED BACK, and this is D18 rather than an oversight: package
          // managers are not transactional, so `removeDependency` after a
          // partial install can uninstall something that was already there and
          // is depended on by code manteen never touched. Phase 2 sits above the
          // journal precisely so this decision is structural.
          "No files were written — dependencies install before every write, so the source tree is " +
          "untouched. Any dependency this run already added is left in place: undoing it could " +
          "remove a package the project already had.",
      },
    };
  }

  progress?.stop(`Installed ${count(plan.dependencies.length, production.length === 0)}`);

  return {
    installed: true,
    command: ran.length > 0 ? ran.join(" && ") : null,
    failure: null,
  };
}
