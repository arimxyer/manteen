/**
 * `manteen remove --upstream-removed` — the CLI shell for D42's explicit
 * ordinary-file pruning transaction.
 *
 * Discovery/planning and mutation remain removal-specific ports. This module
 * owns only argv semantics, presentation, and exit codes, just as the other
 * command shells do. Keeping the ports injected also makes it impossible for a
 * source-tier command test to reach the network or this repository's files.
 */

import { isAbsolute } from "node:path";

import type { JsonEnvelope, Streams } from "../cli/render";
import {
  display,
  loadProjectConfig,
  PROCESS_STREAMS,
  renderJson,
  renderNotes,
  renderStateVersioningAdvisory,
  renderThrown,
  sortNotes,
} from "../cli/render";
import type { LoadedConfig } from "../config/types";
import type { InventoryNote } from "../inventory/types";
import { classifyRemovalUsage } from "../removal/discovery";
import type {
  CommittedRemoval,
  RemovalApplyOutcome,
  RemovalCommandOptions,
  RemovalFailure,
  RemovalPlan,
  RemovalPlanDiagnostic,
  RemoveCandidate,
} from "../removal/types";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

export interface RemoveFlags {
  cwd: string;
  upstreamRemoved?: boolean;
  dryRun?: boolean;
  /** Values accumulated from repeated `--file <path>`. */
  file?: readonly string[];
  discardAdapted?: boolean;
  json?: boolean;
}

export interface RemoveCommandPorts {
  plan(config: LoadedConfig, options: RemovalCommandOptions): Promise<RemovalPlan>;
  apply(plan: RemovalPlan): RemovalApplyOutcome | Promise<RemovalApplyOutcome>;
}

function commandOptions(flags: RemoveFlags): RemovalCommandOptions {
  return {
    upstreamRemoved: flags.upstreamRemoved === true,
    dryRun: flags.dryRun === true,
    files: [...(flags.file ?? [])],
    discardAdapted: flags.discardAdapted === true,
  };
}

function renderUsage(messages: readonly string[]): string {
  const lines = ["error  remove-usage"];
  for (const message of messages) lines.push(`  ${message}`);
  return `${lines.join("\n")}\n`;
}

/** Preserve wire/receipt paths verbatim; only filesystem paths are root-relative. */
function renderRemovalDiagnostic(diagnostic: RemovalPlanDiagnostic, root: string): string {
  const ids = diagnostic.items?.length ? `  ${diagnostic.items.join(", ")}` : "";
  const lines = [`${diagnostic.severity}  ${diagnostic.code}${ids}`];
  if (diagnostic.path !== undefined) {
    lines.push(
      `  ${isAbsolute(diagnostic.path) ? display(diagnostic.path, root) : diagnostic.path}`,
    );
  }
  for (const line of diagnostic.message.split("\n")) lines.push(`  ${line}`);
  return `${lines.join("\n")}\n`;
}

export function renderRemoveCandidates(candidates: readonly RemoveCandidate[]): string {
  if (candidates.length === 0) return "No upstream-removed files.\n";
  const lines: string[] = [];
  for (const candidate of candidates) {
    lines.push(`candidate  ${candidate.state}  ${candidate.destination}`);
    lines.push(`  item: ${candidate.itemId}`);
    lines.push(`  base: ${candidate.base}`);
    lines.push(`  selected: ${candidate.selected ? "yes" : "no"}`);
    lines.push(`  discard-adapted-required: ${candidate.discardAdaptedRequired ? "yes" : "no"}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderCommittedRemovals(removals: readonly CommittedRemoval[]): string {
  if (removals.length === 0) return "";
  const lines: string[] = [];
  for (const removal of removals) {
    lines.push(`removed  ${removal.destination}`);
    lines.push(`  item: ${removal.itemId}`);
    lines.push(`  source: ${removal.source}`);
    lines.push(`  base: ${removal.base}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderReceiptFact(plan: RemovalPlan, outcome: RemovalApplyOutcome | null): string {
  const path = display(plan.receipt.path, plan.root);
  const lines = [
    `receipt  projected-change: ${plan.receipt.projectedChange ? "yes" : "no"}  ${path}`,
  ];
  if (outcome?.receipt.written === true) lines.push(`written  ${path}`);
  return `${lines.join("\n")}\n`;
}

function renderRemovalFailure(failure: RemovalFailure | null): string {
  if (failure === null) return "";
  const lines = [`error  ${failure.kind}`];
  for (const line of failure.message.split("\n")) lines.push(`  ${line}`);
  for (const path of failure.paths ?? []) lines.push(`  ${path}`);
  return `${lines.join("\n")}\n`;
}

interface RemoveJsonDocument extends JsonEnvelope {
  command: "remove";
  mode: "upstream-removed";
  dryRun: boolean;
  candidates: RemoveCandidate[];
  removals: CommittedRemoval[];
  receipt: { path: string; projectedChange: boolean; written: boolean };
  updateState: { changed: true; versioningRequired: true } | null;
  failure: RemovalFailure | null;
  diagnostics: RemovalPlanDiagnostic[];
  notes: InventoryNote[];
}

function removeJson(
  plan: RemovalPlan,
  dryRun: boolean,
  outcome: RemovalApplyOutcome | null,
  ok: boolean,
): string {
  const observedStateChange = outcome?.ok === true && outcome.updateState?.changed === true;
  const document: RemoveJsonDocument = {
    command: "remove",
    root: plan.root,
    ok,
    mode: "upstream-removed",
    dryRun,
    candidates: [...plan.candidates],
    removals: outcome?.ok === true && !dryRun ? outcome.removals : [],
    receipt: {
      path: display(plan.receipt.path, plan.root),
      projectedChange: plan.receipt.projectedChange,
      written: outcome?.ok === true && !dryRun && outcome.receipt.written,
    },
    updateState: observedStateChange ? { changed: true, versioningRequired: true } : null,
    failure: outcome?.failure ?? null,
    diagnostics: [...plan.diagnostics],
    notes: sortNotes(plan.notes),
  };
  return renderJson(document);
}

function hasBlockingDiagnostic(diagnostics: readonly RemovalPlanDiagnostic[]): boolean {
  // Removal exposes no `--force`; every error remains blocking. Warnings and
  // informational graph facts stay visible but do not withhold the operation.
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/**
 * Production shell. Semantic usage is checked before config loading or graph
 * I/O; configuration retains the shared exit-2 boundary; all later failures
 * are removal refusals at exit 1. There is no cancellation branch because the
 * command never prompts.
 */
export async function runRemove(
  flags: RemoveFlags,
  ports: RemoveCommandPorts,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const options = commandOptions(flags);
  const usage = classifyRemovalUsage(options);
  if (usage.length > 0) {
    streams.stderr(renderUsage(usage.map((issue) => issue.message)));
    return EXIT_USAGE;
  }

  const loaded = loadProjectConfig(flags.cwd, streams.stderr);
  if (!loaded.ok) return loaded.exit;

  let planned: RemovalPlan;
  try {
    planned = await ports.plan(loaded.config, options);
  } catch (error) {
    streams.stderr("error  remove\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  const diagnostics = planned.diagnostics;
  const blocked = !planned.ok || hasBlockingDiagnostic(diagnostics);
  let outcome: RemovalApplyOutcome | null = null;
  if (!blocked) {
    try {
      outcome = await ports.apply(planned);
    } catch (error) {
      streams.stderr("error  remove\n");
      streams.stderr(renderThrown(error));
      return EXIT_REFUSED;
    }
  }

  const ok = !blocked && outcome?.ok === true;
  if (flags.json === true) {
    streams.stdout(removeJson(planned, planned.dryRun, outcome, ok));
    return ok ? EXIT_OK : EXIT_REFUSED;
  }

  for (const diagnostic of diagnostics) {
    streams.stderr(renderRemovalDiagnostic(diagnostic, planned.root));
  }
  streams.stderr(renderNotes(sortNotes(planned.notes)));
  streams.stdout(renderRemoveCandidates(planned.candidates));

  if (outcome !== null) {
    streams.stdout(renderCommittedRemovals(outcome.ok && !planned.dryRun ? outcome.removals : []));
  }
  // A refusal still has a projected selection fact; `written` stays absent.
  // Printing this outside the outcome branch keeps text and JSON equivalent.
  streams.stdout(renderReceiptFact(planned, outcome));

  if (outcome !== null) {
    if (outcome.ok && planned.dryRun) streams.stdout("Dry run — nothing was written.\n");
    streams.stderr(renderRemovalFailure(outcome.failure));
    if (outcome.ok && !planned.dryRun && outcome.updateState?.changed === true) {
      streams.stderr(renderStateVersioningAdvisory(planned.stateIgnored));
    }
  }

  return ok ? EXIT_OK : EXIT_REFUSED;
}
