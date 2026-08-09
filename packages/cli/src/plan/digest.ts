import { createHash } from "node:crypto";
import { relative, sep } from "node:path";

import type { InitPlan } from "../init/types";
import type { RemovalPlan } from "../removal/types";
import type { Plan } from "./types";

export const PLAN_DIGEST_VERSION = 1 as const;

export interface PlanDigestOptions {
  refs?: readonly string[];
  force?: boolean;
  overwrite?: boolean | "no";
  packageManager?: string;
  takeUpstream?: boolean;
  verify?: boolean;
  all?: boolean;
}

/** Canonical JSON used only for hashes. Object keys sort; array order remains semantic. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function pathFrom(root: string, absolute: string): string {
  const value = relative(root, absolute).split(sep).join("/");
  return value === "" ? "." : value;
}

function normalizedOptions(options: PlanDigestOptions): unknown {
  return {
    all: options.all ?? false,
    force: options.force ?? false,
    overwrite: options.overwrite ?? null,
    packageManager: options.packageManager ?? null,
    refs: [...(options.refs ?? [])],
    takeUpstream: options.takeUpstream ?? false,
    verify: options.verify ?? true,
  };
}

/**
 * Hashes every fact that can change what add/update will touch, but never source
 * bodies, theme text, expanded credentials, or presentation strings.
 */
export function digestPlan(plan: Plan, options: PlanDigestOptions = {}): string {
  return sha256({
    schemaVersion: PLAN_DIGEST_VERSION,
    operation: plan.operation,
    root: plan.root,
    options: normalizedOptions(options),
    items: plan.items.map((item) => ({
      id: item.id,
      source: item.sourceUrl,
      dependsOn: item.dependsOn,
      files: item.files.map((file) => ({
        destination: pathFrom(plan.root, file.destination),
        disposition: file.disposition,
        sha256: file.sha256,
        upstreamSha256: file.upstream.sha256,
        existingSha256: file.existing?.sha256 ?? null,
        baseDestination: pathFrom(plan.root, file.base.destination),
        baseExistingSha256: file.base.existing?.sha256 ?? null,
      })),
    })),
    removedBases: plan.removedBases.map((base) => ({
      destination: pathFrom(plan.root, base.destination),
      existingSha256: base.existing?.sha256 ?? null,
    })),
    dependencies: plan.dependencies.map((dependency) => ({
      name: dependency.name,
      range: dependency.range,
      dev: dependency.dev,
      wantedBy: dependency.wantedBy,
    })),
    theme:
      plan.theme === null
        ? null
        : {
            destination: pathFrom(plan.root, plan.theme.destination),
            existingSha256: plan.theme.base?.sha256 ?? null,
            sha256: plan.theme.sha256,
            changed: plan.theme.changed,
            sources: plan.theme.sources,
          },
    styles:
      plan.styles === null
        ? null
        : {
            destination: pathFrom(plan.root, plan.styles.destination),
            existingSha256: plan.styles.base?.sha256 ?? null,
            sha256: plan.styles.sha256,
            changed: plan.styles.changed,
            sources: plan.styles.sources,
          },
    verification:
      plan.verification === null
        ? null
        : {
            packageJson: {
              path: pathFrom(plan.root, plan.verification.packageJson.path),
              sha256: plan.verification.packageJson.sha256,
            },
            timeoutMs: plan.verification.timeoutMs,
            checks: plan.verification.checks.map((check) => ({
              script: check.script,
              definition: check.definition,
              command: check.command,
            })),
          },
    receipt: !plan.receipt.present ? null : { sha256: plan.receipt.sha256, valid: plan.receipt.ok },
  });
}

export function digestInitPlan(plan: InitPlan, options: PlanDigestOptions = {}): string {
  return sha256({
    schemaVersion: PLAN_DIGEST_VERSION,
    operation: "init",
    root: plan.root,
    options: normalizedOptions(options),
    framework: plan.framework,
    files: plan.files.map((file) => ({
      kind: file.kind,
      destination: pathFrom(plan.root, file.destination),
      disposition: file.disposition,
      sha256: file.sha256,
      existingSha256: file.existing?.sha256 ?? null,
    })),
    dependencies: plan.dependencies,
    packageManager: plan.packageManager,
    installCommand: plan.installCommand,
    instructions: plan.instructions.map((instruction) => ({
      code: instruction.code,
      path: instruction.path === undefined ? null : pathFrom(plan.root, instruction.path),
    })),
  });
}

export function digestRemovalPlan(plan: RemovalPlan, options: PlanDigestOptions = {}): string {
  return sha256({
    schemaVersion: PLAN_DIGEST_VERSION,
    operation: "remove",
    root: plan.root,
    options: normalizedOptions(options),
    candidates: plan.candidates.map((candidate) => ({
      itemId: candidate.itemId,
      destination: candidate.destination,
      state: candidate.state,
      base: candidate.base,
      selected: candidate.selected,
    })),
    removals: plan.removals.map((removal) => ({
      itemId: removal.itemId,
      destination: removal.destination,
      sourceSha256: removal.source.sha256,
      baseSha256: removal.base.sha256,
    })),
    receipt: {
      sha256: plan.receipt.sha256,
      projectedChange: plan.receipt.projectedChange,
      projectedSha256: createHash("sha256")
        .update(plan.receipt.projectedText, "utf8")
        .digest("hex"),
    },
  });
}

export function planDigestMatches(actual: string, expected: string | undefined): boolean {
  return expected === undefined || actual === expected.toLowerCase();
}
