/**
 * The stable programmatic façade.
 *
 * Existing low-level exports remain available for callers that need every
 * planning port. This surface is intentionally smaller: production-wired read
 * operations, a redacted/content-free preview, and an opaque handle that can
 * only be applied by this module. Importing it performs no I/O.
 */
import { apply as applyPlan } from "../apply/index";
import { createInfoPorts, type InfoReport, readInfo } from "../commands/info";
import { buildList, type ListOptions } from "../commands/list";
import { loadConfig, loadEnv } from "../config/load";
import type { ConfigError, LoadedConfig } from "../config/types";
import {
  type Available,
  type AvailableOptions,
  createIndexLoader,
  createInstalledPorts,
  type Installed,
  type ListResult,
  readAvailable,
  readInstalled,
} from "../inventory/index";
import { plan as planProject } from "../plan/index";
import type {
  ApplyOptions,
  ApplyOutcome,
  Diagnostic,
  Disposition,
  Plan,
  PlannedDependency,
  PlanOptions,
} from "../plan/types";

export interface CreateManteenClientOptions {
  /** Project directory containing `manteen.json`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** A previously validated config. When supplied, `cwd` is ignored. */
  config?: LoadedConfig;
}

/** A configuration refusal at client construction time. */
export class ManteenClientConfigError extends Error {
  readonly errors: readonly ConfigError[];

  constructor(errors: readonly ConfigError[]) {
    super(errors.map((error) => error.message).join("\n"));
    this.name = "ManteenClientConfigError";
    this.errors = errors;
  }
}

export interface ManteenPlanItemPreview {
  id: string;
  wireType: string;
  /** Redacted source URL: `${VAR}` is never expanded here. */
  sourceUrl: string;
  dependsOn: readonly string[];
}

export interface ManteenPlanFilePreview {
  itemId: string;
  sourcePath: string;
  destination: string;
  disposition: Disposition;
  sha256: string;
  existingSha256: string | null;
}

export interface ManteenPlanPreview {
  version: 1;
  operation: "add" | "update";
  root: string;
  ok: boolean;
  items: readonly ManteenPlanItemPreview[];
  files: readonly ManteenPlanFilePreview[];
  dependencies: readonly PlannedDependency[];
  theme: { destination: string; sha256: string; changed: boolean } | null;
  styles: { destination: string; sha256: string; changed: boolean } | null;
  diagnostics: readonly Diagnostic[];
}

/**
 * A plan whose executable bytes are private to this module. `preview` contains
 * no registry file content and cannot be used to forge or alter what `apply`
 * writes; a foreign object with the same public shape is rejected at runtime.
 */
export interface ManteenPlanHandle {
  readonly kind: "manteen-plan";
  readonly preview: ManteenPlanPreview;
}

export type ManteenPlanOptions = Omit<PlanOptions, "interactive"> & { interactive?: boolean };
export type ManteenApplyOptions = Omit<ApplyOptions, "interactive"> & { interactive?: boolean };

export interface ManteenClient {
  readonly root: string;
  list(options?: ListOptions): Promise<ListResult>;
  info(ref: string): Promise<InfoReport>;
  installed(): Installed;
  available(options?: AvailableOptions): Promise<Available>;
  plan(refs: readonly string[], options?: ManteenPlanOptions): Promise<ManteenPlanHandle>;
  apply(handle: ManteenPlanHandle, options?: ManteenApplyOptions): Promise<ApplyOutcome>;
}

const PLANS = new WeakMap<object, Plan>();

/**
 * Create a non-interactive-by-default client for one project. Construction
 * validates configuration once; read and plan calls then share that exact
 * `LoadedConfig`, so alias placement cannot drift between calls.
 */
export function createManteenClient(options: CreateManteenClientOptions = {}): ManteenClient {
  const config = resolveConfig(options);

  return {
    root: config.root,

    async list(listOptions = {}) {
      const env = loadEnv(config.root);
      return buildList(
        config,
        {
          installed: createInstalledPorts(),
          available: { load: createIndexLoader(), env },
        },
        listOptions,
      );
    },

    async info(ref) {
      const env = loadEnv(config.root);
      return readInfo(config, ref, createInfoPorts(config, env));
    },

    installed() {
      return readInstalled(config.root, createInstalledPorts());
    },

    async available(availableOptions = {}) {
      const env = loadEnv(config.root);
      return readAvailable(config, { load: createIndexLoader(), env }, availableOptions);
    },

    async plan(refs, planOptions = {}) {
      const plan = await planProject(config, [...refs], {
        ...planOptions,
        interactive: planOptions.interactive ?? false,
      });
      const handle = Object.freeze({
        kind: "manteen-plan" as const,
        preview: previewPlan(plan),
      });
      PLANS.set(handle, plan);
      return handle;
    },

    async apply(handle, applyOptions = {}) {
      const plan = PLANS.get(handle as object);
      if (plan === undefined) {
        throw new TypeError(
          "Manteen rejected a foreign or expired plan handle. Call this client's plan() first.",
        );
      }
      if (plan.root !== config.root) {
        throw new TypeError("Manteen rejected a plan handle created for a different project root.");
      }
      return applyPlan(plan, {
        ...applyOptions,
        interactive: applyOptions.interactive ?? false,
      });
    },
  };
}

function resolveConfig(options: CreateManteenClientOptions): LoadedConfig {
  if (options.config !== undefined) return options.config;
  const loaded = loadConfig(options.cwd);
  if (!loaded.ok) throw new ManteenClientConfigError(loaded.errors);
  return loaded.config;
}

function previewPlan(plan: Plan): ManteenPlanPreview {
  return deepFreeze({
    version: 1 as const,
    operation: plan.operation,
    root: plan.root,
    ok: plan.ok,
    items: plan.items.map((item) => ({
      id: item.id,
      wireType: item.wireType,
      sourceUrl: item.sourceUrl,
      dependsOn: [...item.dependsOn],
    })),
    files: plan.files.map((file) => ({
      itemId: file.itemId,
      sourcePath: file.sourcePath,
      destination: file.destination,
      disposition: file.disposition,
      sha256: file.sha256,
      existingSha256: file.existing?.sha256 ?? null,
    })),
    dependencies: plan.dependencies.map((dependency) => ({
      ...dependency,
      wantedBy: [...dependency.wantedBy],
    })),
    theme:
      plan.theme === null
        ? null
        : {
            destination: plan.theme.destination,
            sha256: plan.theme.sha256,
            changed: plan.theme.changed,
          },
    styles:
      plan.styles === null
        ? null
        : {
            destination: plan.styles.destination,
            sha256: plan.styles.sha256,
            changed: plan.styles.changed,
          },
    diagnostics: plan.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      ...(diagnostic.items === undefined ? {} : { items: [...diagnostic.items] }),
    })),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
