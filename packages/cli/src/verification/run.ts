/** Planned project verification shared by add, update, and remove transactions. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, dirname, resolve as resolvePath } from "node:path";

import crossSpawn from "cross-spawn";
import { x } from "tinyexec";

import type { FileHasher } from "../inventory/installed";
import type { Plan, Receipt } from "../plan/types";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { basePathFor } from "../receipt/path";
import type { ReceiptReader, ReceiptValidator } from "../receipt/read";
import { readReceipt } from "../receipt/read";
import type {
  PlannedVerification,
  VerificationCheckOutcome,
  VerificationFailure,
  VerificationOutcome,
  VerificationProcessResult,
  VerificationRunner,
} from "./types";
import { VERIFICATION_BOUNDARY } from "./types";

export interface VerificationPorts {
  readReceipt: ReceiptReader;
  validateReceipt: ReceiptValidator;
  hash: FileHasher;
  run: VerificationRunner;
}

export type VerificationOutput = (chunk: string) => void;

export interface VerificationExecutionCommand {
  executable: string;
  args: string[];
}

const DIRECT_PACKAGE_MANAGERS = new Set(["npm", "bun", "deno", "aube", "nub"]);
const WINDOWS_COMMAND_SHIMS = new Set(["corepack", "npm", "pnpm", "yarn", "yarnpkg"]);

/**
 * tinyexec normally enriches PATH from the CLI process cwd. Verification can
 * target another root programmatically, so build the same cwd/ancestor bin
 * chain from the verified project root and disable tinyexec's ambient version.
 */
export function verificationEnvironment(
  cwd: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...source };
  const pathKey = Object.keys(env).find((key) => /^path$/i.test(key)) ?? "PATH";
  const bins: string[] = [];
  let current = resolvePath(cwd);
  while (true) {
    bins.push(resolvePath(current, "node_modules", ".bin"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  bins.push(dirname(process.execPath));
  if (env[pathKey]) bins.push(env[pathKey] as string);
  env[pathKey] = bins.join(delimiter);
  return env;
}

/** Match nypm's execution policy: its other managers prefer Corepack when available. */
export function verificationExecutionCommand(
  check: PlannedVerification["checks"][number],
  corepackAvailable: boolean,
  platform: NodeJS.Platform = process.platform,
): VerificationExecutionCommand {
  const executable =
    corepackAvailable && !DIRECT_PACKAGE_MANAGERS.has(check.executable)
      ? "corepack"
      : check.executable;
  const args = executable === "corepack" ? [check.executable, ...check.args] : check.args;

  // Node's Windows installation exposes npm/Corepack (and their delegated
  // managers) as `.cmd` shims. tinyexec handles an explicit `.cmd` command,
  // but `spawnSync("npm")` does not add PATHEXT and fails with ENOENT.
  return {
    executable:
      platform === "win32" && WINDOWS_COMMAND_SHIMS.has(executable)
        ? `${executable}.cmd`
        : executable,
    args,
  };
}

/**
 * End the package-manager process and every verifier it spawned.
 *
 * Killing only npm/pnpm/etc. is insufficient: a child verifier can retain the
 * stdout/stderr pipes that tinyexec is awaiting, so the timeout itself hangs.
 * `persist` below gives POSIX children their own process group. Windows must
 * retain ordinary `.cmd` stream semantics and exposes the tree operation
 * through taskkill without detaching the child.
 */
function terminateProcessTree(child: ReturnType<typeof x>["process"]): void {
  const pid = child?.pid;
  if (pid === undefined) return;

  if (process.platform === "win32") {
    const killed = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (killed.status === 0) return;
  } else {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // The group may already be gone; fall back to the direct child below.
    }
  }

  try {
    child?.kill("SIGKILL");
  } catch {
    // The process exited between the timeout firing and the fallback kill.
  }
}

/** Both child streams use `write`; the CLI supplies its stderr channel. */
export function createVerificationRunner(write: VerificationOutput): VerificationRunner {
  let corepackProbe: Promise<boolean> | null = null;

  const hasCorepack = (cwd: string): Promise<boolean> => {
    corepackProbe ??= (async () => {
      try {
        const result = await x("corepack", ["--version"], {
          nodePath: false,
          nodeOptions: {
            cwd,
            env: verificationEnvironment(cwd),
            stdio: ["ignore", "ignore", "ignore"],
          },
        });
        return result.exitCode === 0;
      } catch {
        return false;
      }
    })();
    return corepackProbe;
  };

  return async ({ cwd, check, timeoutMs }) => {
    const useCorepack = !DIRECT_PACKAGE_MANAGERS.has(check.executable) && (await hasCorepack(cwd));
    const command = verificationExecutionCommand(check, useCorepack);

    // Declared outside the `try` because the catch branch needs to distinguish
    // a process that started from an executable that never did.
    let child: ReturnType<typeof x>["process"];
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      // `x` supplies the cross-platform normalizer used by nypm itself,
      // including Windows `.cmd` handling. PATH is explicitly based on the
      // verified project root above; we still own streaming, the process-tree
      // timeout and the result shape.
      const execution = x(command.executable, command.args, {
        throwOnError: false,
        nodePath: false,
        persist: process.platform !== "win32",
        nodeOptions: {
          cwd,
          env: verificationEnvironment(cwd),
          stdio: ["ignore", "pipe", "pipe"],
        },
      });
      child = execution.process;
      child?.stdout?.on("data", (chunk: Buffer | string) => write(chunk.toString()));
      child?.stderr?.on("data", (chunk: Buffer | string) => write(chunk.toString()));
      timeout = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child);
      }, timeoutMs);
      const result = await execution;
      return {
        started: true,
        exitCode: result.exitCode ?? null,
        signal: child?.signalCode ?? null,
        timedOut,
      };
    } catch (error) {
      if (timedOut) {
        return { started: true, exitCode: null, signal: child?.signalCode ?? null, timedOut: true };
      }
      return {
        started: false,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  };
}

export function createVerificationPorts(
  write: VerificationOutput,
  hash: FileHasher,
): VerificationPorts {
  return {
    readReceipt: createReceiptReader(),
    validateReceipt: createReceiptValidator(),
    hash,
    run: createVerificationRunner(write),
  };
}

function notRun(verification: PlannedVerification): VerificationCheckOutcome[] {
  return verification.checks.map((check) => ({
    script: check.script,
    command: check.command,
    result: "not-run",
    exitCode: null,
    signal: null,
  }));
}

export function plannedVerificationOutcome(verification: PlannedVerification): VerificationOutcome {
  return {
    ...VERIFICATION_BOUNDARY,
    status: "planned",
    checks: notRun(verification),
    failure: null,
  };
}

function failed(
  checks: VerificationCheckOutcome[],
  failure: VerificationFailure,
): VerificationOutcome {
  return { ...VERIFICATION_BOUNDARY, status: "failed", checks, failure };
}

function readDefinitions(path: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const block = (parsed as Record<string, unknown>).scripts;
  if (typeof block !== "object" || block === null || Array.isArray(block)) return {};
  return block as Record<string, unknown>;
}

function revalidateDefinitions(verification: PlannedVerification): VerificationFailure | null {
  const definitions = readDefinitions(verification.packageJson.path);
  if (definitions === null) {
    return {
      kind: "definition-stale",
      script: null,
      message:
        `${verification.packageJson.path} could not be re-read as a package.json object after apply. ` +
        "No verification script ran; the caller must treat the mutation as failed.",
    };
  }

  for (const check of verification.checks) {
    if (definitions[check.script] === check.definition) continue;
    return {
      kind: "definition-stale",
      script: check.script,
      message:
        `Package script ${JSON.stringify(check.script)} changed after the mutation plan was computed. ` +
        "The changed command was not executed; the caller must treat the mutation as failed.",
    };
  }
  return null;
}

function absoluteReceiptPath(root: string, relative: string): string {
  return resolvePath(root, ...relative.split("/"));
}

export function verificationManagedPaths(plan: Plan, receipt: Receipt): string[] {
  const paths = new Set<string>([
    plan.receipt.path,
    plan.configPath,
    plan.verification?.packageJson.path ?? resolvePath(plan.root, "package.json"),
  ]);

  for (const item of receipt.items) {
    for (const file of item.files) {
      const destination = absoluteReceiptPath(plan.root, file.destination);
      paths.add(destination);
      paths.add(basePathFor(destination, plan.root));
    }
  }
  if (receipt.theme !== null) paths.add(absoluteReceiptPath(plan.root, receipt.theme.destination));
  if (receipt.styles !== null) {
    paths.add(absoluteReceiptPath(plan.root, receipt.styles.destination));
  }

  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

type SnapshotResult =
  | { ok: true; hashes: ReadonlyMap<string, string | null> }
  | { ok: false; failure: VerificationFailure };

function snapshot(paths: readonly string[], hash: FileHasher): SnapshotResult {
  const hashes = new Map<string, string | null>();
  for (const path of paths) {
    try {
      hashes.set(path, hash(path));
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "managed-byte-drift",
          paths: [path],
          message:
            `Verification could not snapshot ${path}: ${error instanceof Error ? error.message : String(error)}. ` +
            "The managed/control preimage could not be established.",
        },
      };
    }
  }
  return { ok: true, hashes };
}

function drifted(before: ReadonlyMap<string, string | null>, hash: FileHasher): SnapshotResult {
  const paths: string[] = [];
  const after = new Map<string, string | null>();
  for (const [path, expected] of before) {
    let actual: string | null;
    try {
      actual = hash(path);
    } catch {
      paths.push(path);
      continue;
    }
    after.set(path, actual);
    if (actual !== expected) paths.push(path);
  }
  if (paths.length === 0) return { ok: true, hashes: after };
  return {
    ok: false,
    failure: {
      kind: "managed-byte-drift",
      paths,
      message:
        "A verification script changed Manteen-managed or control bytes after the mutation was applied. " +
        "The changes were detected; caches, lockfiles, and other project paths were not inspected.",
    },
  };
}

function receiptForSnapshot(plan: Plan, ports: VerificationPorts): Receipt | VerificationFailure {
  let state: ReturnType<typeof readReceipt>;
  try {
    state = readReceipt(plan.root, ports.readReceipt, ports.validateReceipt);
  } catch (error) {
    return {
      kind: "managed-byte-drift",
      paths: [plan.receipt.path],
      message:
        `The completed mutation receipt could not be re-read before verification: ${error instanceof Error ? error.message : String(error)}. ` +
        "No project script ran.",
    };
  }
  if (state.present && state.ok) return state.receipt;
  return {
    kind: "managed-byte-drift",
    paths: [plan.receipt.path],
    message:
      "The completed mutation receipt could not be re-read before verification. No project script ran.",
  };
}

/** Run the already-planned checks against a successfully applied live tree. */
export async function verifyAppliedUpdate(
  plan: Plan,
  verification: PlannedVerification,
  ports: VerificationPorts,
): Promise<VerificationOutcome> {
  const checks = notRun(verification);
  const stale = revalidateDefinitions(verification);
  if (stale !== null) return failed(checks, stale);

  const receipt = receiptForSnapshot(plan, ports);
  if ("kind" in receipt) return failed(checks, receipt);

  const before = snapshot(verificationManagedPaths(plan, receipt), ports.hash);
  if (!before.ok) return failed(checks, before.failure);

  for (let index = 0; index < verification.checks.length; index += 1) {
    const check = verification.checks[index] as PlannedVerification["checks"][number];
    let processResult: VerificationProcessResult;
    try {
      processResult = await ports.run({
        cwd: plan.root,
        check,
        timeoutMs: verification.timeoutMs,
      });
    } catch (error) {
      processResult = {
        started: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const observed = checks[index] as VerificationCheckOutcome;
    if (!processResult.started) {
      observed.result = "failed";
      return failed(checks, {
        kind: "spawn-failed",
        script: check.script,
        message:
          `Verification script ${JSON.stringify(check.script)} could not start: ${processResult.message}. ` +
          "The mutation is rejected so its transaction can restore captured preimages.",
      });
    }

    observed.exitCode = processResult.exitCode;
    observed.signal = processResult.signal;
    const successful = processResult.exitCode === 0 && processResult.signal === null;
    observed.result = successful ? "passed" : "failed";

    // Check after every command so a mutating first command cannot be hidden by
    // a later fail-fast result.
    const after = drifted(before.hashes, ports.hash);
    if (!after.ok) {
      // A zero process exit is not a passed verification check when that same
      // process invalidated Manteen's managed/control state.
      observed.result = "failed";
      return failed(checks, after.failure);
    }

    // Reported before `script-failed`, because a killed child also exits
    // non-zero: "your test suite failed" is the wrong sentence for a check
    // Manteen never let finish, and it sends the reader after the wrong bug.
    if (processResult.timedOut) {
      return failed(checks, {
        kind: "timed-out",
        script: check.script,
        timeoutMs: verification.timeoutMs,
        message:
          `Verification script ${JSON.stringify(check.script)} did not finish within ${verification.timeoutMs}ms and was terminated. ` +
          "The mutation is rejected so its transaction can restore captured preimages. " +
          'Raise "verification".timeoutMs in manteen.json if this check is legitimately slower.',
      });
    }

    if (!successful) {
      return failed(checks, {
        kind: "script-failed",
        script: check.script,
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        message:
          `Verification script ${JSON.stringify(check.script)} failed` +
          (processResult.signal !== null
            ? ` with signal ${processResult.signal}`
            : ` with exit code ${processResult.exitCode ?? "unknown"}`) +
          ". The mutation is rejected so its transaction can restore captured preimages.",
      });
    }
  }

  return { ...VERIFICATION_BOUNDARY, status: "passed", checks, failure: null };
}

/** Operation-neutral spelling for new add/remove integrations. */
export const verifyAppliedMutation = verifyAppliedUpdate;

/**
 * Synchronous transaction hook for the removal journal. It uses the same
 * definition and managed-byte checks as the async runner, but `spawnSync`
 * keeps the journal live without widening the long-standing synchronous
 * programmatic removal API.
 */
export function verifyAppliedMutationSync(
  plan: Plan,
  verification: PlannedVerification,
  ports: Pick<VerificationPorts, "readReceipt" | "validateReceipt" | "hash">,
  write: VerificationOutput = (chunk) => process.stderr.write(chunk),
): VerificationOutcome {
  const checks = notRun(verification);
  const stale = revalidateDefinitions(verification);
  if (stale !== null) return failed(checks, stale);
  const receipt = receiptForSnapshot(plan, ports as VerificationPorts);
  if ("kind" in receipt) return failed(checks, receipt);
  const before = snapshot(verificationManagedPaths(plan, receipt), ports.hash);
  if (!before.ok) return failed(checks, before.failure);

  for (let index = 0; index < verification.checks.length; index += 1) {
    const check = verification.checks[index] as PlannedVerification["checks"][number];
    const observed = checks[index] as VerificationCheckOutcome;
    const command = verificationExecutionCommand(check, false);
    const result = crossSpawn.sync(command.executable, command.args, {
      cwd: plan.root,
      env: verificationEnvironment(plan.root),
      encoding: "utf8",
      timeout: verification.timeoutMs,
      windowsHide: true,
    });
    if (result.stdout) write(result.stdout);
    if (result.stderr) write(result.stderr);
    observed.exitCode = result.status;
    observed.signal = result.signal;

    const after = drifted(before.hashes, ports.hash);
    if (!after.ok) {
      observed.result = "failed";
      return failed(checks, after.failure);
    }
    const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    if (timedOut) {
      observed.result = "failed";
      return failed(checks, {
        kind: "timed-out",
        script: check.script,
        timeoutMs: verification.timeoutMs,
        message: `Verification script ${JSON.stringify(check.script)} did not finish within ${verification.timeoutMs}ms and was terminated.`,
      });
    }
    if (result.error != null) {
      observed.result = "failed";
      return failed(checks, {
        kind: "spawn-failed",
        script: check.script,
        message: `Verification script ${JSON.stringify(check.script)} could not start: ${result.error.message}.`,
      });
    }
    if (result.status !== 0 || result.signal !== null) {
      observed.result = "failed";
      return failed(checks, {
        kind: "script-failed",
        script: check.script,
        exitCode: result.status,
        signal: result.signal,
        message: `Verification script ${JSON.stringify(check.script)} failed.`,
      });
    }
    observed.result = "passed";
  }
  return { ...VERIFICATION_BOUNDARY, status: "passed", checks, failure: null };
}
