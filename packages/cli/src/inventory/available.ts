/**
 * AVAILABLE — what a registry offers, read from D21's per-registry `index` URL.
 *
 * A registry with no `index` is NOT an error. D21 made the field optional and
 * declared rather than inferred (`add` never needs it), so "cannot be listed" is
 * an ordinary property of a registry and the result says which ones were skipped
 * and why. `list` prints that; it does not fail on it.
 *
 * Two things are reused rather than re-derived, and both matter:
 *
 *  1. **Loader selection.** `createIndexLoader` dispatches on scheme exactly as
 *     `plan/index.ts` does — `file:` to the local loader, `http(s):` to the HTTP
 *     one — because Node's `fetch` rejects `file:` outright, which is how every
 *     fixture registry and the whole e2e tier are served. Going through the real
 *     loaders also inherits D25's 8 MB streaming ceiling, the per-request
 *     timeout, and the rule that a failure detail is authored from an errno and
 *     never from an error's message.
 *  2. **Index source resolution.** `indexSourceFor` is the single place a
 *     `Registry` becomes a request. `plan/index.ts`'s private `indexResolverFor`
 *     should delegate to it (see that function's docblock).
 *
 * SECRETS. `IndexRequest.url` and `.headers` are EXPANDED and are the only
 * values in this feature that may hold a `${VAR}`'s value. Neither ever reaches
 * a result shape, a note, or a thrown message. Everything printable comes from
 * `redactedUrl`, which is the template with `${VAR}` left literal.
 *
 * The index is a REGISTRY-CONTROLLED document whose fields we print to a
 * terminal. `sanitize` below is not decoration.
 *
 * IMPURE only in `createIndexLoader`, which composes the two existing loaders.
 * Nothing here writes.
 */
import { Buffer } from "node:buffer";

import type { LoadedConfig, Registry } from "../config/types";
import { createHttpLoader, isHttpUrl } from "../plan/loader-http";
import { createFileLoader, isFileUrl } from "../plan/loader-local";
import { parseRef } from "../plan/ref";
import { expandVars } from "../plan/registry-source";
import type { CanonicalId, ItemRequest, LoadedDoc } from "../plan/types";
import type { ValidatedItem } from "../plan/validate-item";
import type {
  Available,
  AvailableItem,
  DetailFile,
  DetailMeta,
  IndexMeta,
  InventoryNote,
  ItemDetail,
  RegistryListing,
} from "./types";

/**
 * A bound on any registry-controlled string we print.
 *
 * Not a defence against a huge index — D25's response ceiling already is one —
 * but against a single 10 KB "title" that owns the terminal. Titles and
 * descriptions are one line each in every real registry.
 */
const MAX_NAME = 128;
const MAX_TEXT = 240;

/**
 * Characters that change what a terminal DOES rather than what it shows.
 *
 * C0 (including ESC, which starts an ANSI sequence), DEL, C1, the zero-width and
 * directional-formatting block, the line/paragraph separators, and the
 * bidirectional overrides that make text render in an order other than the one
 * it is stored in. A registry that puts any of these in an item name is not
 * describing an item.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is precisely the job — this is the sanitizer, and the rule's normal warning (an accidental escape in a pattern) does not apply to a class written on purpose.
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g;

// ---- index source ------------------------------------------------------------

/**
 * One index fetch, in both URL forms.
 *
 * Structurally a superset of `loader-http.ts`'s `IndexSource` (`url` +
 * `headers`), so it satisfies that contract where the did-you-mean path wants
 * one. The extra fields exist because a listing REPORTS its failures — the
 * did-you-mean path degrades to silence and therefore never needed a printable
 * URL.
 */
export interface IndexRequest {
  /** The namespace this index belongs to. */
  registry: string;
  /** EXPANDED. Handed to a loader and nowhere else. Never printed, never put in
   *  a note, never interpolated into a thrown message. */
  url: string;
  /** `${VAR}` left literal. The only form safe to print. */
  redactedUrl: string;
  /** EXPANDED. Same rule as `url`. */
  headers: Record<string, string>;
}

export type IndexSourceResult =
  | { ok: true; request: IndexRequest }
  /** The registry declares no `index` (D21). Not a failure. */
  | { ok: false; reason: "no-index" }
  /** A `${VAR}` in the URL, a header or a param is unset. */
  | { ok: false; reason: "missing-env"; missing: string[]; redactedUrl: string };

/**
 * Turn a configured registry into an index request, or say why it cannot be one.
 *
 * The single implementation. `plan/index.ts`'s `indexResolverFor` resolves the
 * same three things (URL, headers, params) for the 404 did-you-mean and should
 * delegate here rather than keep its own copy — two implementations of "what is
 * this registry's index URL" is how the listing and the suggestion come to
 * disagree about which registry was even asked.
 *
 * `expandVars` from `registry-source.ts`, NOT `expandEnv` from `config/env.ts`:
 * the two disagree about an empty value (one counts it missing, the other counts
 * it set) and the item path uses the former. A registry whose token is set to
 * "" must not get an item-path `missing-env` refusal alongside an index request
 * that goes out with a bare `Bearer `.
 *
 * `missing-env` on ANY unset variable, in the URL, a header or a param. A URL
 * with a hole in it must never go out: a registry logs what it was asked for,
 * and a request carrying a literal `?token=${REGISTRY_TOKEN}` publishes the
 * shape of the user's config to a server that failed to authenticate them.
 *
 * `params` are appended because they are documented as going to every request to
 * the registry, and the index is one — a registry that authenticates by query
 * parameter would otherwise 401 its own index.
 */
export function indexSourceFor(
  registry: Registry,
  env: Record<string, string | undefined>,
): IndexSourceResult {
  if (registry.index === null) return { ok: false, reason: "no-index" };

  const missing = new Set<string>();
  const collect = (expansion: { text: string; missing: string[] }): string => {
    for (const name of expansion.missing) missing.add(name);
    return expansion.text;
  };

  const base = collect(expandVars(registry.index, env));

  const headers: Record<string, string> = {};
  for (const [key, template] of Object.entries(registry.headers)) {
    headers[key] = collect(expandVars(template, env));
  }

  const query: string[] = [];
  const redactedQuery: string[] = [];
  for (const [key, template] of Object.entries(registry.params)) {
    const encodedKey = encodeURIComponent(key);
    query.push(`${encodedKey}=${encodeURIComponent(collect(expandVars(template, env)))}`);
    // DISPLAY ONLY, and deliberately not percent-encoded. This string is never
    // joined against, compared with, or substituted into `toRequest`'s redacted
    // URL — it exists so a human reading a note sees the literal
    // `${REGISTRY_TOKEN}` rather than an encoded rendering of it that satisfies
    // the letter of redaction while defeating its purpose.
    redactedQuery.push(`${key}=${template}`);
  }

  const redactedUrl = withQuery(registry.index, redactedQuery);

  if (missing.size > 0) {
    return { ok: false, reason: "missing-env", missing: [...missing].sort(), redactedUrl };
  }

  return {
    ok: true,
    request: { registry: registry.namespace, url: withQuery(base, query), redactedUrl, headers },
  };
}

function withQuery(url: string, pairs: string[]): string {
  if (pairs.length === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${pairs.join("&")}`;
}

// ---- the loader ---------------------------------------------------------------

export type IndexLoader = (request: IndexRequest) => Promise<LoadedDoc>;

export interface IndexLoaderOptions {
  /** Defaults to the HTTP loader's own 30 s budget. */
  timeoutMs?: number;
  /** Defaults to D25's 8 MB ceiling, taken from the loaders. */
  maxBytes?: number;
  /** Test seam, passed through to the HTTP loader. */
  fetchImpl?: typeof fetch;
}

/**
 * Scheme dispatch, matching `plan/index.ts`'s `createLoader` exactly.
 *
 * Deliberately built with NO `index` resolver on the HTTP loader: that option
 * exists to attach a did-you-mean to a 404 by fetching the registry's index, and
 * this loader IS the index fetch. Passing one would make a missing index try to
 * fetch itself to explain itself.
 *
 * The third branch is not a formality — falling through to either loader for an
 * unrecognised scheme turns `s3://bucket/registry.json` into "no such file or
 * directory", a message about a different problem entirely.
 */
export function createIndexLoader(options: IndexLoaderOptions = {}): IndexLoader {
  const file = createFileLoader(
    options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes },
  );
  const http = createHttpLoader({
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });

  return async (request) => {
    const item = toItemRequest(request);
    if (isFileUrl(request.url)) return file(item);
    if (isHttpUrl(request.url)) return http(item);
    return {
      ok: false,
      reason: "network",
      redactedUrl: request.redactedUrl,
      detail: unsupportedScheme(request.redactedUrl),
    };
  };
}

/**
 * The synthetic `ItemRequest` the loaders take.
 *
 * `id` is built from the REDACTED url, never the expanded one. Nothing on this
 * path reads it today — `createMemoryLoader` keys on it, and the HTTP loader's
 * `itemNameOf` returns `null` for a `url:` id so the did-you-mean is inert — but
 * an id built from the expanded form would put a token one `console.log` away
 * from a transcript, at zero benefit.
 */
function toItemRequest(request: IndexRequest): ItemRequest {
  return {
    id: `url:${request.redactedUrl}`,
    url: request.url,
    redactedUrl: request.redactedUrl,
    headers: request.headers,
  };
}

/** The scheme, taken from the REDACTED url — a `${VAR}` at the very start of a
 *  template makes the two disagree, and the literal is what the user needs. */
function unsupportedScheme(redactedUrl: string): string {
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(redactedUrl)?.[0];
  return scheme === undefined
    ? "the index URL has no scheme — manteen fetches file:, http: and https:"
    : `${scheme} is not a scheme manteen fetches — use file:, http: or https:`;
}

// ---- parsing ------------------------------------------------------------------

/** One index document, after validation and sanitization. */
export interface ParsedIndex {
  /** The index's own `name`, sanitized. */
  title: string | null;
  homepage: string | null;
  items: AvailableItem[];
  /** Entries that named no item at all and were skipped. */
  dropped: number;
}

/**
 * Read an index document, or `null` when it is not one.
 *
 * Two shapes are accepted, matching `loader-http.ts`'s `itemNamesOf`: the kit's
 * `registry.json` (`{ name, homepage?, items: [...] }`) and a bare array, because
 * third-party registries publish both and the cost of tolerating the second is
 * one branch. Anything else is `null`, which becomes an `index-invalid` note —
 * never a throw, and never a partial listing that looks complete.
 *
 * There is no ajv schema for an index. Writing one would mean shipping a fourth
 * schema file to validate a document whose only required field is a name per
 * entry, and every rule below is one this function has to apply anyway to
 * sanitize what it keeps.
 */
export function parseIndex(doc: unknown, namespace: string): ParsedIndex | null {
  const record = isRecord(doc) ? doc : null;
  const list = Array.isArray(doc) ? doc : Array.isArray(record?.["items"]) ? record["items"] : null;
  if (list === null) return null;

  const items: AvailableItem[] = [];
  let dropped = 0;

  for (const entry of list) {
    const item = toAvailableItem(entry, namespace);
    if (item === null) dropped += 1;
    else items.push(item);
  }

  // Sorted by the RAW name and by code unit. The order of `items` in an index is
  // the registry's choice and must not decide ours, and `localeCompare` would
  // make the output depend on the machine's locale — this repo asserts
  // byte-identical output elsewhere and a listing is no different.
  items.sort((a, b) => (a.rawName < b.rawName ? -1 : a.rawName > b.rawName ? 1 : 0));

  return {
    title: record === null ? null : text(record["name"], MAX_NAME),
    homepage: record === null ? null : text(record["homepage"], MAX_TEXT),
    items,
    dropped,
  };
}

/**
 * One index entry.
 *
 * `id` is derived from the RAW name via `parseRef`, before any sanitizing.
 * `ref.ts` is the single detector of what `add` will accept, and its
 * `NAME_SEGMENT_PATTERN` already rejects control characters, `$` and relative
 * segments — so a hostile name yields `id: null` ("listed, not installable") for
 * free. Deriving the id from the SANITIZED name instead would mint an id that
 * 404s: `list` would advertise a name the registry does not serve.
 */
function toAvailableItem(entry: unknown, namespace: string): AvailableItem | null {
  if (typeof entry === "string") return itemFrom(entry, namespace, null, null, null, null);
  if (!isRecord(entry)) return null;

  const rawName = entry["name"];
  if (typeof rawName !== "string" || rawName === "") return null;

  return itemFrom(
    rawName,
    namespace,
    text(entry["type"], MAX_NAME),
    text(entry["title"], MAX_TEXT),
    text(entry["description"], MAX_TEXT),
    indexMeta(entry["meta"]),
  );
}

function itemFrom(
  rawName: string,
  namespace: string,
  type: string | null,
  title: string | null,
  description: string | null,
  mantine: IndexMeta | null,
): AvailableItem {
  const parsed = parseRef(`${namespace}/${rawName}`);
  return {
    id: parsed.kind === "namespaced" ? parsed.id : null,
    rawName,
    name: sanitize(rawName, MAX_NAME),
    registry: namespace,
    type,
    title,
    description,
    mantine,
  };
}

/**
 * `meta.mantine` from an index entry.
 *
 * Shape-checked by hand rather than through `validate-item.ts`'s ajv schema:
 * that validator is for an ITEM DOCUMENT, and an index entry is a summary of
 * one. Running it here would either reject legitimate index entries or require
 * a second schema, and the four fields below are the whole surface.
 *
 * `themeFragment` is never read. An index entry carries no file content by
 * construction, and a registry that inlined one would be asking a listing to
 * print a source file.
 */
function indexMeta(raw: unknown): IndexMeta | null {
  if (!isRecord(raw)) return null;
  const mantine = raw["mantine"];
  if (!isRecord(mantine)) return null;

  const meta: IndexMeta = {};
  const requires = mantine["requires"];
  if (typeof requires === "string") meta.requires = sanitize(requires, MAX_NAME);
  const provider = mantine["provider"];
  if (typeof provider === "string") meta.provider = sanitize(provider, MAX_NAME);

  const stylesApi = mantine["stylesApi"];
  if (isRecord(stylesApi)) {
    const selectors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(stylesApi)) {
      if (!Array.isArray(value)) continue;
      selectors[sanitize(key, MAX_NAME)] = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => sanitize(entry, MAX_NAME));
    }
    if (Object.keys(selectors).length > 0) meta.stylesApi = selectors;
  }

  return Object.keys(meta).length === 0 ? null : meta;
}

// ---- the reader ----------------------------------------------------------------

export interface AvailablePorts {
  load: IndexLoader;
  /**
   * `loadEnv(root)` in production, called ONCE by the command. A parameter
   * rather than `process.env` for the reason `registry-source.ts` states: a
   * module that reaches for the ambient environment cannot be tested for the one
   * property that matters — that an expanded token never escapes.
   */
  env: Record<string, string | undefined>;
}

export interface AvailableOptions {
  /** Limit the listing to these namespaces. An unrecognised one becomes an
   *  `unknown-namespace` note rather than an empty listing. */
  registries?: readonly string[];
}

/**
 * List every configured registry that can be listed.
 *
 * Never throws, and never returns a partial listing that looks complete: a
 * registry either contributes a `RegistryListing` or contributes a note saying
 * why it did not. `list` prints both.
 *
 * Registries are fetched concurrently — there are a handful of them, and the
 * per-request timeout already bounds the slowest. Determinism comes from sorting
 * the output, not from serialising the requests.
 */
export async function readAvailable(
  config: LoadedConfig,
  ports: AvailablePorts,
  options: AvailableOptions = {},
): Promise<Available> {
  const notes: InventoryNote[] = [];
  const wanted = selectRegistries(config, options.registries, notes);

  const results = await Promise.all(wanted.map((registry) => listOne(registry, ports, notes)));

  const registries = results
    .filter((listing): listing is RegistryListing => listing !== null)
    .sort((a, b) => (a.registry < b.registry ? -1 : a.registry > b.registry ? 1 : 0));

  return {
    registries,
    items: registries.flatMap((listing) => listing.items),
    notes: sortNotes(notes),
  };
}

/**
 * Which registries to list, deduped.
 *
 * `manteen list @house @house` must fetch once and produce one group — a
 * repeated argument is a typo, not a request for two listings, and letting it
 * through would emit a duplicate `RegistryListing` that a renderer prints twice.
 * The unknown-namespace note is deduped by the same `seen` set, so a repeated
 * bad name is reported once.
 */
function selectRegistries(
  config: LoadedConfig,
  requested: readonly string[] | undefined,
  notes: InventoryNote[],
): Registry[] {
  if (requested === undefined) return [...config.registries.values()];

  const out: Registry[] = [];
  const seen = new Set<string>();

  for (const namespace of requested) {
    if (seen.has(namespace)) continue;
    seen.add(namespace);

    const registry = config.registries.get(namespace);
    if (registry === undefined) {
      const known = [...config.registries.keys()].sort();
      notes.push({
        code: "unknown-namespace",
        registry: namespace,
        message:
          known.length > 0
            ? `${namespace} is not a registered namespace. Registered: ${known.join(", ")}.`
            : `${namespace} is not a registered namespace. No registries are configured in manteen.json.`,
      });
      continue;
    }
    out.push(registry);
  }
  return out;
}

/** One registry, or `null` plus a note. Every failure mode degrades to a note. */
async function listOne(
  registry: Registry,
  ports: AvailablePorts,
  notes: InventoryNote[],
): Promise<RegistryListing | null> {
  const source = indexSourceFor(registry, ports.env);

  if (!source.ok) {
    notes.push(
      source.reason === "no-index"
        ? {
            code: "no-index",
            registry: registry.namespace,
            message: `${registry.namespace} declares no "index" URL in manteen.json, so its items cannot be listed. Add one alongside "url" — see D21.`,
          }
        : missingEnvNote(registry.namespace, source.missing, source.redactedUrl),
    );
    return null;
  }

  const loaded = await ports.load(source.request);
  if (!loaded.ok) {
    notes.push({
      code: "index-unreachable",
      registry: registry.namespace,
      redactedUrl: loaded.redactedUrl,
      message: `${registry.namespace}'s index could not be read (${describeFailure(loaded)}): ${loaded.redactedUrl}`,
    });
    return null;
  }

  const parsed = parseIndex(loaded.doc, registry.namespace);
  if (parsed === null) {
    notes.push({
      code: "index-invalid",
      registry: registry.namespace,
      redactedUrl: loaded.redactedUrl,
      message: `${registry.namespace}'s index is not a registry index — manteen expects an object with an "items" array, or a bare array: ${loaded.redactedUrl}`,
    });
    return null;
  }

  if (parsed.dropped > 0) {
    notes.push({
      code: "index-entry-dropped",
      registry: registry.namespace,
      redactedUrl: loaded.redactedUrl,
      message: `${registry.namespace}'s index has ${parsed.dropped} entr${parsed.dropped === 1 ? "y that names" : "ies that name"} no item; ${parsed.dropped === 1 ? "it was" : "they were"} skipped.`,
    });
  }

  const uninstallable = parsed.items.filter((item) => item.id === null).length;
  if (uninstallable > 0) {
    notes.push({
      code: "index-name-uninstallable",
      registry: registry.namespace,
      redactedUrl: loaded.redactedUrl,
      message: `${registry.namespace} publishes ${uninstallable} item${uninstallable === 1 ? "" : "s"} whose name cannot be installed — an item name may contain letters, digits, ".", "_", "-" and "/".`,
    });
  }

  return {
    registry: registry.namespace,
    redactedUrl: source.request.redactedUrl,
    title: parsed.title,
    homepage: parsed.homepage,
    items: parsed.items,
  };
}

/** Worded like `registry-source.ts`'s item-path `missing-env`, so an unset
 *  variable reads the same whether it stopped an install or a listing. */
function missingEnvNote(
  namespace: string,
  missing: readonly string[],
  redactedUrl: string,
): InventoryNote {
  const vars = missing.map((name) => `\${${name}}`).join(", ");
  return {
    code: "index-missing-env",
    registry: namespace,
    redactedUrl,
    message: `${namespace}'s index needs ${vars}, which ${missing.length === 1 ? "is" : "are"} not set: ${redactedUrl}`,
  };
}

/**
 * A failed load, in one clause.
 *
 * `detail` comes from a loader and is authored there from an errno or a status
 * — never from an error's `message`, which interpolates the URL and therefore
 * may hold an expanded `${VAR}`. Passing it through is safe for that reason and
 * for no other.
 */
function describeFailure(loaded: Extract<LoadedDoc, { ok: false }>): string {
  const head =
    loaded.reason === "status"
      ? `HTTP ${loaded.status ?? "error"}`
      : loaded.reason === "not-json"
        ? "the response is not JSON"
        : loaded.reason === "too-large"
          ? "the response is too large"
          : "the request failed";
  return loaded.detail === undefined ? head : `${head}: ${loaded.detail}`;
}

/** (registry, code, message), by code unit. */
function sortNotes(notes: InventoryNote[]): InventoryNote[] {
  return [...notes].sort((a, b) => {
    const left = `${a.registry ?? ""}\u0000${a.code}\u0000${a.message}`;
    const right = `${b.registry ?? ""}\u0000${b.code}\u0000${b.message}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

// ---- item detail ----------------------------------------------------------------

/**
 * A validated item document, projected for display.
 *
 * Beyond the two readers, and here on purpose: `ValidatedItem` carries the FULL
 * SOURCE of every file it ships, plus the inlined `meta.mantine.themeFragment`
 * content. `info` printing a `ValidatedItem` dumps entire files into a terminal.
 * Handing four commands a projection that structurally cannot do that is
 * cheaper than trusting four renderers to remember.
 *
 * `redactedUrl` is the caller's — it is the URL the document was fetched from,
 * which this function has no way to know.
 */
export function toItemDetail(item: ValidatedItem, redactedUrl: string): ItemDetail {
  const files: DetailFile[] = item.files.map((file) => ({
    path: file.path,
    wireType: file.type,
    target: file.target ?? null,
    bytes: Buffer.byteLength(file.content, "utf8"),
  }));

  const meta: DetailMeta = {};
  if (item.meta.requires !== undefined) meta.requires = item.meta.requires;
  if (item.meta.provider !== undefined) meta.provider = item.meta.provider;
  if (item.meta.stylesApi !== undefined) meta.stylesApi = item.meta.stylesApi;
  if (item.meta.props !== undefined) meta.props = item.meta.props;
  if (item.meta.usage !== undefined) meta.usage = item.meta.usage;
  if (item.meta.themeFragment !== undefined) {
    meta.themeFragment = {
      path: item.meta.themeFragment.path,
      bytes: Buffer.byteLength(item.meta.themeFragment.content, "utf8"),
    };
  }

  return {
    name: item.name,
    wireType: item.wireType,
    redactedUrl,
    ...(item.docs === undefined ? {} : { docs: item.docs }),
    files,
    dependencies: item.dependencies,
    devDependencies: item.devDependencies,
    registryDependencies: item.registryDependencies,
    cssImports: item.cssImports,
    meta,
  };
}

// ---- sanitizing -------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A registry-supplied string, or `null` when it is absent or not a string. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = sanitize(value, max);
  return clean === "" ? null : clean;
}

/**
 * Strip what a terminal would execute, collapse whitespace, and bound the
 * length.
 *
 * The ellipsis is appended AFTER truncation rather than counted into `max`, so
 * the bound is on registry-controlled characters and the marker is ours.
 */
export function sanitize(value: string, max: number): string {
  const clean = value.replace(UNSAFE_TEXT, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Convenience for a renderer that has an `AvailableItem` and wants its id or a
 *  truthful stand-in. Never returns the raw name — see `AvailableItem.rawName`. */
export function availableLabel(item: AvailableItem): CanonicalId | string {
  return item.id ?? `${item.registry}/${item.name}`;
}
