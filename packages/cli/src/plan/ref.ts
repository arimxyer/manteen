/**
 * Reference parsing — the only place a user-typed or wire-supplied item
 * reference becomes a `CanonicalId`.
 *
 * Two vocabularies meet here and they are not the same:
 *
 *   ref           what a person types (`@base/empty-state`) or what an item's
 *                 `registryDependencies` entry holds (which may be bare)
 *   CanonicalId   the identity every later stage dedupes on
 *
 * Identity dedupe keys on the canonical id and on nothing else (D8). That is the
 * fix for the shipped bug: deduping by destination is what let `@base/empty-state`
 * silently overwrite `@house/empty-state`. So this module must never normalise two
 * different references into one id, and must never make one reference produce two.
 *
 * Pure — no fs, no network, no env.
 */
import type { CanonicalId } from "./types";

/** Matches the config schema's `registries` key pattern, deliberately. */
export const NAMESPACE_PATTERN = /^@[a-z0-9-]+$/;

/** A canonical id for a bare `url:` reference — an item with no namespace. */
export const URL_ID_PREFIX = "url:";

/**
 * `file:` is here because a `file://` registry template is how the e2e tier and
 * every fixture registry are served; `loader-local.ts` reads those off disk
 * because Node's `fetch` rejects the scheme outright.
 */
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:", "file:"]);

/** Anything with a leading scheme is a URL reference, not a namespaced one. */
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * One path segment of an item name.
 *
 * `$` is excluded so a name can never introduce a `${VAR}` sequence into a URL
 * template at substitution time, and `/` is handled by the segment split rather
 * than by this pattern — see `parseName`.
 */
const NAME_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface NamespacedRef {
  kind: "namespaced";
  id: CanonicalId;
  namespace: string;
  /** May contain slashes: `blocks/data-table` is one name, not two (D23). */
  name: string;
}

export interface UrlRef {
  kind: "url";
  id: CanonicalId;
  /**
   * Exactly as written, including any unexpanded `${VAR}`. Expansion happens in
   * `registry-source.ts`; keeping the literal here is what makes the canonical
   * id safe to put on the Plan and in the committed receipt.
   */
  url: string;
}

export interface BareRef {
  kind: "bare";
  name: string;
}

export interface InvalidRef {
  kind: "invalid";
  input: string;
  /** A sentence fragment completing "… because <reason>". */
  reason: string;
}

export type ParsedRef = NamespacedRef | UrlRef | BareRef | InvalidRef;

/** A reference that can actually be fetched: it names a source. */
export type ResolvableRef = NamespacedRef | UrlRef;

export function canonicalId(namespace: string, name: string): CanonicalId {
  return `${namespace}/${name}`;
}

export function urlId(url: string): CanonicalId {
  return `${URL_ID_PREFIX}${url}`;
}

export function isUrlId(id: CanonicalId): boolean {
  return id.startsWith(URL_ID_PREFIX);
}

/**
 * The bare name of a canonical id, or `null` when it has none.
 *
 * `null` for a `url:` id is load-bearing, not a degenerate case: name-keyed
 * `resolutions` cannot address a URL, so a `url:` party to a collision must
 * never be waved through by one.
 */
export function bareNameOfRef(ref: ParsedRef): string | null {
  return ref.kind === "namespaced" ? ref.name : null;
}

/**
 * Parse one reference.
 *
 * Never throws — every rejection is an `InvalidRef` the caller turns into a
 * diagnostic, because a malformed `registryDependencies` entry three levels deep
 * in a walk must not surface as a stack trace.
 */
export function parseRef(input: string): ParsedRef {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "invalid", input, reason: "it is empty" };

  if (trimmed.startsWith(URL_ID_PREFIX)) {
    return parseUrl(input, trimmed.slice(URL_ID_PREFIX.length));
  }
  if (trimmed.startsWith("@")) return parseNamespaced(input, trimmed);
  if (SCHEME_PATTERN.test(trimmed)) return parseUrl(input, trimmed);

  const name = parseName(trimmed);
  if (typeof name !== "string") return { kind: "invalid", input, reason: name.reason };
  return { kind: "bare", name };
}

/**
 * A `registryDependencies` entry, resolved against the item that declared it.
 *
 * §5a resolution 5: the toolchain qualifies bare `uses` at build time, so a bare
 * entry that survives into the wire means a hand-written registry — and
 * parent-relative is the only reading that keeps a Tailwind-shaped component
 * from the public shadcn registry out of a Mantine project. It is assumed, so it
 * warns; `assumedLocal` is the caller's signal to emit `bare-dep-assumed-local`.
 */
export type DependencyRef =
  | { ok: true; ref: ResolvableRef; assumedLocal: boolean }
  /** Bare, and the declaring item has no namespace to borrow — a `url:` item.
   *  There is nothing to guess from, so the caller refuses. */
  | { ok: false; bare: true; name: string }
  | { ok: false; bare: false; input: string; reason: string };

export function parseDependencyRef(
  spec: string,
  parentNamespace: string | null,
): DependencyRef {
  const ref = parseRef(spec);

  if (ref.kind === "namespaced" || ref.kind === "url") {
    return { ok: true, ref, assumedLocal: false };
  }
  if (ref.kind === "invalid") {
    return { ok: false, bare: false, input: ref.input, reason: ref.reason };
  }
  if (parentNamespace === null) return { ok: false, bare: true, name: ref.name };

  return {
    ok: true,
    ref: {
      kind: "namespaced",
      id: canonicalId(parentNamespace, ref.name),
      namespace: parentNamespace,
      name: ref.name,
    },
    assumedLocal: true,
  };
}

function parseNamespaced(input: string, trimmed: string): ParsedRef {
  // FIRST slash, so `@house/blocks/data-table` is namespace `@house` and name
  // `blocks/data-table` (D23). Multi-segment names come from third-party and
  // shadcn-shaped registries; this repo's toolchain cannot emit one.
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return {
      kind: "invalid",
      input,
      reason: "a namespaced reference needs a name after the namespace, like @base/empty-state",
    };
  }

  const namespace = trimmed.slice(0, slash);
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return {
      kind: "invalid",
      input,
      reason: `"${namespace}" is not a valid namespace (lowercase letters, digits and dashes after the @)`,
    };
  }

  const name = parseName(trimmed.slice(slash + 1));
  if (typeof name !== "string") return { kind: "invalid", input, reason: name.reason };

  return { kind: "namespaced", id: canonicalId(namespace, name), namespace, name };
}

function parseUrl(input: string, url: string): ParsedRef {
  let protocol: string;
  try {
    ({ protocol } = new URL(url));
  } catch {
    return { kind: "invalid", input, reason: "it is not a parseable URL" };
  }

  if (!SUPPORTED_PROTOCOLS.has(protocol)) {
    return {
      kind: "invalid",
      input,
      reason: `${protocol}// references are not supported (use http://, https:// or file://)`,
    };
  }

  // Not normalised. Two spellings of one URL stay two ids; the destination
  // collision check is what catches the resulting clash, and it reports both
  // spellings — which is more useful than silently merging them.
  return { kind: "url", id: urlId(url), url };
}

function parseName(raw: string): string | { reason: string } {
  if (raw === "") return { reason: "the item name is empty" };

  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "") return { reason: `"${raw}" has an empty path segment` };
    // A name is substituted into a URL template, so `..` here would walk out of
    // the registry's own path server-side.
    if (segment === "." || segment === "..") {
      return { reason: `"${raw}" contains a relative path segment` };
    }
    if (!NAME_SEGMENT_PATTERN.test(segment)) {
      return { reason: `"${raw}" contains characters that are not allowed in an item name` };
    }
  }

  return raw;
}
