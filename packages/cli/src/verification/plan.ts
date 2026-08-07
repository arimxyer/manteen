/** Read-only planning for project-owned post-update package scripts. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type PackageManagerName, runScriptCommand } from "nypm";

import { diag } from "../plan/diagnostics";
import type { Diagnostic } from "../plan/types";
import type { PlannedVerification, PlannedVerificationCheck } from "./types";

export interface VerificationPlanResult {
  verification: PlannedVerification | null;
  diagnostics: Diagnostic[];
}

export interface VerificationPlanPorts {
  read(path: string): Buffer;
}

/**
 * Five minutes, per check rather than per run.
 *
 * The point of a ceiling is to bound a HANG, not to police a slow suite, so the
 * number wants to sit above what these scripts really cost and well below "the
 * user gave up and pressed Ctrl-C". On a project consuming a component
 * registry, a typecheck or unit run is seconds and a production build is single
 * -digit minutes; five leaves room for all of them on a cold cache.
 *
 * Per CHECK is the load-bearing half. A per-run budget would make an earlier
 * script's duration decide whether a later one is allowed to finish, so
 * reordering `["typecheck", "test"]` could change the verdict — the check that
 * failed would depend on the check before it. Each one gets the same ceiling.
 */
export const DEFAULT_VERIFICATION_TIMEOUT_MS = 300_000;

const FILE_PORTS: VerificationPlanPorts = {
  read: (path) => readFileSync(path),
};

function unavailable(message: string, path: string): Diagnostic {
  return diag("verification-script-unavailable", message, { path });
}

function parsePackage(bytes: Buffer): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function plannedCheck(
  script: string,
  definition: string,
  packageManager: PackageManagerName,
): PlannedVerificationCheck {
  return {
    script,
    definition,
    command: runScriptCommand(packageManager, script),
    executable: packageManager,
    args: [packageManager === "deno" ? "task" : "run", script],
  };
}

/**
 * Resolve exact package-script definitions before apply. Config shape and
 * uniqueness were already proven by the consumer schema; this proves the
 * project can supply the named commands.
 */
export function planUpdateVerification(
  root: string,
  scripts: readonly string[],
  packageManager: PackageManagerName,
  ports: VerificationPlanPorts = FILE_PORTS,
  timeoutMs: number = DEFAULT_VERIFICATION_TIMEOUT_MS,
): VerificationPlanResult {
  const path = resolve(root, "package.json");
  let bytes: Buffer;
  try {
    bytes = ports.read(path);
  } catch (error) {
    return {
      verification: null,
      diagnostics: [
        unavailable(
          `Update verification is configured, but ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
          path,
        ),
      ],
    };
  }

  const parsed = parsePackage(bytes);
  if (parsed === null) {
    return {
      verification: null,
      diagnostics: [
        unavailable(
          `Update verification is configured, but ${path} is not a JSON object with usable scripts.`,
          path,
        ),
      ],
    };
  }

  const block = parsed.scripts;
  const definitions =
    typeof block === "object" && block !== null && !Array.isArray(block)
      ? (block as Record<string, unknown>)
      : {};
  const diagnostics: Diagnostic[] = [];
  const checks: PlannedVerificationCheck[] = [];

  for (const script of scripts) {
    const definition = Object.hasOwn(definitions, script) ? definitions[script] : undefined;
    if (typeof definition !== "string") {
      diagnostics.push(
        unavailable(
          `${path} does not define verification script ${JSON.stringify(script)} as a string in scripts. Add it or run update with --no-verify.`,
          path,
        ),
      );
      continue;
    }
    checks.push(plannedCheck(script, definition, packageManager));
  }

  if (diagnostics.length > 0) return { verification: null, diagnostics };

  return {
    verification: {
      packageManager,
      packageJson: {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      checks,
      timeoutMs,
    },
    diagnostics: [],
  };
}
