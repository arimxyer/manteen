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
}

export type VerificationStatus = "not-configured" | "skipped" | "planned" | "passed" | "failed";

export type VerificationCheckResult = "passed" | "failed" | "not-run";

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
      kind: "managed-byte-drift";
      message: string;
      /** Absolute internally; CLI JSON projects these relative to the root. */
      paths: string[];
    };

/** Separate from ApplyOutcome: these scripts run only after apply's journal closes. */
export interface VerificationOutcome {
  status: VerificationStatus;
  checks: VerificationCheckOutcome[];
  failure: VerificationFailure | null;
}

export interface VerificationProcessRequest {
  cwd: string;
  check: PlannedVerificationCheck;
}

export type VerificationProcessResult =
  | { started: true; exitCode: number | null; signal: string | null }
  | { started: false; message: string };

export type VerificationRunner = (
  request: VerificationProcessRequest,
) => Promise<VerificationProcessResult>;
