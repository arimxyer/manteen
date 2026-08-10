/** `manteen init` shell: flags, presentation, and exit codes only. */
import { resolve } from "node:path";

import { type PackageManagerName, packageManagers } from "nypm";
import {
  display,
  PROCESS_STREAMS,
  renderDiagnostics,
  renderJson,
  renderThrown,
  type Streams,
} from "../cli/render";
import { applyInit } from "../init/apply";
import { planInit } from "../init/plan";
import { createInitApplyPorts, createInitPlanPorts } from "../init/ports";
import type {
  InitApplyOutcome,
  InitApplyPorts,
  InitFrameworkFlag,
  InitInstruction,
  InitPlan,
  InitPlannedDependency,
  InitPlanPorts,
} from "../init/types";
import { INIT_FRAMEWORK_FLAGS } from "../init/types";
import { blockingExitCode, diag, sortDiagnostics } from "../plan/diagnostics";
import { digestInitPlan, planDigestMatches } from "../plan/digest";
import { interactiveFromProcess } from "../ui";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const EXIT_CANCELLED = 130;

export interface InitFlags {
  cwd: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  pm?: string;
  framework?: string;
  expectPlan?: string;
}

export interface InitCommandPorts {
  plan: InitPlanPorts;
  apply: InitApplyPorts;
}

const PACKAGE_MANAGER_NAMES: string[] = [
  ...new Set(packageManagers.map((manager) => manager.name)),
];

function defaultPorts(): InitCommandPorts {
  return { plan: createInitPlanPorts(), apply: createInitApplyPorts() };
}

function initInstruction(instruction: InitInstruction, root: string): string {
  const lines = [`required  ${instruction.code}`];
  if (instruction.path !== undefined) lines.push(`  ${display(instruction.path, root)}`);
  for (const line of instruction.message.split("\n")) lines.push(`  ${line}`);
  if (instruction.snippet !== undefined) {
    lines.push("  snippet:");
    for (const line of instruction.snippet.split("\n")) lines.push(`    ${line}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderInstructions(instructions: readonly InitInstruction[], root: string): string {
  return instructions.map((instruction) => initInstruction(instruction, root)).join("");
}

function dependencySpec(dependency: InitPlannedDependency): string {
  return dependency.range === "" ? dependency.name : `${dependency.name}@${dependency.range}`;
}

function renderInitPlan(plan: InitPlan): string {
  const lines = plan.files.map(
    (file) => `${file.disposition.padEnd(9)}  ${display(file.destination, plan.root)}`,
  );
  for (const dependency of plan.dependencies) {
    lines.push(
      `${"install".padEnd(9)}  ${dependencySpec(dependency)}${dependency.dev ? " (dev)" : ""}`,
    );
  }
  if (lines.length === 0) lines.push("No automated mutations are planned.");
  lines.push("", "Dry run — nothing was written.");
  return `${lines.join("\n")}\n`;
}

function renderInitOutcome(outcome: InitApplyOutcome, root: string): string {
  const lines = outcome.files
    .filter((file) => file.written)
    .map((file) => `${"written".padEnd(9)}  ${display(file.destination, root)}`);
  if (outcome.dependencies.command !== null) {
    lines.push(`${"installed".padEnd(9)}  ${outcome.dependencies.command}`);
  }
  if (lines.length === 0 && outcome.ok) lines.push("Already initialized — no mutations needed.");
  return `${lines.join("\n")}\n`;
}

function renderInitFailure(outcome: InitApplyOutcome, root: string): string {
  const failure = outcome.failure;
  if (failure === null) return "";
  const lines = [`error  ${failure.kind}`];
  for (const line of failure.message.split("\n")) lines.push(`  ${line}`);
  for (const path of failure.paths ?? []) lines.push(`  ${display(path, root)}`);
  return `${lines.join("\n")}\n`;
}

function jsonInstruction(instruction: InitInstruction, root: string) {
  return {
    ...instruction,
    ...(instruction.path === undefined ? {} : { path: display(instruction.path, root) }),
  };
}

function jsonDocument(
  plan: InitPlan,
  outcome: InitApplyOutcome | null,
  planDigest: string,
  requestedDryRun: boolean,
) {
  return {
    command: "init" as const,
    root: plan.root,
    ok: outcome?.ok ?? plan.ok,
    complete: outcome?.complete ?? false,
    framework: plan.framework.kind,
    // Planning refusals and plan mismatches return before `applyInit`, so there
    // is no outcome to carry the invocation mode. The payload must still tell
    // the truth about the flag the caller supplied.
    dryRun: outcome?.dryRun ?? requestedDryRun,
    planDigest,
    plan: {
      version: plan.version,
      files: plan.files.map((file) => ({
        kind: file.kind,
        path: display(file.destination, plan.root),
        disposition: file.disposition,
        sha256: file.sha256,
        existingSha256: file.existing?.sha256 ?? null,
      })),
      dependencies: plan.dependencies,
      packageManager: plan.packageManager,
      installCommand: plan.installCommand,
    },
    outcome:
      outcome === null
        ? null
        : {
            cancelled: outcome.cancelled,
            files: outcome.files.map((file) => ({
              path: display(file.destination, plan.root),
              written: file.written,
            })),
            dependencies: outcome.dependencies,
            failure:
              outcome.failure === null
                ? null
                : {
                    ...outcome.failure,
                    paths: outcome.failure.paths?.map((path) => display(path, plan.root)),
                  },
          },
    diagnostics: plan.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      ...(diagnostic.path === undefined ? {} : { path: display(diagnostic.path, plan.root) }),
    })),
    instructions: plan.instructions.map((instruction) => jsonInstruction(instruction, plan.root)),
    notes: [],
  };
}

function usageError(flags: InitFlags, streams: Streams): number | null {
  if (
    flags.framework !== undefined &&
    !INIT_FRAMEWORK_FLAGS.includes(flags.framework as InitFrameworkFlag)
  ) {
    streams.stderr(
      `manteen init: --framework ${flags.framework} is unknown. Expected one of: ${INIT_FRAMEWORK_FLAGS.join(", ")}.\n`,
    );
    return EXIT_USAGE;
  }
  if (flags.pm !== undefined && !PACKAGE_MANAGER_NAMES.includes(flags.pm)) {
    streams.stderr(
      `manteen init: --pm ${flags.pm} is not a package manager manteen knows. Expected one of: ${PACKAGE_MANAGER_NAMES.join(", ")}.\n`,
    );
    return EXIT_USAGE;
  }
  return null;
}

export async function runInit(
  flags: InitFlags,
  streams: Streams = PROCESS_STREAMS,
  ports: InitCommandPorts = defaultPorts(),
): Promise<number> {
  const invalid = usageError(flags, streams);
  if (invalid !== null) return invalid;

  const root = resolve(flags.cwd);
  const interactive = interactiveFromProcess({ yes: Boolean(flags.yes || flags.json) });
  let plan: InitPlan;
  try {
    plan = await planInit(
      root,
      {
        framework: flags.framework as InitFrameworkFlag | undefined,
        force: flags.force,
        packageManager: flags.pm as PackageManagerName | undefined,
      },
      ports.plan,
    );
  } catch (error) {
    streams.stderr("error  init plan\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  if (!flags.json) renderDiagnostics(plan.diagnostics, plan.root, streams.stderr);
  const planDigest = digestInitPlan(plan, {
    force: flags.force,
    packageManager: flags.pm,
  });
  if (!plan.ok) {
    if (flags.json) {
      streams.stdout(renderJson(jsonDocument(plan, null, planDigest, flags.dryRun === true)));
    }
    return blockingExitCode(plan.diagnostics, false) === 2 ? EXIT_USAGE : EXIT_REFUSED;
  }

  if (!planDigestMatches(planDigest, flags.expectPlan)) {
    const mismatch = diag(
      "plan-mismatch",
      `The fresh init plan is ${planDigest}, not the explicitly authorised ${flags.expectPlan?.toLowerCase() ?? ""}. Re-run --dry-run --json and review the new plan before applying it.`,
    );
    const refused = {
      ...plan,
      diagnostics: sortDiagnostics([...plan.diagnostics, mismatch]),
      ok: false,
    };
    if (flags.json) {
      streams.stdout(renderJson(jsonDocument(refused, null, planDigest, flags.dryRun === true)));
    } else renderDiagnostics([mismatch], plan.root, streams.stderr);
    return EXIT_REFUSED;
  }

  let outcome: InitApplyOutcome;
  try {
    outcome = await applyInit(plan, { interactive, dryRun: flags.dryRun }, ports.apply);
  } catch (error) {
    streams.stderr("error  init apply\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  if (flags.json) {
    streams.stdout(renderJson(jsonDocument(plan, outcome, planDigest, flags.dryRun === true)));
  } else {
    streams.stdout(flags.dryRun ? renderInitPlan(plan) : renderInitOutcome(outcome, plan.root));
    streams.stdout(renderInstructions(outcome.instructions, plan.root));
    streams.stderr(renderInitFailure(outcome, plan.root));
  }

  if (outcome.cancelled) return EXIT_CANCELLED;
  return outcome.ok ? EXIT_OK : EXIT_REFUSED;
}
