import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Streams } from "../cli/render";
import { PROCESS_STREAMS, renderJson, renderThrown } from "../cli/render";
import { applyConfigEdit, configPreview, planConfigEdit, rawConfig } from "../config/edit";
import type { MantineConfig } from "../config/types";

export interface VerificationFlags {
  cwd: string;
  json?: boolean;
  dryRun?: boolean;
  expectPlan?: string;
  add?: string[];
  update?: string[];
  remove?: string[];
  timeoutMs?: string;
  operation?: "add" | "update" | "remove" | "all";
}

function scripts(root: string): Record<string, string> {
  const path = resolve(root, "package.json");
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { scripts?: unknown };
  if (typeof parsed.scripts !== "object" || parsed.scripts === null) return {};
  return Object.fromEntries(
    Object.entries(parsed.scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function unique(names: readonly string[], operation: string): string[] {
  if (new Set(names).size !== names.length)
    throw new Error(`${operation} verification contains duplicate script names.`);
  return [...names];
}

function hasOperation(verification: MantineConfig["verification"]): boolean {
  return [verification?.add, verification?.update, verification?.remove].some(
    (names) => Array.isArray(names) && names.length > 0,
  );
}

function doc(
  root: string,
  operation: string,
  dryRun: boolean,
  plan: ReturnType<typeof planConfigEdit> | null,
  outcome: ReturnType<typeof applyConfigEdit> | null,
  verification: unknown,
  available: string[],
) {
  return {
    command: "verification" as const,
    root,
    ok: outcome?.ok ?? true,
    operation,
    dryRun,
    planDigest: plan?.planDigest ?? null,
    plan: plan === null ? null : configPreview(plan),
    outcome,
    verification,
    availableScripts: available,
    diagnostics: [],
    notes: [],
  };
}

export async function runVerificationShow(
  flags: VerificationFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    const config = rawConfig(root);
    const available = Object.keys(scripts(root)).sort();
    if (flags.json)
      streams.stdout(
        renderJson(doc(root, "show", false, null, null, config.verification ?? null, available)),
      );
    else {
      streams.stdout(`available  ${available.join(", ") || "(none)"}\n`);
      streams.stdout(`configured ${JSON.stringify(config.verification ?? null)}\n`);
    }
    return 0;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}

export async function runVerificationSet(
  flags: VerificationFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    const config = rawConfig(root);
    const availableMap = scripts(root);
    const available = Object.keys(availableMap).sort();
    const next: NonNullable<MantineConfig["verification"]> = { ...(config.verification ?? {}) };
    let selected = false;
    for (const operation of ["add", "update", "remove"] as const) {
      const values = flags[operation];
      if (values === undefined || values.length === 0) continue;
      selected = true;
      const names = unique(values, operation);
      const missing = names.filter((name) => availableMap[name] === undefined);
      if (missing.length > 0)
        throw new Error(
          `package.json does not define ${operation} verification scripts: ${missing.join(", ")}.`,
        );
      next[operation] = names;
    }
    if (flags.timeoutMs !== undefined) {
      selected = true;
      const timeout = Number(flags.timeoutMs);
      if (!Number.isInteger(timeout) || timeout < 1000)
        throw new Error("--timeout-ms must be an integer of at least 1000.");
      next.timeoutMs = timeout;
    }
    if (!selected)
      throw new Error("verification set requires at least one operation script or --timeout-ms.");
    if (!hasOperation(next)) {
      throw new Error("verification requires at least one add, update, or remove script list.");
    }
    const plan = planConfigEdit(root, "verification-set", "verification", next);
    if (flags.dryRun) {
      if (flags.json)
        streams.stdout(renderJson(doc(root, "set", true, plan, null, next, available)));
      else streams.stdout(`plan  ${plan.planDigest}\nDry run — nothing was written.\n`);
      return 0;
    }
    if (flags.expectPlan === undefined)
      throw new Error(
        "A real verification change requires --expect-plan from an equivalent dry-run.",
      );
    const outcome = applyConfigEdit(plan, flags.expectPlan);
    if (flags.json)
      streams.stdout(renderJson(doc(root, "set", false, plan, outcome, next, available)));
    else if (outcome.ok)
      streams.stdout(`${outcome.mutated ? "updated" : "unchanged"}  verification\n`);
    else streams.stderr(`${outcome.failure?.message}\n`);
    return outcome.ok ? 0 : 1;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}

export async function runVerificationClear(
  flags: VerificationFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    if (!flags.operation || !["add", "update", "remove", "all"].includes(flags.operation)) {
      throw new Error("verification clear requires --operation add, update, remove, or all.");
    }
    const config = rawConfig(root);
    const next = { ...(config.verification ?? {}) };
    if (flags.operation === "all") {
      for (const key of Object.keys(next)) delete next[key as keyof typeof next];
    } else delete next[flags.operation];
    const value = hasOperation(next) ? next : undefined;
    const plan = planConfigEdit(
      root,
      `verification-clear:${flags.operation}`,
      "verification",
      value,
    );
    const available = Object.keys(scripts(root)).sort();
    if (flags.dryRun) {
      if (flags.json)
        streams.stdout(renderJson(doc(root, "clear", true, plan, null, value ?? null, available)));
      else streams.stdout(`plan  ${plan.planDigest}\nDry run — nothing was written.\n`);
      return 0;
    }
    if (flags.expectPlan === undefined)
      throw new Error(
        "A real verification change requires --expect-plan from an equivalent dry-run.",
      );
    const outcome = applyConfigEdit(plan, flags.expectPlan);
    if (flags.json)
      streams.stdout(
        renderJson(doc(root, "clear", false, plan, outcome, value ?? null, available)),
      );
    else if (outcome.ok)
      streams.stdout(`${outcome.mutated ? "updated" : "unchanged"}  verification\n`);
    else streams.stderr(`${outcome.failure?.message}\n`);
    return outcome.ok ? 0 : 1;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}
