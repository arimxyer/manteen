import { resolve } from "node:path";

import type { Streams } from "../cli/render";
import { PROCESS_STREAMS, renderJson, renderThrown } from "../cli/render";
import { applyConfigEdit, configPreview, planConfigEdit, rawConfig } from "../config/edit";
import type { RegistrySource, RegistrySourceObject } from "../config/types";
import { createInstalledPorts, readInstalled } from "../inventory/index";

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
