/**
 * Reference + registry configuration -> `ItemRequest`.
 *
 * This is where `${VAR}` expansion happens, and it is the reason the module is
 * written the way it is: `env` arrives as a PARAMETER, never as `process.env`.
 * A module that reaches for the ambient environment cannot be tested for the one
 * property that matters here — that an expanded token never escapes.
 *
 * Two URLs come out of every request and they are not interchangeable:
 *
 *   url          fully expanded. Handed to a loader, and nowhere else.
 *   redactedUrl  `${VAR}` left literal. This is the one that reaches the Plan,
 *                the receipt (which is committed to the user's repo), every
 *                diagnostic message and `--json`.
 *
 * Pure — no fs, no network, no env.
 */
import { diag } from "./diagnostics";
import type { NamespacedRef, ResolvableRef } from "./ref";
import type { Diagnostic, ItemRequest } from "./types";

/** The literal a registry URL template must contain. */
export const NAME_PLACEHOLDER = "{name}";

/**
 * One `registries` entry after `config/load.ts` has normalised it.
 *
 * The config schema accepts both the string shorthand and the object form; this
 * is the object form, and load is expected to widen the shorthand into it. It is
 * declared here rather than imported from `config/types.ts` because this module
 * needs exactly these fields and nothing else — taking the whole `LoadedConfig`
 * would couple the env-expansion logic to a type it never reads.
 */
export interface NormalizedRegistry {
  /** URL template containing `{name}`, with any `${VAR}` still literal. */
  url: string;
  /** D21: a second URL, for did-you-mean on 404 and a future `list`/`search`.
   *  Never fetched by `add`. `null` as well as absent, so `config/types.ts`'s
   *  `Registry` — which spells "unset" as `null` — satisfies this shape without
   *  a mapping pass that could only ever introduce drift. */
  index?: string | null;
  headers?: Record<string, string>;
  /** Appended as query parameters. Values are percent-encoded, because unlike
   *  the URL template they are data the author did not place in a URL by hand. */
  params?: Record<string, string>;
}

export type RequestResult =
  | { ok: true; request: ItemRequest }
  | { ok: false; diagnostic: Diagnostic };

/**
 * `${VAR}` — the one expansion syntax.
 *
 * Built fresh on every use: a `/g` regex carries `lastIndex` between calls, and
 * a shared one would make the second scan of the same string start in the middle
 * of it.
 */
const varPattern = () => /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export interface Expansion {
  text: string;
  /** Sorted and deduped, so the message a caller builds is stable. */
  missing: string[];
}

/**
 * Substitute `${VAR}` from `env`.
 *
 * An empty value counts as missing. `Authorization: Bearer ` with nothing after
 * it is a request that fails as a 401, which reads as a bad token rather than as
 * an unset one — and the whole point of the check is to say which variable to
 * set.
 */
export function expandVars(template: string, env: Record<string, string | undefined>): Expansion {
  const missing = new Set<string>();
  const text = template.replace(varPattern(), (whole, name: string) => {
    const value = env[name];
    if (value === undefined || value === "") {
      missing.add(name);
      return whole;
    }
    return value;
  });
  return { text, missing: [...missing].sort() };
}

/**
 * Build the request for one resolvable reference.
 *
 * Bare and invalid references never reach here — see `ambiguousBareRef` for the
 * bare case. That keeps this function total over its input.
 */
export function toRequest(
  ref: ResolvableRef,
  registries: ReadonlyMap<string, NormalizedRegistry>,
  env: Record<string, string | undefined>,
): RequestResult {
  if (ref.kind === "url") {
    // A `url:` reference carries no registry entry, so no headers and no params.
    // Expansion still runs: `manteen add 'https://x/${CHANNEL}/r/a.json'` is a
    // reasonable thing to type, and the id already holds the literal form.
    const { text, missing } = expandVars(ref.url, env);
    if (missing.length > 0) {
      return { ok: false, diagnostic: missingEnv(missing, ref.id, ref.url, null) };
    }
    return {
      ok: true,
      request: { id: ref.id, url: text, redactedUrl: ref.url, headers: {} },
    };
  }

  const entry = registries.get(ref.namespace);
  if (!entry) return { ok: false, diagnostic: unknownNamespace(ref, registries) };

  // Not re-checked for `{name}`: the config schema's `pattern` is the single
  // detector of a template missing it, and it refuses at load with exit 2. Two
  // competing detectors for one rule is how they come to disagree.
  const named = substituteName(entry.url, ref.name);

  const missing = new Set<string>();
  const collect = (expansion: Expansion) => {
    for (const name of expansion.missing) missing.add(name);
    return expansion.text;
  };

  const expandedUrl = collect(expandVars(named, env));
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.headers ?? {})) {
    headers[key] = collect(expandVars(value, env));
  }

  const query: string[] = [];
  const redactedQuery: string[] = [];
  for (const [key, value] of Object.entries(entry.params ?? {})) {
    const encodedKey = encodeURIComponent(key);
    query.push(`${encodedKey}=${encodeURIComponent(collect(expandVars(value, env)))}`);
    redactedQuery.push(`${encodedKey}=${encodeKeepingVars(value)}`);
  }

  const redactedUrl = withQuery(named, redactedQuery);
  if (missing.size > 0) {
    return {
      ok: false,
      diagnostic: missingEnv([...missing].sort(), ref.id, redactedUrl, ref.namespace),
    };
  }

  return {
    ok: true,
    request: { id: ref.id, url: withQuery(expandedUrl, query), redactedUrl, headers },
  };
}

/**
 * The refusal for a bare name.
 *
 * A `defaultRegistry` config field is deferred, so v1 refuses and prints the
 * qualified alternatives — prompting would make one command mean different
 * things on different machines and is impossible in CI.
 */
export function ambiguousBareRef(
  name: string,
  registries: ReadonlyMap<string, NormalizedRegistry>,
): Diagnostic {
  const candidates = [...registries.keys()].sort().map((ns) => `${ns}/${name}`);
  const suggestion =
    candidates.length > 0
      ? ` Try: ${candidates.join(", ")}`
      : ` No registries are configured — add one to "registries" in manteen.json.`;
  return diag("unknown-namespace", `"${name}" needs a namespace.${suggestion}`);
}

function unknownNamespace(
  ref: NamespacedRef,
  registries: ReadonlyMap<string, NormalizedRegistry>,
): Diagnostic {
  const known = [...registries.keys()].sort();
  const tail =
    known.length > 0
      ? `Registered namespaces: ${known.join(", ")}.`
      : `No registries are configured.`;
  return diag(
    "unknown-namespace",
    `${ref.namespace} is not a registered namespace. ${tail} Add it to "registries" in manteen.json.`,
    { items: [ref.id] },
  );
}

function missingEnv(
  missing: string[],
  id: string,
  redactedUrl: string,
  namespace: string | null,
): Diagnostic {
  const vars = missing.map((name) => `\${${name}}`).join(", ");
  const source = namespace ? `${namespace}'s request` : "this request";
  return diag(
    "missing-env",
    `${source} needs ${vars}, which ${missing.length === 1 ? "is" : "are"} not set: ${redactedUrl}`,
    { items: [id] },
  );
}

/**
 * `split`/`join` rather than `replaceAll`, whose *replacement* argument treats
 * `$&`, `` $` `` and `$$` as substitution patterns. Item names cannot contain
 * `$` today (`ref.ts` rejects it), and this is what keeps that from being a
 * silent dependency of this line.
 */
function substituteName(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name);
}

function withQuery(url: string, pairs: string[]): string {
  if (pairs.length === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${pairs.join("&")}`;
}

/**
 * Percent-encode a parameter value while leaving `${VAR}` sequences intact.
 *
 * The redacted URL has to stay readable — the assertion that matters is that a
 * user sees the literal `${REGISTRY_TOKEN}` and never its value — and an encoded
 * `%24%7BREGISTRY_TOKEN%7D` satisfies the letter of that while defeating its
 * purpose.
 */
function encodeKeepingVars(value: string): string {
  const pattern = varPattern();
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the standard exec() iteration idiom; the alternative duplicates the call above and below the loop.
  while ((match = pattern.exec(value)) !== null) {
    out += encodeURIComponent(value.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + encodeURIComponent(value.slice(last));
}
