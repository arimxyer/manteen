import { resolve } from "node:path";

import type { Diagnostic } from "../plan/types";

export type RemediationAction =
  | { kind: "rerun"; argv: string[] }
  | { kind: "configPatch"; patch: Record<string, unknown> }
  | { kind: "manual"; instruction: string };

export interface MachineDiagnostic extends Omit<Diagnostic, "code"> {
  code: string;
  actions?: RemediationAction[];
  manualRationale?: string;
}

export interface CommandError {
  code: string;
  message: string;
  actions?: RemediationAction[];
  manualRationale?: string;
}

export interface CommandEnvelope<T = unknown> {
  schemaVersion: 1;
  command: string;
  root: string | null;
  ok: boolean;
  exitCode: number;
  mutated: boolean;
  payload: T | null;
  diagnostics: MachineDiagnostic[];
  errors: CommandError[];
  notes: string[];
}

interface LegacyDocument {
  command?: unknown;
  root?: unknown;
  ok?: unknown;
  diagnostics?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

const COMMANDS = new Set([
  "init",
  "add",
  "list",
  "info",
  "diff",
  "update",
  "remove",
  "status",
  "agent",
]);

const nativeStdout = process.stdout.write.bind(process.stdout);
const nativeStderr = process.stderr.write.bind(process.stderr);

let activeSession: MachineSession | null = null;

/** The executable installs one session before commander parses a recognized JSON invocation. */
export function beginMachineSession(argv: readonly string[]): MachineSession | null {
  if (!argv.includes("--json")) return null;
  const command = argv.slice(2).find((token) => COMMANDS.has(token));
  if (command === undefined) return null;

  const cwdIndex = argv.indexOf("--cwd");
  const root =
    cwdIndex >= 0 && argv[cwdIndex + 1] !== undefined
      ? resolve(argv[cwdIndex + 1])
      : resolve(process.cwd());
  activeSession = new MachineSession(command, root, ["manteen", ...argv.slice(2)]);
  return activeSession;
}

export function machineStdout(text: string): void {
  if (activeSession === null) {
    nativeStdout(text);
    return;
  }
  activeSession.stdout.push(text);
}

export function machineStderr(text: string): void {
  if (activeSession === null) {
    nativeStderr(text);
    return;
  }
  activeSession.stderr.push(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asLegacyDocument(text: string): LegacyDocument | null {
  if (text.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function noteText(note: unknown): string {
  if (typeof note === "string") return note;
  if (isRecord(note)) {
    const code = typeof note.code === "string" ? note.code : null;
    const message = typeof note.message === "string" ? note.message : null;
    if (code !== null && message !== null) return `${code}: ${message}`;
    if (message !== null) return message;
    if (code !== null) return code;
  }
  return "The command returned an unstructured note.";
}

function addFlag(argv: readonly string[], flag: string): string[] {
  return argv.includes(flag) ? [...argv] : [...argv, flag];
}

function remediationFor(
  code: string,
  argv: readonly string[],
): Pick<MachineDiagnostic, "actions" | "manualRationale"> {
  switch (code) {
    case "destination-exists":
      return {
        actions: [
          { kind: "rerun", argv: addFlag(argv, "--overwrite") },
          { kind: "rerun", argv: addFlag(argv, "--no-overwrite") },
        ],
      };
    case "remove-adapted-file":
      return { actions: [{ kind: "rerun", argv: addFlag(argv, "--discard-adapted") }] };
    case "update-conflict":
      return { actions: [{ kind: "rerun", argv: addFlag(argv, "--take-upstream") }] };
    case "dependency-range-conflict":
    case "mantine-version-mismatch":
    case "receipt-unreadable":
    case "global-styles-drift":
    case "theme-base-unmergeable":
      return { actions: [{ kind: "rerun", argv: addFlag(argv, "--force") }] };
    case "no-package-manager":
      return {
        actions: [{ kind: "rerun", argv: [...argv, "--pm", "npm"] }],
      };
    default:
      return {
        manualRationale:
          "This refusal needs a project, registry, or ownership decision that Manteen cannot make safely.",
      };
  }
}

function machineDiagnostics(value: unknown, argv: readonly string[]): MachineDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((diagnostic) => {
    const code = typeof diagnostic.code === "string" ? diagnostic.code : "unknown-diagnostic";
    const severity =
      diagnostic.severity === "error" ||
      diagnostic.severity === "warn" ||
      diagnostic.severity === "info"
        ? diagnostic.severity
        : "error";
    const result: MachineDiagnostic = {
      code,
      severity,
      message:
        typeof diagnostic.message === "string"
          ? diagnostic.message
          : "The command returned a diagnostic without a message.",
      forceable: diagnostic.forceable === true,
      ...(Array.isArray(diagnostic.items)
        ? { items: diagnostic.items.filter((item): item is string => typeof item === "string") }
        : {}),
      ...(typeof diagnostic.path === "string" ? { path: diagnostic.path } : {}),
    };
    if (severity === "error") Object.assign(result, remediationFor(code, argv));
    return result;
  });
}

function commandError(stderr: string, exitCode: number): CommandError[] {
  const message = stderr.trim();
  if (message === "") {
    return [
      {
        code: exitCode === 2 ? "usage-error" : "command-failed",
        message:
          exitCode === 2
            ? "The invocation is invalid."
            : "The command failed before producing a result.",
        manualRationale: "Inspect the invocation and project state before trying again.",
      },
    ];
  }
  const first = message.split("\n", 1)[0] ?? "";
  const match = /^(?:error\s{2})?([a-z][a-z0-9-]*)/.exec(first);
  return [
    {
      code: match?.[1] ?? (exitCode === 2 ? "usage-error" : "command-failed"),
      message,
      manualRationale: "The emitted error does not have a safe automatic remediation.",
    },
  ];
}

function payloadOf(document: LegacyDocument): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document)) {
    if (
      key === "command" ||
      key === "root" ||
      key === "ok" ||
      key === "diagnostics" ||
      key === "notes"
    )
      continue;
    payload[key] = value;
  }
  return Object.keys(payload).length === 0 ? null : payload;
}

function hasWrittenFlag(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasWrittenFlag);
  if (!isRecord(value)) return false;
  if (value.written === true) return true;
  return Object.values(value).some(hasWrittenFlag);
}

function inferMutated(command: string, payload: Record<string, unknown> | null): boolean {
  if (payload === null || payload.dryRun === true) return false;
  if (typeof payload.mutated === "boolean") return payload.mutated;
  if (command === "list" || command === "info" || command === "diff" || command === "status") {
    return false;
  }

  const updateState = isRecord(payload.updateState) ? payload.updateState : null;
  if (updateState?.changed === true) return true;
  if (Array.isArray(payload.removals) && payload.removals.length > 0) return true;
  if (hasWrittenFlag(payload)) return true;

  const dependencies = isRecord(payload.dependencies) ? payload.dependencies : null;
  if (typeof dependencies?.command === "string" && dependencies.command.length > 0) return true;
  const outcome = isRecord(payload.outcome) ? payload.outcome : null;
  const outcomeDependencies = isRecord(outcome?.dependencies) ? outcome.dependencies : null;
  return typeof outcomeDependencies?.command === "string" && outcomeDependencies.command.length > 0;
}

function legacyErrors(
  payload: Record<string, unknown> | null,
  diagnostics: readonly MachineDiagnostic[],
  exitCode: number,
): CommandError[] {
  if (exitCode === 0 || diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return [];
  const failure = isRecord(payload?.failure)
    ? payload.failure
    : isRecord(payload?.outcome) && isRecord(payload.outcome.failure)
      ? payload.outcome.failure
      : isRecord(payload?.verification) && isRecord(payload.verification.failure)
        ? payload.verification.failure
        : null;
  if (failure !== null) {
    return [
      {
        code: typeof failure.kind === "string" ? failure.kind : "command-failed",
        message:
          typeof failure.message === "string"
            ? failure.message
            : "The command failed after producing a partial outcome.",
        manualRationale: "This failure needs inspection before the command can be retried safely.",
      },
    ];
  }
  return [];
}

export class MachineSession {
  readonly stdout: string[] = [];
  readonly stderr: string[] = [];

  constructor(
    readonly command: string,
    readonly root: string,
    readonly argv: string[],
  ) {}

  finish(exitCode: number): void {
    const stdout = this.stdout.join("");
    const stderr = this.stderr.join("");
    const legacy = asLegacyDocument(stdout);
    const ok = exitCode === 0;
    const payload = legacy === null ? null : payloadOf(legacy);
    const diagnostics = machineDiagnostics(legacy?.diagnostics, this.argv);
    const legacyNotes = Array.isArray(legacy?.notes) ? legacy.notes.map(noteText) : [];
    const errors =
      legacy === null && !ok
        ? commandError(stderr, exitCode)
        : legacyErrors(payload, diagnostics, exitCode);

    const envelope: CommandEnvelope = {
      schemaVersion: 1,
      command: typeof legacy?.command === "string" ? legacy.command : this.command,
      root: typeof legacy?.root === "string" || legacy?.root === null ? legacy.root : this.root,
      ok,
      exitCode,
      mutated: inferMutated(this.command, payload),
      payload,
      diagnostics,
      errors,
      notes: legacyNotes,
    };

    activeSession = null;
    nativeStdout(`${JSON.stringify(envelope, null, 2)}\n`);
    // Verification subprocess output is the one intentional JSON-mode stderr
    // channel. Other successful commands produce none; failures are represented
    // by the envelope and remain silent on stderr.
    if (ok && stderr !== "") nativeStderr(stderr);
  }
}
