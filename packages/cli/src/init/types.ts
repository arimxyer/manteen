/**
 * W6's frozen plan/apply boundary.
 *
 * Init edits project infrastructure; registry `Plan` installs item-owned files.
 * They deliberately do not share a plan type: init has no canonical item ids,
 * wire lineage or receipt ownership, and pretending it does would make
 * manteen.lock.json claim files that were never registry items.
 *
 * Every path below is absolute unless its comment explicitly says otherwise.
 * Planned file content is final UTF-8 text. Apply writes those exact bytes via
 * the existing temp + rename journal after re-verifying every pre-image hash.
 */
import type { PackageManagerName } from "nypm";

import type { Diagnostic } from "../plan/types";

// ---- framework detection ---------------------------------------------------

/** CLI vocabulary. The order is stable and is also the help/JSON order. */
export const INIT_FRAMEWORK_FLAGS = [
  "vite",
  "next-app",
  "next-pages",
  "next-hybrid",
  "react-router",
  "manual",
] as const;

export type InitFrameworkFlag = (typeof INIT_FRAMEWORK_FLAGS)[number];
export type InitTierAFramework = Exclude<InitFrameworkFlag, "next-hybrid" | "manual">;

/**
 * The adapter set is a union rather than `InitTierAFramework[]`: Vite + Next is
 * not a meaningful project, while the one legal multi-adapter shape has a
 * fixed App-then-Pages order.
 */
export type InitFrameworkSet =
  | { kind: "vite"; adapters: readonly ["vite"] }
  | { kind: "next-app"; adapters: readonly ["next-app"] }
  | { kind: "next-pages"; adapters: readonly ["next-pages"] }
  | { kind: "next-hybrid"; adapters: readonly ["next-app", "next-pages"] }
  | { kind: "react-router"; adapters: readonly ["react-router"] }
  | { kind: "manual"; adapters: readonly [] };

/** Canonical adapter ordering, shared by detection, planning and JSON output. */
export function frameworkSetFor(flag: InitFrameworkFlag): InitFrameworkSet {
  switch (flag) {
    case "vite":
      return { kind: flag, adapters: ["vite"] };
    case "next-app":
      return { kind: flag, adapters: ["next-app"] };
    case "next-pages":
      return { kind: flag, adapters: ["next-pages"] };
    case "next-hybrid":
      return { kind: flag, adapters: ["next-app", "next-pages"] };
    case "react-router":
      return { kind: flag, adapters: ["react-router"] };
    case "manual":
      return { kind: flag, adapters: [] };
  }
}

/** One positive or negative fact used to select a framework. */
export interface InitFrameworkEvidence {
  /** Machine-stable marker, for example `dependency:@react-router/dev`. */
  marker: string;
  /** The file that supplied the fact. */
  path: string;
  /** Human-readable observation; never source-file contents. */
  detail: string;
}

export type InitDetectionFailure = "unrecognized" | "ambiguous" | "override-conflict";

export type InitDetectionResult =
  | {
      ok: true;
      source: "detected" | "override";
      framework: InitFrameworkSet;
      evidence: InitFrameworkEvidence[];
    }
  | {
      ok: false;
      reason: InitDetectionFailure;
      /** Canonical order; empty only for `unrecognized`. */
      candidates: InitFrameworkFlag[];
      evidence: InitFrameworkEvidence[];
    };

// ---- adapter input/output --------------------------------------------------

export interface InitAliases {
  components: "@/components";
  ui: "@/components/ui";
  hooks: "@/hooks";
  lib: "@/lib";
}

export const INIT_ALIASES: InitAliases = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

/** Layout resolved by detection before an adapter runs. */
export interface InitProjectLayout {
  root: string;
  sourceRoot: string;
  tsconfigPath: string;
  configPath: string;
  /** `<sourceRoot>/lib/theme.ts`; the W6 checkpoint's deliberate convention. */
  themePath: string;
  /** Always `@/lib/theme`, backed by the broad `@/*` paths key. */
  themeImport: "@/lib/theme";
}

/**
 * Finite project snapshot. Keys are absolute paths and values are exact source
 * text. Adapters receive bytes through this map and never import `node:fs`.
 */
export interface InitProjectSnapshot {
  layout: InitProjectLayout;
  files: ReadonlyMap<string, string>;
  /** package name -> authored range/protocol from any dependency section. */
  declaredDependencies: ReadonlyMap<string, string>;
}

export type InitFileKind =
  | "manteen-config"
  | "tsconfig"
  | "framework-config"
  | "entry"
  | "postcss"
  | "theme";

/** Adapter output before the shared planner reads and hashes destinations. */
export interface InitProposedFile {
  kind: InitFileKind;
  destination: string;
  content: string;
}

export type InitInstructionCode = "tailwind-postcss" | "manual-framework";

/**
 * Required work manteen intentionally leaves to the user. It is not a
 * diagnostic: the accepted Tailwind/manual paths are allowed to apply and exit
 * 0, but `required: true` keeps the result from claiming setup is complete.
 */
export interface InitInstruction {
  code: InitInstructionCode;
  required: true;
  message: string;
  path?: string;
  snippet?: string;
}

export interface InitAdapterInput {
  framework: InitTierAFramework;
  project: InitProjectSnapshot;
  aliases: InitAliases;
}

export interface InitAdapterResult {
  files: InitProposedFile[];
  instructions: InitInstruction[];
  diagnostics: Diagnostic[];
}

/** One adapter owns one framework entry-point transform and nothing shared. */
export interface InitAdapter {
  id: InitTierAFramework;
  plan(input: InitAdapterInput): InitAdapterResult;
}

// ---- plan ------------------------------------------------------------------

/** Mutation entries only. An idempotent second run has `files: []`. */
export type InitDisposition = "create" | "update";

export interface InitPlannedFile extends InitProposedFile {
  /** SHA-256 of the exact UTF-8 `content` bytes. */
  sha256: string;
  /** Raw-byte hash read at plan time; null iff the destination was absent. */
  existing: { sha256: string } | null;
  disposition: InitDisposition;
}

export interface InitPlannedDependency {
  name: string;
  range: string;
  dev: boolean;
  /** Stable adapter/shared labels explaining why the dependency is present. */
  wantedBy: string[];
}

export interface InitPlan {
  version: 1;
  root: string;
  framework: InitFrameworkSet;
  /** Only creates/updates. Byte-identical candidates are omitted. */
  files: InitPlannedFile[];
  /** Only packages the consumer still needs installed/declared. */
  dependencies: InitPlannedDependency[];
  /** Null only when there is no install to run or detection refused. */
  packageManager: PackageManagerName | null;
  installCommand: string | null;
  instructions: InitInstruction[];
  diagnostics: Diagnostic[];
  /** Diagnostics after `--force`; instructions never make this false. */
  ok: boolean;
}

export interface InitPlanOptions {
  framework?: InitFrameworkFlag;
  force?: boolean;
  /** D15's explicit package-manager override. */
  packageManager?: PackageManagerName;
}

/**
 * “Empty second plan” is about mutations, not required manual instructions.
 * A Tailwind project may repeat its exact instruction while planning zero
 * writes and zero installs.
 */
export function isInitMutationPlanEmpty(plan: InitPlan): boolean {
  return plan.files.length === 0 && plan.dependencies.length === 0;
}

export function isInitSetupComplete(plan: InitPlan): boolean {
  return !plan.instructions.some((instruction) => instruction.required);
}

// ---- plan ports ------------------------------------------------------------

export interface InitPlanPorts {
  detect(root: string, override?: InitFrameworkFlag): Promise<InitDetectionResult>;
  snapshot(root: string, framework: InitFrameworkSet): Promise<InitProjectSnapshot>;
  adapter(framework: InitTierAFramework): InitAdapter;
  hashFile(path: string): string | null;
  detectPackageManager(root: string): Promise<PackageManagerName | null>;
  installCommand(
    dependencies: readonly InitPlannedDependency[],
    packageManager: PackageManagerName,
  ): string | null;
}

export type PlanInitFn = (
  root: string,
  options: InitPlanOptions,
  ports: InitPlanPorts,
) => Promise<InitPlan>;

// ---- apply -----------------------------------------------------------------

export interface InitApplyOptions {
  interactive: boolean;
  dryRun?: boolean;
}

export interface InitConfirmRequest {
  framework: InitFrameworkFlag;
  files: { destination: string; disposition: InitDisposition }[];
  dependencies: InitPlannedDependency[];
}

export type InitConfirmAnswer = { confirmed: true } | { confirmed: false };
export type InitConfirmPrompt = (request: InitConfirmRequest) => Promise<InitConfirmAnswer>;

export interface InitInstallInput {
  root: string;
  packageManager: PackageManagerName;
  dependencies: InitPlannedDependency[];
  interactive: boolean;
}

export interface InitInstallResult {
  installed: boolean;
  command: string | null;
}

export interface InitJournalUnwind {
  ok: boolean;
  unrestored: string[];
  detail: string | null;
}

export interface InitWriteJournal {
  write(destination: string, content: string): void;
  destinations(): readonly string[];
  unwind(): InitJournalUnwind;
}

export interface InitApplyPorts {
  hashFile(path: string): string | null;
  confirm: InitConfirmPrompt;
  install(input: InitInstallInput): Promise<InitInstallResult>;
  createJournal(): InitWriteJournal;
}

export type InitApplyFailureKind =
  | "stale-plan"
  | "install-failed"
  | "write-failed"
  | "rollback-failed";

export interface InitApplyFailure {
  kind: InitApplyFailureKind;
  message: string;
  paths?: string[];
}

export interface InitApplyOutcome {
  ok: boolean;
  /** False only when the one all-or-nothing confirmation was declined. */
  cancelled: boolean;
  dryRun: boolean;
  /** False when required structured instructions remain after automated work. */
  complete: boolean;
  files: { destination: string; written: boolean }[];
  dependencies: { installed: boolean; command: string | null };
  instructions: InitInstruction[];
  failure: InitApplyFailure | null;
}

export type ApplyInitFn = (
  plan: InitPlan,
  options: InitApplyOptions,
  ports: InitApplyPorts,
) => Promise<InitApplyOutcome>;
