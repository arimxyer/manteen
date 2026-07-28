/**
 * Registries, canonical ids, and the URL one item is fetched from.
 *
 * PURE. `buildItemUrl` takes the environment as a parameter and returns the
 * redacted and expanded URLs together, from one code path — see its docblock for
 * why that is not an optional detail.
 */
import type { CanonicalId } from "../plan/types";
import { expandEnv } from "./env";
import type { Registry, RegistrySource } from "./types";

/** Canonical ids for a bare `url:` ref carry no namespace and no bare name. */
export const URL_ID_PREFIX = "url:";

/** The literal a registry URL template must contain (D21). */
export const NAME_PLACEHOLDER = "{name}";

export interface SplitId {
  namespace: string | null;
  name: string;
}

/**
 * Split a canonical id into namespace and item name.
 *
 * On the FIRST slash, so a multi-segment name stays whole (D23) — third-party
 * registries and shadcn both allow `blocks/data-table`. This repo's own kit
 * cannot emit one (`writeRegistry` writes `${name}.json` into a single
 * `mkdirSync`'d directory), so the justification is the interchange format's,
 * not ours.
 *
 * A `url:` id has no namespace, and its whole id is the only name it has —
 * there is nothing else to call it.
 */
export function splitItemId(id: CanonicalId): SplitId {
  if (id.startsWith(URL_ID_PREFIX)) return { namespace: null, name: id };

  const slash = id.indexOf("/");
  if (slash === -1) return { namespace: null, name: id };

  return { namespace: id.slice(0, slash), name: id.slice(slash + 1) };
}

/**
 * The bare item name a `resolutions` key could address, or null.
 *
 * Null for a `url:` id — `resolutions` is name-keyed, so a URL ref is
 * unaddressable by it. Callers must treat null as "no resolution can ever
 * authorize this", not as "no resolution was written": the receipt gate's
 * ownership-transfer guard turns on exactly that distinction, and collapsing
 * them lets a resolution the user wrote about one name authorize replacing
 * something else.
 */
export function bareNameOf(id: CanonicalId): string | null {
  const { namespace, name } = splitItemId(id);
  return namespace === null ? null : name;
}

/** Normalize either config form into the object form. Templates stay redacted. */
export function normalizeRegistry(namespace: string, source: RegistrySource): Registry {
  if (typeof source === "string") {
    return { namespace, url: source, index: null, headers: {}, params: {} };
  }

  return {
    namespace,
    url: source.url,
    index: source.index ?? null,
    headers: source.headers ?? {},
    params: source.params ?? {},
  };
}

export interface ItemUrl {
  /** Expanded. Never stored on the Plan, never printed. */
  url: string;
  /** `${VAR}` left literal. This is what the Plan and the receipt store. */
  redactedUrl: string;
  /** Referenced but unset, across the URL template and every param. */
  missing: string[];
}

/**
 * Where one item lives, in both forms.
 *
 * Both come out of one function on purpose. Query parameters have to be
 * percent-encoded, and encoding has to happen AFTER expansion — encoding first
 * turns `${TOKEN}` into `%24%7BTOKEN%7D`, which no later expansion can find.
 * Producing the redacted string by a second, non-encoding path is the only way
 * to keep the two consistent, and doing that in a different module is how they
 * drift apart.
 *
 * `plan/registry-source.ts` composes this with `expandEnvAll(registry.headers)`
 * to build an `ItemRequest`.
 */
export function buildItemUrl(
  registry: Registry,
  name: string,
  env: Record<string, string | undefined>,
): ItemUrl {
  const template = registry.url.replaceAll(NAME_PLACEHOLDER, name);
  const base = expandEnv(template, env);
  const missing = new Set(base.missing);

  const encoded: string[] = [];
  const redacted: string[] = [];

  for (const [key, valueTemplate] of Object.entries(registry.params)) {
    const value = expandEnv(valueTemplate, env);
    for (const variable of value.missing) missing.add(variable);
    encoded.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.value)}`);
    // Not encoded: this string is for humans and for the receipt, and encoding
    // it would only obscure the `${VAR}` the reader is meant to see.
    redacted.push(`${key}=${valueTemplate}`);
  }

  if (encoded.length === 0) {
    return { url: base.value, redactedUrl: template, missing: [...missing] };
  }

  return {
    url: `${base.value}${base.value.includes("?") ? "&" : "?"}${encoded.join("&")}`,
    redactedUrl: `${template}${template.includes("?") ? "&" : "?"}${redacted.join("&")}`,
    missing: [...missing],
  };
}
