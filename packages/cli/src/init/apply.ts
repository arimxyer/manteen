/** W6 init apply: preflight, one decision, install, one shared journal. */
import { isAbsolute, relative } from "node:path";

import type {
  ApplyInitFn,
  InitApplyOptions,
  InitApplyOutcome,
  InitApplyPorts,
  InitPlan,
} from "./types";
import { isInitMutationPlanEmpty, isInitSetupComplete } from "./types";

function baseOutcome(plan: InitPlan, options: InitApplyOptions): InitApplyOutcome {
  return {
    ok: false,
    cancelled: false,
    dryRun: options.dryRun === true,
    complete: isInitSetupComplete(plan),
    files: plan.files.map((file) => ({ destination: file.destination, written: false })),
    dependencies: { installed: false, command: null },
    instructions: plan.instructions,
    failure: null,
  };
}

function assertPlanShape(plan: InitPlan): void {
  const seen = new Set<string>();
  for (const file of plan.files) {
    if (seen.has(file.destination)) {
      throw new Error(`applyInit: plan claims ${file.destination} twice.`);
    }
    seen.add(file.destination);
    const path = relative(plan.root, file.destination);
    if (path === "" || path.startsWith("..") || isAbsolute(path)) {
      throw new Error(`applyInit: ${file.destination} is outside ${plan.root}.`);
    }
  }
}

function stalePaths(plan: InitPlan, ports: InitApplyPorts): string[] {
  const stale: string[] = [];
  for (const file of plan.files) {
    const expected = file.existing?.sha256 ?? null;
    if (ports.hashFile(file.destination) !== expected) stale.push(file.destination);
  }
  return stale;
}

function staleOutcome(
  plan: InitPlan,
  options: InitApplyOptions,
  paths: string[],
): InitApplyOutcome {
  return {
    ...baseOutcome(plan, options),
    failure: {
      kind: "stale-plan",
      message:
        `The project changed after the init plan was computed: ${paths.join(", ")}. ` +
        "Nothing was written; re-run init to plan against the current bytes.",
      paths,
    },
  };
}

async function applyInitCore(
  plan: InitPlan,
  options: InitApplyOptions,
  ports: InitApplyPorts,
): Promise<InitApplyOutcome> {
  const empty = baseOutcome(plan, options);
  if (!plan.ok) return empty;

  assertPlanShape(plan);
  const stale = stalePaths(plan, ports);
  if (stale.length > 0) return staleOutcome(plan, options, stale);

  // Dry-run stops after every read-only proof and never prompts.
  if (options.dryRun === true) return { ...empty, ok: true };

  if (options.interactive && !isInitMutationPlanEmpty(plan)) {
    const answer = await ports.confirm({
      framework: plan.framework.kind,
      files: plan.files.map((file) => ({
        destination: file.destination,
        disposition: file.disposition,
      })),
      dependencies: plan.dependencies,
    });
    if (!answer.confirmed) return { ...empty, cancelled: true };
  }

  let dependencies: InitApplyOutcome["dependencies"] = { installed: false, command: null };
  if (plan.dependencies.length > 0) {
    if (plan.packageManager === null) {
      throw new Error("applyInit: an install plan has no package manager.");
    }
    try {
      const installed = await ports.install({
        root: plan.root,
        packageManager: plan.packageManager,
        dependencies: plan.dependencies,
        dependencyOutput: options.dependencyOutput ?? (options.interactive ? "capture" : "inherit"),
      });
      dependencies = installed;
      if (!installed.installed) {
        return {
          ...empty,
          dependencies,
          failure: {
            kind: "install-failed",
            message:
              "The dependency installer returned without installing the planned dependencies.",
          },
        };
      }
    } catch (error) {
      return {
        ...empty,
        dependencies,
        failure: {
          kind: "install-failed",
          message:
            `${error instanceof Error ? error.message : String(error)}\n` +
            "No init files were written. Dependencies are outside rollback and may have been partially installed.",
        },
      };
    }
  }

  // A package manager may run arbitrary lifecycle scripts. Re-prove the exact
  // pre-images after it exits and before the journal opens.
  const postInstallStale = stalePaths(plan, ports);
  if (postInstallStale.length > 0) {
    return {
      ...staleOutcome(plan, options, postInstallStale),
      dependencies,
    };
  }

  const journal = ports.createJournal();
  try {
    for (const file of plan.files) journal.write(file.destination, file.content);
  } catch (error) {
    const touched = [...journal.destinations()];
    const unwound = journal.unwind();
    const detail = error instanceof Error ? error.message : String(error);
    if (!unwound.ok) {
      return {
        ...empty,
        dependencies,
        failure: {
          kind: "rollback-failed",
          message:
            `${detail}\nThe rollback also failed: ${unwound.detail ?? "no detail"}. ` +
            `Restore these paths manually: ${unwound.unrestored.join(", ")}`,
          paths: unwound.unrestored,
        },
      };
    }
    return {
      ...empty,
      dependencies,
      failure: {
        kind: "write-failed",
        message: `${detail}\nEvery init file written by this run was restored.`,
        paths: touched,
      },
    };
  }

  return {
    ...empty,
    ok: true,
    files: plan.files.map((file) => ({ destination: file.destination, written: true })),
    dependencies,
  };
}

export const applyInit = applyInitCore satisfies ApplyInitFn;
