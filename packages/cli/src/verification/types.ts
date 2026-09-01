import type { PackageManagerName } from "nypm";

/** One package script fixed during plan, before any project mutation. */
export interface PlannedVerificationCheck {
  script: string;
  /** Exact package.json scripts value. Revalidated after apply before execution. */
  definition: string;
  /** Human-readable package-manager command. Contains no expanded environment value. */
  command: string;
  /** Spawned directly on POSIX; Windows uses the platform command host for `.cmd` shims. */
  executable: string;
  args: string[];
}

export interface PlannedVerification {
  packageManager: PackageManagerName;
  packageJson: {
    /** Absolute `<project>/package.json`. */
    path: string;
    /** Raw-byte pre-image used by apply preflight. */
    sha256: string;
  };
  /** Authored order; never sorted. */
  checks: PlannedVerificationCheck[];
  /** Wall-clock ceiling for ONE check, in milliseconds. Per check rather than
   *  per run so ordering never changes whether a suite fits. */
  timeoutMs: number;
}

export type VerificationStatus = "not-configured" | "skipped" | "planned" | "passed" | "failed";

export type VerificationCheckResult = "passed" | "failed" | "not-run";

/** Machine-readable boundary for every verification result. Project checks run
 * after writes while the Manteen journal is still live; only captured
 * Manteen-managed/control preimages are rollback-coupled. */
export const VERIFICATION_BOUNDARY = {
  phase: "post-write-pre-commit",
  rollbackScope: "manteen-managed",
} as const;

export interface VerificationCheckOutcome {
  script: string;
  command: string;
  result: VerificationCheckResult;
  exitCode: number | null;
  signal: string | null;
}

export type VerificationFailure =
  | {
      kind: "definition-stale";
      message: string;
      script: string | null;
    }
  | {
      kind: "spawn-failed";
      message: string;
      script: string;
    }
  | {
      kind: "script-failed";
      message: string;
      script: string;
      exitCode: number | null;
      signal: string | null;
    }
  | {
      kind: "timed-out";
      message: string;
      script: string;
      timeoutMs: number;
    }
  | {
      kind: "managed-byte-drift";
      message: string;
      /** Absolute internally; CLI JSON projects these relative to the root. */
      paths: string[];
    };

/** Returned by the transaction while its rollback journal is still live. */
export interface VerificationOutcome {
  phase: typeof VERIFICATION_BOUNDARY.phase;
  rollbackScope: typeof VERIFICATION_BOUNDARY.rollbackScope;
  status: VerificationStatus;
  checks: VerificationCheckOutcome[];
  failure: VerificationFailure | null;
}

export interface VerificationProcessRequest {
  cwd: string;
  check: PlannedVerificationCheck;
  /** Ceiling for this one check. The runner kills the child when it elapses. */
  timeoutMs: number;
}

export type VerificationProcessResult =
  | { started: true; exitCode: number | null; signal: string | null; timedOut: boolean }
  | { started: false; message: string };

export type VerificationRunner = (
  request: VerificationProcessRequest,
) => Promise<VerificationProcessResult>;
