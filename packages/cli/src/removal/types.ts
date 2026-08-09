import type { InventoryNote } from "../inventory/types";
import type { CanonicalId, Diagnostic, Receipt, ReceiptPath } from "../plan/types";
import type { PlannedVerification, VerificationOutcome } from "../verification/types";

/** D42's removal-only refusal codes. They remain separate until CLI integration. */
export type RemovalDiagnosticCode =
  | "remove-file-unowned"
  | "remove-file-still-published"
  | "remove-file-reassigned"
  | "remove-file-artifact"
  | "remove-adapted-file"
  | "remove-path-unsupported";

export interface RemovalDiagnostic {
  code: RemovalDiagnosticCode;
  severity: "error";
  message: string;
  items?: CanonicalId[];
  path?: ReceiptPath;
  forceable: false;
}

export type RemovalPlanDiagnostic = Diagnostic | RemovalDiagnostic;

/** A pure lstat/read result. Callers produce this without exposing file bytes. */
export type RemovalPathSnapshot =
  | { kind: "missing" }
  | { kind: "regular"; sha256: string }
  | { kind: "unsupported"; reason: string };

export interface RemovalDestinationSnapshot {
  destination: ReceiptPath;
  source: RemovalPathSnapshot;
  base: RemovalPathSnapshot;
}

/**
 * The complete, successfully resolved all-receipt-roots plus transitive closure.
 * `ordinaryDestinations` contains exact POSIX receipt spellings after target
 * resolution. Theme and managed styles are supplied separately as artifacts.
 */
export interface RemovalResolvedItem {
  id: CanonicalId;
  ordinaryDestinations: readonly ReceiptPath[];
}

export interface RemovalCommandOptions {
  upstreamRemoved: boolean;
  dryRun: boolean;
  files: readonly string[];
  discardAdapted: boolean;
  /** False only for --no-verify. */
  verify?: boolean;
}

export type RemovalUsageIssueKind =
  | "missing-mode"
  | "missing-selection"
  | "duplicate-file"
  | "invalid-file"
  | "meaningless-discard-adapted";

export interface RemovalUsageIssue {
  kind: RemovalUsageIssueKind;
  message: string;
  exit: 2;
}

export interface RemoveCandidate {
  itemId: CanonicalId;
  destination: ReceiptPath;
  state: "unchanged" | "adapted" | "missing";
  base: "present" | "missing" | "corrupt";
  selected: boolean;
  discardAdaptedRequired: boolean;
}

export interface RemovalDiscoveryInput {
  receipt: Receipt;
  /** Complete graph output. Any blocking resolver diagnostic prevents discovery. */
  currentItems: readonly RemovalResolvedItem[];
  /** Current theme/styles destinations; recorded artifacts are read from the receipt. */
  currentArtifactDestinations: readonly ReceiptPath[];
  snapshots: readonly RemovalDestinationSnapshot[];
  options: RemovalCommandOptions;
  resolutionDiagnostics?: readonly Diagnostic[];
}

export interface RemovalDiscoveryResult {
  ok: boolean;
  candidates: RemoveCandidate[];
  diagnostics: RemovalPlanDiagnostic[];
  usage: RemovalUsageIssue[];
}

export interface RemovalSelection {
  itemId: CanonicalId;
  destination: ReceiptPath;
}

/** Absolute path plus the exact raw-byte state apply must re-prove. */
export interface RemovalPlannedPath {
  path: string;
  /** `null` means the path was absent during planning and must remain absent. */
  sha256: string | null;
}

export interface RemovalPlannedFile extends RemovalSelection {
  source: RemovalPlannedPath;
  base: RemovalPlannedPath;
}

/** Shared pure-plan/transaction/renderer contract for D42. */
export interface RemovalPlan {
  root: string;
  ok: boolean;
  dryRun: boolean;
  candidates: readonly RemoveCandidate[];
  /** Exact selected files, in deterministic destination order. */
  removals: readonly RemovalPlannedFile[];
  receipt: {
    path: string;
    /** Raw-byte hash of the current receipt; null only for no-receipt discovery. */
    sha256: string | null;
    projectedText: string;
    projectedChange: boolean;
  };
  diagnostics: readonly RemovalPlanDiagnostic[];
  notes: readonly InventoryNote[];
  stateIgnored: boolean;
  verification?: PlannedVerification | null;
}

export interface CommittedRemoval extends RemovalSelection {
  source: "removed" | "already-missing";
  base: "removed" | "already-missing";
}

export interface RemovalFailure {
  kind: "stale-plan" | "write-failed" | "verification-failed" | "rollback-failed";
  message: string;
  paths?: ReceiptPath[];
}

export interface RemovalApplyOutcome {
  ok: boolean;
  dryRun: boolean;
  removals: CommittedRemoval[];
  receipt: { path: string; written: boolean };
  updateState: { changed: true; versioningRequired: true } | null;
  failure: RemovalFailure | null;
  verification?: VerificationOutcome;
}

export interface RemovalReceiptProjectionSuccess {
  ok: true;
  changed: boolean;
  receipt: Receipt;
  removed: RemovalSelection[];
}

export interface RemovalReceiptProjectionFailure {
  ok: false;
  reason: "duplicate-selection" | "record-not-found";
  selection: RemovalSelection;
}

export type RemovalReceiptProjection =
  | RemovalReceiptProjectionSuccess
  | RemovalReceiptProjectionFailure;
