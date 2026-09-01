/** Offline project assessment. This module never constructs a registry loader. */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { detectPackageManager } from "nypm";

import type { JsonEnvelope, Streams } from "../cli/render";
import { PROCESS_STREAMS, renderDiagnostics, renderJson, renderThrown } from "../cli/render";
import { loadConfig } from "../config/load";
import type { ConfigError, LoadedConfig } from "../config/types";
import { resolveMantineInstall } from "../gates/resolve-mantine-install";
import { createInitPlanPorts } from "../init/ports";
import type { InitDetectionResult } from "../init/types";
import { createInstalledPorts, localStatus, readInstalled } from "../inventory/index";
import type { Installed } from "../inventory/types";
import { diag } from "../plan/diagnostics";
import { manteenStateIsGitIgnored } from "../plan/state-ignored";
import type { Diagnostic, DiagnosticAction, ReceiptUnreadable } from "../plan/types";

export const DEFAULT_SKILL_INSTALL_PATH = ".agents/skills/manteen";

export interface StatusFlags {
  cwd: string;
  json?: boolean;
}

export interface StatusCheck<T = unknown> {
  ok: boolean;
  value: T;
  detail?: string;
}

export interface StatusResult {
  command: "status";
  root: string;
  ok: true;
  healthy: boolean;
  initialized: boolean;
  config: StatusCheck<{ errors: ConfigError[] }>;
  framework: StatusCheck<{ kind: string | null; candidates: readonly string[] }>;
  packageManager: StatusCheck<{ name: string | null }>;
  mantine: StatusCheck<ReturnType<typeof resolveMantineInstall>>;
  receipt: StatusCheck<{
    state: Installed["source"]["state"];
    reason?: ReceiptUnreadable;
    sawVersion?: number;
    itemCount: number;
    localFiles: { unchanged: number; modified: number; missing: number };
  }>;
  bases: StatusCheck<{ checked: number; missingOrDrifted: string[] }>;
  gitignore: StatusCheck<{ stateDirectoryIgnored: boolean }>;
  verification: StatusCheck<{
    configured: boolean;
    operations: { add: string[]; update: string[]; remove: string[] };
    missingScripts: string[];
  }>;
  skill: StatusCheck<{ path: string; installed: boolean; owned: boolean }>;
  diagnostics: Diagnostic[];
  notes: string[];
  actions: DiagnosticAction[];
}

function emptyOperations(): { add: string[]; update: string[]; remove: string[] } {
  return { add: [], update: [], remove: [] };
}

function frameworkCheck(result: InitDetectionResult): StatusResult["framework"] {
  return result.ok
    ? { ok: true, value: { kind: result.framework.kind, candidates: [result.framework.kind] } }
    : {
        ok: false,
        value: { kind: null, candidates: result.candidates },
        detail: result.reason,
      };
}

function readScripts(root: string): Record<string, string> {
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

function verificationCheck(
  root: string,
  config: LoadedConfig | null,
): StatusResult["verification"] {
  const raw = config?.raw.verification as
    | { add?: string[]; update?: string[]; remove?: string[] }
    | undefined;
  const operations = emptyOperations();
  if (raw !== undefined) {
    operations.add = [...(raw.add ?? [])];
    operations.update = [...(raw.update ?? [])];
    operations.remove = [...(raw.remove ?? [])];
  }
  const scripts = readScripts(root);
  const missingScripts = [...new Set(Object.values(operations).flat())]
    .filter((name) => typeof scripts[name] !== "string")
    .sort();
  return {
    ok: missingScripts.length === 0,
    value: { configured: raw !== undefined, operations, missingScripts },
    ...(missingScripts.length === 0
      ? {}
      : { detail: `package.json does not define: ${missingScripts.join(", ")}` }),
  };
}

function skillCheck(root: string): StatusResult["skill"] {
  const directory = resolve(root, DEFAULT_SKILL_INSTALL_PATH);
  const installed = existsSync(resolve(directory, "SKILL.md"));
  const owned = existsSync(resolve(directory, ".manteen-skill.json"));
  return {
    ok: !installed || owned,
    value: { path: DEFAULT_SKILL_INSTALL_PATH, installed, owned },
    ...(installed && !owned ? { detail: "skill exists but has no Manteen ownership marker" } : {}),
  };
}

function receiptRecovery(installed: Installed): Diagnostic[] {
  if (installed.source.state !== "unreadable") return [];
  const restore =
    "Restore manteen.lock.json and .manteen/bases/ together from trusted version control or backup; do not reconstruct ownership state by guessing.";
  const classification =
    installed.source.reason === "unparseable"
      ? {
          code: "receipt-invalid-json" as const,
          message: "manteen.lock.json contains invalid JSON syntax.",
          instruction: restore,
        }
      : installed.source.reason === "future-version"
        ? {
            code: "receipt-future-version" as const,
            message: `manteen.lock.json uses newer lockfileVersion ${installed.source.sawVersion ?? "?"}.`,
            instruction:
              "Use a Manteen version that supports this receipt, or restore manteen.lock.json and .manteen/bases/ together from trusted version control or backup; do not overwrite or reconstruct them by guessing.",
          }
        : installed.source.reason === "io"
          ? {
              code: "receipt-io-unreadable" as const,
              message: "manteen.lock.json is present but cannot be read as a regular file.",
              instruction: restore,
            }
          : installed.source.reason === "unsupported-version"
            ? {
                code: "receipt-unsupported-version" as const,
                message: `manteen.lock.json uses unsupported lockfileVersion ${installed.source.sawVersion ?? "?"}.`,
                instruction: restore,
              }
            : {
                code: "receipt-schema-invalid" as const,
                message: "manteen.lock.json does not match the supported receipt schema.",
                instruction: restore,
              };
  return [
    diag(classification.code, classification.message, {
      path: installed.source.path,
      actions: [{ kind: "manual", instruction: classification.instruction }],
    }),
  ];
}

function receiptChecks(
  installed: Installed,
): Pick<StatusResult, "receipt" | "bases" | "diagnostics" | "actions"> {
  const counts = { unchanged: 0, modified: 0, missing: 0 };
  const badBases: string[] = [];
  let checked = 0;
  for (const item of installed.items) {
    for (const file of item.files) {
      counts[localStatus(file)] += 1;
      checked += 1;
      if (file.baseCurrentSha256 !== file.baseSha256) badBases.push(file.receiptPath);
    }
  }
  const receiptOk = installed.source.state !== "unreadable";
  const diagnostics = receiptRecovery(installed);
  return {
    receipt: {
      ok: receiptOk,
      value: {
        state: installed.source.state,
        ...(installed.source.state === "unreadable"
          ? {
              reason: installed.source.reason,
              ...(installed.source.sawVersion === undefined
                ? {}
                : { sawVersion: installed.source.sawVersion }),
            }
          : {}),
        itemCount: installed.items.length,
        localFiles: counts,
      },
    },
    bases: {
      ok: badBases.length === 0,
      value: { checked, missingOrDrifted: badBases.sort() },
    },
    diagnostics,
    actions: diagnostics.flatMap((diagnostic) => diagnostic.actions ?? []),
  };
}

export async function buildStatus(cwd: string): Promise<StatusResult> {
  const root = resolve(cwd);
  const rootState = lstatSync(root);
  if (!rootState.isDirectory()) throw new Error(`${root} is not a directory`);

  const loaded = loadConfig(root);
  const config = loaded.ok ? loaded.config : null;
  const initialized = config !== null;
  const configCheck: StatusResult["config"] = loaded.ok
    ? { ok: true, value: { errors: [] } }
    : { ok: false, value: { errors: loaded.errors }, detail: loaded.errors[0]?.message };

  const [framework, packageManager] = await Promise.all([
    createInitPlanPorts().detect(root),
    detectPackageManager(root, { includeParentDirs: false, ignoreArgv: true }),
  ]);
  const managerCheck: StatusResult["packageManager"] = {
    ok: packageManager !== null,
    value: { name: packageManager?.name ?? null },
  };
  const mantine = resolveMantineInstall(root);
  const mantineCheck: StatusResult["mantine"] = {
    ok: mantine.state === "found",
    value: mantine,
  };

  let installed: Installed;
  try {
    installed = readInstalled(root, createInstalledPorts());
  } catch (error) {
    installed = {
      root,
      source: {
        state: "unreadable",
        path: resolve(root, "manteen.lock.json"),
        reason: "io",
        detail: renderThrown(error).trim(),
      },
      items: [],
      theme: null,
      styles: null,
      notes: [],
    };
  }
  const ownership = receiptChecks(installed);
  const ignored = manteenStateIsGitIgnored(root);
  const gitignore: StatusResult["gitignore"] = {
    ok: !ignored,
    value: { stateDirectoryIgnored: ignored },
    ...(ignored ? { detail: ".manteen is ignored; exact merge bases should be versioned" } : {}),
  };
  const verification = verificationCheck(root, config);
  const skill = skillCheck(root);

  const required = [
    configCheck.ok,
    frameworkCheck(framework).ok,
    managerCheck.ok,
    mantineCheck.ok,
    ownership.receipt.ok,
    ownership.bases.ok,
    gitignore.ok,
    verification.ok,
  ];
  return {
    command: "status",
    root,
    ok: true,
    healthy: initialized && required.every(Boolean),
    initialized,
    config: configCheck,
    framework: frameworkCheck(framework),
    packageManager: managerCheck,
    mantine: mantineCheck,
    receipt: ownership.receipt,
    bases: ownership.bases,
    gitignore,
    verification,
    skill,
    diagnostics: ownership.diagnostics,
    notes: [],
    actions: ownership.actions,
  };
}

function renderStatus(result: StatusResult): string {
  const state = result.healthy
    ? "healthy"
    : result.initialized
      ? "needs-attention"
      : "not-initialized";
  const lines = [`status  ${state}`, `  root: ${result.root}`];
  for (const [name, check] of Object.entries(result).filter(
    ([name]) =>
      ![
        "command",
        "root",
        "ok",
        "healthy",
        "initialized",
        "diagnostics",
        "notes",
        "actions",
      ].includes(name),
  )) {
    const value = check as StatusCheck;
    lines.push(`${value.ok ? "ok" : "warn"}  ${name}`);
    if (value.detail !== undefined) lines.push(`  ${value.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runStatus(
  flags: StatusFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  try {
    const result = await buildStatus(flags.cwd);
    if (flags.json) streams.stdout(renderJson(result as unknown as JsonEnvelope));
    else {
      renderDiagnostics(result.diagnostics, result.root, streams.stderr);
      streams.stdout(renderStatus(result));
    }
    // An unhealthy project is an assessment, not a command failure.
    return 0;
  } catch (error) {
    streams.stderr("error  status\n");
    streams.stderr(renderThrown(error));
    return 1;
  }
}
