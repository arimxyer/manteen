import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createJournal } from "../apply/journal";
import type { Streams } from "../cli/render";
import { PROCESS_STREAMS, renderJson, renderThrown } from "../cli/render";
import { applyConfigEdit, configPreview, planConfigEdit, rawConfig } from "../config/edit";
import { loadEnv } from "../config/load";
import { normalizeRegistry } from "../config/registries";
import type { RegistrySource, RegistrySourceObject } from "../config/types";
import { createInstalledPorts, readInstalled } from "../inventory/index";
import { stableJson } from "../plan/digest";
import { createHttpLoader, isHttpUrl } from "../plan/loader-http";
import { createFileLoader, isFileUrl } from "../plan/loader-local";
import { parseRef } from "../plan/ref";
import { toRequest } from "../plan/registry-source";
import { createItemValidator } from "../plan/validate-item";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { readReceipt } from "../receipt/read";
import { serializeReceipt } from "../receipt/write";

const NAMESPACE = /^@[a-z0-9-]+$/;
const ENV_TEMPLATE = /\$\{[A-Z_][A-Z0-9_]*\}/;

export interface RegistryFlags {
  cwd: string;
  json?: boolean;
  dryRun?: boolean;
  expectPlan?: string;
  url?: string;
  index?: string;
  replace?: boolean;
  header?: string[];
  param?: string[];
}

function pairEntries(values: readonly string[], requireTemplate: boolean): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of values) {
    const equals = entry.indexOf("=");
    const key = equals < 1 ? "" : entry.slice(0, equals);
    const value = equals < 0 ? "" : entry.slice(equals + 1);
    if (!/^[A-Za-z0-9._-]+$/.test(key) || value === "") {
      throw new Error(`Invalid key=value registry option: ${entry}`);
    }
    if (requireTemplate && !ENV_TEMPLATE.test(value)) {
      throw new Error(`Registry header ${key} must contain a literal \${VAR} template.`);
    }
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate registry option: ${key}`);
    result[key] = value;
  }
  return result;
}

function sourceFrom(flags: RegistryFlags): RegistrySource {
  if (flags.url === undefined || !flags.url.includes("{name}")) {
    throw new Error("--url must contain the literal {name} placeholder.");
  }
  const headers = pairEntries(flags.header ?? [], true);
  const params = pairEntries(flags.param ?? [], false);
  if (
    flags.index === undefined &&
    Object.keys(headers).length === 0 &&
    Object.keys(params).length === 0
  ) {
    return flags.url;
  }
  const source: RegistrySourceObject = { url: flags.url };
  if (flags.index !== undefined) source.index = flags.index;
  if (Object.keys(headers).length > 0) source.headers = headers;
  if (Object.keys(params).length > 0) source.params = params;
  return source;
}

function safeSource(source: RegistrySource) {
  if (typeof source === "string") return source;
  return {
    url: source.url,
    ...(source.index === undefined ? {} : { index: source.index }),
    ...(source.headers === undefined ? {} : { headerKeys: Object.keys(source.headers).sort() }),
    ...(source.params === undefined ? {} : { paramKeys: Object.keys(source.params).sort() }),
  };
}

function canonicalSource(source: RegistrySource): unknown {
  const object = typeof source === "string" ? { url: source } : source;
  const ordered = (record: Record<string, string> | undefined) =>
    record === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(record).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        );
  return {
    url: object.url,
    index: object.index ?? null,
    headers: ordered(object.headers) ?? null,
    params: ordered(object.params) ?? null,
  };
}

function sourcesEqual(left: RegistrySource, right: RegistrySource): boolean {
  return JSON.stringify(canonicalSource(left)) === JSON.stringify(canonicalSource(right));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface ReconnectItem {
  id: string;
  wireType: string;
  sourceUrl: string;
  documentSha256: string;
}

interface RegistryReconnectPlan {
  version: 1;
  root: string;
  namespace: string;
  configPath: string;
  receiptPath: string;
  configPreimageSha256: string;
  receiptPreimageSha256: string;
  configResultSha256: string;
  receiptResultSha256: string;
  planDigest: string;
  changed: boolean;
  items: ReconnectItem[];
  /** Apply-only bytes. Renderers must not expose these fields. */
  configContent: string;
  receiptContent: string;
}

interface RegistryReconnectOutcome {
  ok: boolean;
  mutated: boolean;
  failure: {
    kind: "registry-reconnect-stale" | "registry-reconnect-write-failed";
    message: string;
  } | null;
}

class RegistryReconnectRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryReconnectRefusal";
  }
}

async function planRegistryReconnect(
  root: string,
  namespace: string,
  source: RegistrySource,
): Promise<RegistryReconnectPlan> {
  const config = rawConfig(root);
  if (config.registries[namespace] === undefined) {
    throw new Error(`${namespace} is not configured; use registry add first.`);
  }

  const state = readReceipt(root, createReceiptReader(), createReceiptValidator());
  if (!state.present)
    throw new Error("No install receipt exists; use registry add --replace instead.");
  if (!state.ok) throw new Error(`The install receipt is unreadable: ${state.detail}`);
  const owned = state.receipt.items.filter((item) => item.registry === namespace);
  if (owned.length === 0) {
    throw new Error(
      `${namespace} has no installed receipt items; use registry add --replace instead.`,
    );
  }

  const registry = normalizeRegistry(namespace, source);
  const registries = new Map([[namespace, registry]]);
  const env = loadEnv(root);
  const file = createFileLoader();
  const http = createHttpLoader();
  const load = async (request: Parameters<typeof http>[0]) => {
    if (isFileUrl(request.url)) return file(request);
    if (isHttpUrl(request.url)) return http(request);
    return {
      ok: false as const,
      reason: "network" as const,
      redactedUrl: request.redactedUrl,
      detail: "unsupported registry URL scheme (expected file:, http:, or https:)",
    };
  };
  const validate = createItemValidator();
  const evidence: ReconnectItem[] = [];

  for (const prior of [...owned].sort((left, right) => compareCodeUnits(left.id, right.id))) {
    const ref = parseRef(prior.id);
    if (ref.kind !== "namespaced" || ref.namespace !== namespace) {
      throw new Error(`${prior.id} is not a valid receipt identity for ${namespace}.`);
    }
    const request = toRequest(ref, registries, env);
    if (!request.ok) throw new RegistryReconnectRefusal(request.diagnostic.message);
    const loaded = await load(request.request);
    if (!loaded.ok) {
      const status =
        loaded.status === undefined ? loaded.reason : `${loaded.reason} ${loaded.status}`;
      throw new RegistryReconnectRefusal(
        `Could not verify ${prior.id} at ${loaded.redactedUrl}: ${status}${loaded.detail ? ` (${loaded.detail})` : ""}.`,
      );
    }
    const checked = validate(loaded.doc, {
      id: ref.id,
      expectedName: ref.name,
      redactedUrl: loaded.redactedUrl,
    });
    if (!checked.ok || checked.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      const detail = checked.diagnostics.map((diagnostic) => diagnostic.message).join(" ");
      throw new RegistryReconnectRefusal(
        `Could not verify ${prior.id} at the new endpoint: ${detail || "invalid registry item"}`,
      );
    }
    if (checked.item.name !== ref.name) {
      throw new RegistryReconnectRefusal(
        `${prior.id} resolved to item name ${checked.item.name}; expected ${ref.name}.`,
      );
    }
    if (checked.item.wireType !== prior.wireType) {
      throw new RegistryReconnectRefusal(
        `${prior.id} changed wire type from ${prior.wireType} to ${checked.item.wireType}.`,
      );
    }
    evidence.push({
      id: prior.id,
      wireType: prior.wireType,
      sourceUrl: request.request.redactedUrl,
      documentSha256: sha256(stableJson(loaded.doc)),
    });
  }

  const byId = new Map(evidence.map((item) => [item.id, item]));
  const nextReceipt = {
    ...state.receipt,
    items: state.receipt.items.map((item) => {
      const replacement = byId.get(item.id);
      return replacement === undefined ? item : { ...item, sourceUrl: replacement.sourceUrl };
    }),
  };
  const receiptContent = serializeReceipt(nextReceipt);
  const registriesConfig = { ...config.registries, [namespace]: source };
  const configEdit = planConfigEdit(
    root,
    `registry-reconnect:${namespace}`,
    "registries",
    registriesConfig,
  );
  const configResultSha256 = sha256(configEdit.content);
  const receiptResultSha256 = sha256(receiptContent);
  const digestInput = {
    version: 1,
    root,
    namespace,
    configPreimageSha256: configEdit.preimageSha256,
    receiptPreimageSha256: state.sha256,
    configResultSha256,
    receiptResultSha256,
    items: evidence,
  };
  return {
    version: 1,
    root,
    namespace,
    configPath: configEdit.configPath,
    receiptPath: state.path,
    configPreimageSha256: configEdit.preimageSha256,
    receiptPreimageSha256: state.sha256,
    configResultSha256,
    receiptResultSha256,
    planDigest: sha256(stableJson(digestInput)),
    changed: configEdit.changed || state.raw !== receiptContent,
    items: evidence,
    configContent: configEdit.content,
    receiptContent,
  };
}

function reconnectPreview(plan: RegistryReconnectPlan) {
  return {
    version: plan.version,
    operation: "registry-reconnect",
    paths: [
      {
        path: "manteen.json",
        preimageSha256: plan.configPreimageSha256,
        resultSha256: plan.configResultSha256,
      },
      {
        path: "manteen.lock.json",
        preimageSha256: plan.receiptPreimageSha256,
        resultSha256: plan.receiptResultSha256,
      },
    ],
    changed: plan.changed,
    items: plan.items,
  };
}

function applyRegistryReconnect(
  plan: RegistryReconnectPlan,
  expectedPlan: string,
): RegistryReconnectOutcome {
  let configBytes: Buffer;
  let receiptBytes: Buffer;
  try {
    configBytes = readFileSync(plan.configPath);
    receiptBytes = readFileSync(plan.receiptPath);
  } catch (error) {
    return {
      ok: false,
      mutated: false,
      failure: {
        kind: "registry-reconnect-stale",
        message: `Reconnect inputs could not be re-read: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  if (
    plan.planDigest !== expectedPlan ||
    sha256(configBytes) !== plan.configPreimageSha256 ||
    sha256(receiptBytes) !== plan.receiptPreimageSha256
  ) {
    return {
      ok: false,
      mutated: false,
      failure: {
        kind: "registry-reconnect-stale",
        message:
          "manteen.json, manteen.lock.json, or the verified endpoint changed; run a new dry-run.",
      },
    };
  }
  if (!plan.changed) return { ok: true, mutated: false, failure: null };
  const journal = createJournal();
  try {
    journal.writeChecked(plan.configPath, plan.configPreimageSha256, plan.configContent);
    journal.writeChecked(plan.receiptPath, plan.receiptPreimageSha256, plan.receiptContent);
    return { ok: true, mutated: true, failure: null };
  } catch (error) {
    const unwind = journal.unwind();
    return {
      ok: false,
      mutated: !unwind.ok,
      failure: {
        kind: "registry-reconnect-write-failed",
        message: `${error instanceof Error ? error.message : String(error)}${unwind.ok ? " Every reconnect write was restored." : ` Rollback failed: ${unwind.detail ?? "unknown"}.`}`,
      },
    };
  }
}

function document(
  root: string,
  operation: string,
  dryRun: boolean,
  plan: ReturnType<typeof planConfigEdit> | null,
  outcome: ReturnType<typeof applyConfigEdit> | null,
  extra: Record<string, unknown> = {},
) {
  return {
    command: "registry" as const,
    root,
    ok: outcome?.ok ?? true,
    operation,
    dryRun,
    planDigest: plan?.planDigest ?? null,
    plan: plan === null ? null : configPreview(plan),
    outcome,
    ...extra,
    diagnostics: [],
    notes: [],
  };
}

export async function runRegistryList(
  flags: RegistryFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    const config = rawConfig(root);
    const registries = Object.entries(config.registries)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([namespace, source]) => ({ namespace, source: safeSource(source) }));
    if (flags.json)
      streams.stdout(renderJson(document(root, "list", false, null, null, { registries })));
    else for (const registry of registries) streams.stdout(`${registry.namespace}\n`);
    return 0;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}

export async function runRegistryAdd(
  namespace: string,
  flags: RegistryFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    if (!NAMESPACE.test(namespace)) throw new Error(`Invalid registry namespace: ${namespace}`);
    const config = rawConfig(root);
    const source = sourceFrom(flags);
    const existing = config.registries[namespace];
    if (existing !== undefined && !sourcesEqual(existing, source) && !flags.replace) {
      throw new Error(
        `${namespace} already exists with different configuration; review --replace explicitly.`,
      );
    }
    if (existing !== undefined && !sourcesEqual(existing, source)) {
      const installed = readInstalled(root, createInstalledPorts());
      if (installed.source.state === "unreadable")
        throw new Error("The install receipt is unreadable.");
      if (installed.items.some((item) => item.registry === namespace)) {
        throw new Error(
          `${namespace} is referenced by installed receipt items and cannot be replaced.`,
        );
      }
    }
    const registries = { ...config.registries, [namespace]: source };
    const plan = planConfigEdit(root, `registry-add:${namespace}`, "registries", registries);
    if (flags.dryRun) {
      if (flags.json)
        streams.stdout(
          renderJson(
            document(root, "add", true, plan, null, { namespace, source: safeSource(source) }),
          ),
        );
      else
        streams.stdout(
          `review  ${namespace}\nplan    ${plan.planDigest}\nDry run — nothing was written.\n`,
        );
      return 0;
    }
    if (flags.expectPlan === undefined)
      throw new Error("A real registry change requires --expect-plan from an equivalent dry-run.");
    const outcome = applyConfigEdit(plan, flags.expectPlan);
    if (flags.json)
      streams.stdout(
        renderJson(
          document(root, "add", false, plan, outcome, { namespace, source: safeSource(source) }),
        ),
      );
    else if (outcome.ok)
      streams.stdout(`${outcome.mutated ? "updated" : "unchanged"}  ${namespace}\n`);
    else streams.stderr(`${outcome.failure?.message}\n`);
    return outcome.ok ? 0 : 1;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}

export async function runRegistryReconnect(
  namespace: string,
  flags: RegistryFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    if (!NAMESPACE.test(namespace)) throw new Error(`Invalid registry namespace: ${namespace}`);
    const source = sourceFrom(flags);
    const plan = await planRegistryReconnect(root, namespace, source);
    if (flags.dryRun) {
      if (flags.json) {
        streams.stdout(
          renderJson({
            command: "registry",
            root,
            ok: true,
            operation: "reconnect",
            dryRun: true,
            planDigest: plan.planDigest,
            plan: reconnectPreview(plan),
            namespace,
            source: safeSource(source),
            diagnostics: [],
            notes: [],
          }),
        );
      } else {
        streams.stdout(
          `reconnect  ${namespace}\nverified   ${plan.items.length} installed item${plan.items.length === 1 ? "" : "s"}\nplan       ${plan.planDigest}\nDry run — nothing was written.\n`,
        );
      }
      return 0;
    }
    if (flags.expectPlan === undefined) {
      throw new Error(
        "A real registry reconnect requires --expect-plan from an equivalent dry-run.",
      );
    }
    const outcome = applyRegistryReconnect(plan, flags.expectPlan);
    if (flags.json) {
      streams.stdout(
        renderJson({
          command: "registry",
          root,
          ok: outcome.ok,
          operation: "reconnect",
          dryRun: false,
          planDigest: plan.planDigest,
          plan: reconnectPreview(plan),
          outcome,
          namespace,
          source: safeSource(source),
          diagnostics: [],
          notes: [],
        }),
      );
    } else if (outcome.ok) {
      streams.stdout(`${outcome.mutated ? "reconnected" : "unchanged"}  ${namespace}\n`);
    } else {
      streams.stderr(`${outcome.failure?.message}\n`);
    }
    return outcome.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof RegistryReconnectRefusal) {
      streams.stderr(`registry-reconnect-refused  ${error.message}\n`);
      return 1;
    }
    streams.stderr(renderThrown(error));
    return 2;
  }
}

export async function runRegistryRemove(
  namespace: string,
  flags: RegistryFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  const root = resolve(flags.cwd);
  try {
    if (!NAMESPACE.test(namespace)) throw new Error(`Invalid registry namespace: ${namespace}`);
    const config = rawConfig(root);
    if (!Object.hasOwn(config.registries, namespace))
      throw new Error(`${namespace} is not configured.`);
    if (Object.keys(config.registries).length === 1)
      throw new Error("The last configured registry cannot be removed.");
    const installed = readInstalled(root, createInstalledPorts());
    if (installed.source.state === "unreadable")
      throw new Error("The install receipt is unreadable.");
    const owned = installed.items
      .filter((item) => item.registry === namespace)
      .map((item) => item.id);
    if (owned.length > 0)
      throw new Error(`${namespace} is referenced by installed items: ${owned.join(", ")}.`);
    const registries = { ...config.registries };
    delete registries[namespace];
    const plan = planConfigEdit(root, `registry-remove:${namespace}`, "registries", registries);
    if (flags.dryRun) {
      if (flags.json)
        streams.stdout(renderJson(document(root, "remove", true, plan, null, { namespace })));
      else
        streams.stdout(
          `remove  ${namespace}\nplan    ${plan.planDigest}\nDry run — nothing was written.\n`,
        );
      return 0;
    }
    if (flags.expectPlan === undefined)
      throw new Error("A real registry change requires --expect-plan from an equivalent dry-run.");
    const outcome = applyConfigEdit(plan, flags.expectPlan);
    if (flags.json)
      streams.stdout(renderJson(document(root, "remove", false, plan, outcome, { namespace })));
    else if (outcome.ok) streams.stdout(`removed  ${namespace}\n`);
    else streams.stderr(`${outcome.failure?.message}\n`);
    return outcome.ok ? 0 : 1;
  } catch (error) {
    streams.stderr(renderThrown(error));
    return 2;
  }
}
