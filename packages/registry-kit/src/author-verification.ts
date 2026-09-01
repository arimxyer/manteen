import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { AuthorConformanceInspection, AuthorVerificationConfig } from "./author-conformance";

export interface AuthorVerificationCheck {
  script: string;
  command: string[];
  result: "passed" | "failed" | "not-run";
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}

export interface AuthorVerificationOutcome {
  phase: "post-compile-pre-publish";
  status: "not-configured" | "passed" | "failed";
  checks: AuthorVerificationCheck[];
  failure: { code: string; message: string; script: string | null } | null;
}

export interface AuthorVerificationProcessResult {
  started: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface AuthorVerificationPorts {
  readPackageJson: (path: string) => string;
  run: (request: {
    cwd: string;
    command: string[];
    timeoutMs: number;
  }) => AuthorVerificationProcessResult;
  output: (text: string) => void;
}

const PHASE = "post-compile-pre-publish" as const;
const WINDOWS_COMMAND_SHIMS = new Set(["npm", "pnpm", "yarn"]);

function packageRunner(root: string, manifest: Record<string, unknown>): string {
  const declared = manifest.packageManager;
  if (typeof declared === "string") {
    const name = declared.split("@")[0];
    if (name === "bun" || name === "npm" || name === "pnpm" || name === "yarn") return name;
  }
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

function commandFor(runner: string, script: string): string[] {
  return runner === "npm" ? [runner, "run", "--silent", script] : [runner, "run", script];
}

export function authorVerificationExecutionCommand(
  command: string[],
  platform: NodeJS.Platform = process.platform,
  commandShell = process.env.ComSpec ?? "cmd.exe",
): { executable: string; args: string[] } {
  if (platform !== "win32" || !WINDOWS_COMMAND_SHIMS.has(command[0]!)) {
    return { executable: command[0]!, args: command.slice(1) };
  }
  return {
    executable: commandShell,
    // Profile script names are schema-limited to shell-inert package-script syntax.
    args: ["/d", "/s", "/c", `${command[0]}.cmd ${command.slice(1).join(" ")}`],
  };
}

function defaultPorts(): AuthorVerificationPorts {
  return {
    readPackageJson: (path) => readFileSync(path, "utf8"),
    run: ({ cwd, command, timeoutMs }) => {
      const execution = authorVerificationExecutionCommand(command);
      const result = spawnSync(execution.executable, execution.args, {
        cwd,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: process.env,
        windowsHide: true,
      });
      const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
      return {
        started: result.error === undefined || code === "ETIMEDOUT",
        exitCode: result.status,
        signal: result.signal,
        timedOut: code === "ETIMEDOUT",
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        ...(result.error ? { error: result.error.message } : {}),
      };
    },
    output: (text) => process.stderr.write(text),
  };
}

function configured(
  inspection: AuthorConformanceInspection | undefined,
): AuthorVerificationConfig | null {
  return inspection?.verification ?? null;
}

export function runAuthorVerification(
  catalogPath: string,
  inspection: AuthorConformanceInspection | undefined,
  ports: AuthorVerificationPorts = defaultPorts(),
): AuthorVerificationOutcome {
  const verification = configured(inspection);
  if (verification === null) {
    return { phase: PHASE, status: "not-configured", checks: [], failure: null };
  }

  const root = dirname(resolve(catalogPath));
  const packagePath = join(root, "package.json");
  let manifest: Record<string, unknown>;
  let packageText: string;
  try {
    packageText = ports.readPackageJson(packagePath);
    const parsed: unknown = JSON.parse(packageText);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("package.json root is not an object");
    }
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      phase: PHASE,
      status: "failed",
      checks: verification.scripts.map((script) => ({
        script,
        command: [],
        result: "not-run",
        exitCode: null,
        signal: null,
        timedOut: false,
      })),
      failure: {
        code: "author-verification-package-unreadable",
        script: null,
        message: `Author verification could not read package.json: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  const scripts = manifest.scripts;
  const definitions =
    scripts !== null && !Array.isArray(scripts) && typeof scripts === "object"
      ? (scripts as Record<string, unknown>)
      : {};
  const runner = packageRunner(root, manifest);
  const checks: AuthorVerificationCheck[] = verification.scripts.map((script) => ({
    script,
    command: commandFor(runner, script),
    result: "not-run",
    exitCode: null,
    signal: null,
    timedOut: false,
  }));
  const missing = verification.scripts.find((script) => typeof definitions[script] !== "string");
  if (missing !== undefined) {
    return {
      phase: PHASE,
      status: "failed",
      checks,
      failure: {
        code: "author-verification-script-missing",
        script: missing,
        message: `Author verification script is missing from package.json: ${missing}.`,
      },
    };
  }

  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index]!;
    const result = ports.run({
      cwd: root,
      command: check.command,
      timeoutMs: verification.timeoutMs ?? 300_000,
    });
    if (result.stdout) ports.output(result.stdout);
    if (result.stderr) ports.output(result.stderr);
    let packageDrift: string | null = null;
    try {
      if (ports.readPackageJson(packagePath) !== packageText) {
        packageDrift = "package.json changed while an author verification script was running.";
      }
    } catch (error) {
      packageDrift = `package.json could not be re-read after author verification: ${error instanceof Error ? error.message : String(error)}`;
    }
    const passed =
      result.started && !result.timedOut && result.exitCode === 0 && packageDrift === null;
    checks[index] = {
      ...check,
      result: passed ? "passed" : "failed",
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
    };
    if (!passed) {
      const code =
        packageDrift !== null
          ? "author-verification-package-drift"
          : result.timedOut
            ? "author-verification-timed-out"
            : result.started
              ? "author-verification-script-failed"
              : "author-verification-spawn-failed";
      return {
        phase: PHASE,
        status: "failed",
        checks,
        failure: {
          code,
          script: check.script,
          message:
            packageDrift ??
            result.error ??
            `Author verification script ${check.script} ${result.timedOut ? "timed out" : `exited ${String(result.exitCode)}`}.`,
        },
      };
    }
  }

  return { phase: PHASE, status: "passed", checks, failure: null };
}

export class AuthorVerificationError extends Error {
  constructor(readonly outcome: AuthorVerificationOutcome) {
    super(outcome.failure?.message ?? "Author verification failed.");
    this.name = "AuthorVerificationError";
  }
}
