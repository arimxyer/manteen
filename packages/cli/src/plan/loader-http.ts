/**
 * The HTTP loader — the ONLY module in this package that calls `fetch`.
 *
 * IMPURE by design: one of the four modules §1 names as allowed to do I/O.
 * `plan()` may read the network; it never writes, and nothing here does either.
 *
 * Three properties are load-bearing and every line below serves one of them:
 *
 *   1. It never throws for an expected failure. `resolve.ts` turns a failed
 *      `LoadedDoc` into a `fetch-failed` / `wire-invalid` / `response-too-large`
 *      diagnostic; a throw escapes that path entirely and surfaces as a stack
 *      trace three levels into a dependency walk.
 *   2. An expanded `${VAR}` never leaves this module. Every returned
 *      `redactedUrl` is `request.redactedUrl` — never `request.url` — and every
 *      `detail` is either authored here or derived from an errno, NEVER from an
 *      error's `message`. That is not paranoia: `new Headers({Authorization:
 *      "Bearer sec\nret"})` throws `TypeError: Headers.append: "Bearer sec\nret"
 *      is an invalid header value.` — the token, verbatim, in a message that
 *      would otherwise become a diagnostic. Header construction therefore
 *      happens inside the try block with an authored replacement detail.
 *   3. D25's ceiling is enforced while STREAMING. A hostile registry must not be
 *      able to make the client allocate the response in order to discover that
 *      it was too big.
 *
 * `content-length` is checked as a cheap early-out and is NOT the defence.
 * undici decompresses `gzip`/`br` transparently, so the header describes the
 * COMPRESSED transfer while the ceiling is about the DECODED document — a
 * 200 KB `content-length` can stream out as 8 MB of JSON. Only the accumulated
 * byte count coming out of `reader.read()` bounds a decompression bomb.
 */
import { isUrlId } from "./ref";
import { LIMITS } from "./resolve";
import type { CanonicalId, ItemLoader, ItemRequest } from "./types";

/**
 * Whole-exchange budget for one request, in milliseconds.
 *
 * What it bounds: DNS + TLS + a cold CDN edge miss going to origin + the body,
 * for ONE request. Item documents inline their file contents, so a few hundred
 * KB is the realistic upper end and 30 s clears that with wide margin even on a
 * slow link. The case it will refuse is a document near D25's 8 MB ceiling
 * arriving over a genuinely slow connection — and a document that large is
 * already at the limit this file exists to enforce. `timeoutMs` is an option for
 * the registry that legitimately needs longer.
 *
 * What it does NOT bound: the walk. `LIMITS.concurrency` is 6 against a 200-item
 * ceiling, so a uniformly hung registry still costs ~17 minutes of wall time.
 * The guarantee is per-request — no single response can wedge the CLI forever —
 * not a deadline for `plan()`.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Truncation for anything echoed back from a parser, as in `loader-local.ts`.
 *  Keeps a mangled 8 MB document from becoming an 8 MB error message. */
const MAX_DETAIL = 200;

/** At most three, so a 404 detail stays a sentence rather than a catalog. */
const MAX_SUGGESTIONS = 3;

/**
 * What an index entry has to look like before it is allowed into a diagnostic.
 *
 * The index is a registry-controlled document and its names are printed to a
 * terminal. A 10 KB "name", or one carrying ANSI escapes, is a registry's
 * problem right up until we quote it back at the user.
 */
const SAFE_NAME = /^[A-Za-z0-9._@/-]{1,64}$/;

/**
 * An unexpanded `${VAR}`, spelled exactly as `registry-source.ts` spells it.
 *
 * Local rather than imported because that module exports the expander, not the
 * pattern. It is used in ONE place — the index URL — and deliberately not on
 * `request.url`: `toRequest` already refuses an item whose variables are unset
 * with `missing-env`, and two competing detectors for one rule is how they come
 * to disagree. The index has no such detector, which is why it needs this one.
 */
const UNEXPANDED = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

export function isHttpUrl(url: string): boolean {
  return url.startsWith("http:") || url.startsWith("https:");
}

/**
 * D21's optional per-registry `index`, already expanded.
 *
 * `url` and `headers` carry real values — expansion is the caller's job because
 * this module has no config and no `env`, which is exactly why it cannot leak
 * one by accident. There is no `redactedUrl` because nothing about the index
 * fetch is ever reported: a failure to reach it degrades to silence.
 */
export interface IndexSource {
  url: string;
  headers: Record<string, string>;
}

/**
 * Maps an item request to its registry's index, or `null` when that registry
 * declares none.
 *
 * A callback rather than a map because the loader is handed `ItemRequest`s and
 * has no idea which registry produced one — the caller does. Synchronous: the
 * config is already in memory.
 *
 * CONTRACT: return `null` when any `${VAR}` in the index template is unset.
 * `expandVars` leaves the literal in place on a miss, and a URL with a hole in
 * it must never go out — a registry logs what it was asked for, and a request
 * carrying `?token=${REGISTRY_TOKEN}` publishes the shape of the user's config
 * to a server that failed to authenticate them. `namesFor` enforces this rather
 * than trusting it, because the item path has `toRequest`'s `missing-env`
 * refusal standing between the config and the socket and the index path has
 * nothing.
 */
export type IndexResolver = (request: ItemRequest) => IndexSource | null;

export interface HttpLoaderOptions {
  /** Defaults to `LIMITS.responseBytes` — D25's 8 MB, taken from the resolver
   *  rather than redeclared, so the two cannot disagree about the number. */
  maxBytes?: number;
  timeoutMs?: number;
  /** D21. Omit it and a 404 is reported as a plain 404. */
  index?: IndexResolver;
  /**
   * Test seam, in the spirit of `createMemoryLoader`'s `delay`. Lets a unit test
   * assert the exact headers that go out and the exact failure mapping without a
   * socket. The streaming cap and the timeout should still be exercised against
   * a real `node:http` server — a fake stream proves nothing about undici.
   */
  fetchImpl?: typeof fetch;
}

export function createHttpLoader(options: HttpLoaderOptions = {}): ItemLoader {
  const maxBytes = options.maxBytes ?? LIMITS.responseBytes;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;
  const resolveIndex = options.index;

  /**
   * One in-flight fetch per index URL, shared by every 404 in the run.
   *
   * A wave of six misses against one registry is six identical index fetches
   * otherwise. The promise is memoised rather than the value so concurrent
   * misses join the same request; it never rejects.
   */
  const indexNames = new Map<string, Promise<readonly string[] | null>>();

  const namesFor = (source: IndexSource): Promise<readonly string[] | null> => {
    // The `IndexResolver` contract, enforced instead of assumed. A did-you-mean
    // is a nicety; a request with an unexpanded `${VAR}` in it is not.
    if (UNEXPANDED.test(source.url)) return Promise.resolve(null);

    const cached = indexNames.get(source.url);
    if (cached !== undefined) return cached;

    const pending = fetchJson(doFetch, source.url, source.headers, maxBytes, timeoutMs)
      .then((result) => (result.ok ? itemNamesOf(result.doc) : null))
      .catch(() => null);
    indexNames.set(source.url, pending);
    return pending;
  };

  /**
   * D21's did-you-mean, or `null`.
   *
   * Every branch here degrades to `null` — no index configured, a `url:` ref
   * with no name to compare, an unreachable index, an index in a shape we do not
   * recognise, no name close enough. A broken index must never mask the 404 the
   * user actually needs to see.
   */
  const didYouMean = async (request: ItemRequest): Promise<string | null> => {
    if (resolveIndex === undefined) return null;

    const name = itemNameOf(request.id);
    if (name === null) return null;

    const source = resolveIndex(request);
    if (source === null) return null;

    const names = await namesFor(source);
    if (names === null) return null;

    const near = nearest(name, names);
    return near.length === 0 ? null : `did you mean ${near.join(" or ")}`;
  };

  return async (request) => {
    const { redactedUrl } = request;

    if (!isHttpUrl(request.url)) {
      return { ok: false, reason: "network", redactedUrl, detail: "not an http(s) URL" };
    }

    const result = await fetchJson(doFetch, request.url, request.headers, maxBytes, timeoutMs);

    if (result.ok) return { ok: true, doc: result.doc, redactedUrl };

    if (result.reason === "status") {
      const detail =
        result.status === 404
          ? await didYouMean(request)
          : authenticationHint(result.status, request.headers);
      return {
        ok: false,
        reason: "status",
        status: result.status,
        redactedUrl,
        ...(detail === null ? {} : { detail }),
      };
    }

    return {
      ok: false,
      reason: result.reason,
      redactedUrl,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
    };
  };
}

// ---- the one fetch ----------------------------------------------------------

/**
 * The failure shape before a `redactedUrl` is attached.
 *
 * Deliberately not `LoadedDoc`: this function is used for the index too, where
 * there is no redacted URL and no diagnostic — pairing the two would invite a
 * caller to report an index failure with an item's URL on it.
 */
type Fetched =
  | { ok: true; doc: unknown }
  | {
      ok: false;
      reason: "network" | "not-json" | "too-large";
      detail?: string;
    }
  // No `detail`: every word a status failure carries is authored by the loader
  // from the status and the request, never by this function from the response.
  | { ok: false; reason: "status"; status: number };

async function fetchJson(
  doFetch: typeof fetch,
  url: string,
  headers: Record<string, string>,
  maxBytes: number,
  timeoutMs: number,
): Promise<Fetched> {
  let sent: Headers;
  try {
    // Its own try, and the reason is the highest-severity rule in this phase:
    // `Headers` validates names and values and throws a `TypeError` whose
    // message QUOTES THE OFFENDING VALUE — `Headers.append: "Bearer sec\nret"
    // is an invalid header value.` (probed). An expanded token with a stray
    // newline in it would leave this module inside that message. The
    // replacement below is authored and names neither the header nor its value.
    sent = new Headers(headers);
    // Advisory either way, and never allowed to override a registry's own
    // Accept: `Headers` normalises case, so `has` catches every spelling.
    if (!sent.has("accept")) sent.set("accept", "application/json");
  } catch {
    return {
      ok: false,
      reason: "network",
      detail: "a configured request header is not a valid HTTP header",
    };
  }

  let response: Response;
  try {
    // `AbortSignal.timeout`'s timer is unref'd (probed on node 26), so a
    // completed run exits immediately rather than lingering for the budget. It
    // also covers the body: aborting the signal errors the stream mid-read, so
    // this one number bounds a slow-loris body as well as a hung handshake.
    // Redirects are followed (fetch's default, up to 20), and undici strips
    // `Authorization` across an origin change — so a registry that redirects to
    // a different host answers 401 even with a correctly configured header. That
    // is the web platform's rule, not ours, and the 401 detail below is what
    // points at it.
    response = await doFetch(url, {
      headers: sent,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, reason: "network", detail: networkDetail(error, timeoutMs) };
  }

  if (!response.ok) {
    // The body is not read, so it has to be discarded explicitly or the socket
    // stays checked out of the pool until GC.
    await discard(response);
    return { ok: false, reason: "status", status: response.status };
  }

  // Cheap early-out ONLY — see the module header for why this is not the
  // defence. A missing, malformed or deflated-away value simply falls through to
  // the streaming cap.
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (Number.isInteger(bytes) && bytes > maxBytes) {
      await discard(response);
      return {
        ok: false,
        reason: "too-large",
        detail: `content-length ${bytes} exceeds the ${maxBytes} byte ceiling`,
      };
    }
  }

  // A 204, or any response undici gives no body, decodes to "" and fails the
  // parse below as `not-json` — which is what an empty document is.
  const reader = response.body?.getReader();
  let text = "";

  if (reader !== undefined) {
    // Default `ignoreBOM: false`, whose name reads backwards: it means the BOM
    // is CONSUMED rather than emitted. Static hosts serve BOM-prefixed JSON
    // often enough that getting this for free is worth the sentence — a leading
    // U+FEFF is a `JSON.parse` failure.
    const decoder = new TextDecoder();
    let total = 0;

    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value === undefined) continue;

        total += chunk.value.byteLength;
        if (total > maxBytes) {
          // Tears down the connection rather than draining the rest of a body we
          // have already refused.
          await reader.cancel().catch(() => undefined);
          return {
            ok: false,
            reason: "too-large",
            detail: `the body was still arriving after ${maxBytes} bytes`,
          };
        }

        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      // A mid-stream disconnect or the timeout firing during the body.
      return { ok: false, reason: "network", detail: networkDetail(error, timeoutMs) };
    }
  }

  try {
    return { ok: true, doc: JSON.parse(text) as unknown };
  } catch (error) {
    // Content-Type is not consulted anywhere in this function: static hosts
    // mislabel `.json` constantly, and a document that parses is a document
    // regardless of what the header claimed. The converse is this branch — a
    // `JSON.parse` SyntaxError quotes the INPUT, which is registry-controlled
    // and carries no secret of ours, so unlike an errno message it passes
    // through (truncated).
    return {
      ok: false,
      reason: "not-json",
      detail: truncate(error instanceof Error ? error.message : String(error)),
    };
  }
}

/** Drain-and-forget for a response whose body we will not read. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

// ---- failure details --------------------------------------------------------

/**
 * An errno, never a message.
 *
 * undici's `TypeError: fetch failed` carries the real cause underneath, and that
 * cause's message interpolates the host and port — `connect ECONNREFUSED
 * 127.0.0.1:49999`. A URL is exactly the thing that may hold an expanded
 * `${VAR}`, so only the short constant is used, and the fallback is authored
 * text rather than `error.name` (which is `TypeError` here and says nothing).
 */
function networkDetail(error: unknown, timeoutMs: number): string {
  // `AbortSignal.timeout` rejects with a DOMException named `TimeoutError`;
  // `AbortError` is the name an explicit `AbortController` would produce.
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    // "complete", because this fires for a body that stalled halfway as readily
    // as for a handshake that never landed — and the first case did produce a
    // response.
    return `no complete response within ${timeoutMs} ms`;
  }

  const cause = error instanceof Error ? (error.cause as unknown) : undefined;
  const code = errnoOf(cause);
  if (code !== null) return code;

  // Happy-eyeballs failures arrive as an AggregateError over one error per
  // address. They share a code in practice; the first is representative.
  if (typeof cause === "object" && cause !== null && "errors" in cause) {
    const { errors } = cause as { errors: unknown };
    if (Array.isArray(errors)) {
      for (const entry of errors) {
        const nested = errnoOf(entry);
        if (nested !== null) return nested;
      }
    }
  }

  return "the connection failed";
}

function errnoOf(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "code" in value) {
    const { code } = value as { code: unknown };
    if (typeof code === "string" && code !== "") return code;
  }
  return null;
}

/**
 * The one thing worth saying about a 401/403 that the status code does not.
 *
 * Authored, and derived only from whether headers were configured — never from
 * the response. `statusText` is server-controlled text and is deliberately never
 * echoed: it adds nothing over the code, and a registry that puts our own
 * request back in it would put it in a diagnostic.
 */
function authenticationHint(status: number, headers: Record<string, string>): string | null {
  if (status !== 401 && status !== 403) return null;
  return Object.keys(headers).length === 0
    ? "no headers are configured for this registry, and it wants credentials"
    : "the registry rejected the credentials it was given";
}

function truncate(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;
}

// ---- D21: did-you-mean ------------------------------------------------------

/**
 * The bare name of a canonical id.
 *
 * D23: split on the FIRST slash and keep a multi-segment name whole. `null` for
 * a `url:` id — it names no registry, so no index can be configured for it and
 * there is nothing to compare against.
 */
function itemNameOf(id: CanonicalId): string | null {
  if (isUrlId(id)) return null;
  const slash = id.indexOf("/");
  return slash === -1 ? null : id.slice(slash + 1);
}

/**
 * Every item name an index document lists.
 *
 * The kit emits shadcn's `registry.json` shape — `{ name, homepage?, items:
 * [{ name, type, … }] }` (build-registry.ts:155-176) — and a bare array is
 * accepted too, because third-party registries publish both and the cost of
 * tolerating the second shape is one branch. Anything else yields no names,
 * which degrades to a plain 404.
 */
function itemNamesOf(doc: unknown): string[] {
  const list = Array.isArray(doc)
    ? doc
    : typeof doc === "object" && doc !== null && Array.isArray((doc as { items?: unknown }).items)
      ? (doc as { items: unknown[] }).items
      : null;
  if (list === null) return [];

  const names: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      names.push(entry);
    } else if (typeof entry === "object" && entry !== null) {
      const { name } = entry as { name?: unknown };
      if (typeof name === "string") names.push(name);
    }
  }
  return names;
}

/**
 * The closest few names, sorted by distance then by code unit.
 *
 * Sorted rather than "first three found" because a plan's output is asserted
 * byte-for-byte, and the order of `items` in a registry index is the registry's
 * choice. The `SAFE_NAME` filter runs before ranking, not after, so a hostile
 * entry cannot displace a legitimate suggestion by being closer.
 */
function nearest(wanted: string, names: readonly string[]): string[] {
  const cutoff = Math.max(1, Math.floor(wanted.length / 3));
  const target = wanted.toLowerCase();

  const scored: { name: string; distance: number }[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (name === wanted || seen.has(name) || !SAFE_NAME.test(name)) continue;
    seen.add(name);

    const distance = editDistance(target, name.toLowerCase(), cutoff);
    if (distance <= cutoff) scored.push({ name, distance });
  }

  scored.sort((a, b) =>
    a.distance !== b.distance
      ? a.distance - b.distance
      : a.name < b.name
        ? -1
        : a.name > b.name
          ? 1
          : 0,
  );
  return scored.slice(0, MAX_SUGGESTIONS).map((entry) => entry.name);
}

/**
 * Levenshtein distance, abandoned as soon as it cannot come in at or under
 * `cutoff`.
 *
 * The cutoff is not an optimisation detail: an 8 MB index is ~500k names, and
 * the length pre-check plus the per-row bail are what keep a did-you-mean from
 * becoming the slowest part of a failed install.
 */
function editDistance(a: string, b: string, cutoff: number): number {
  const over = cutoff + 1;
  if (Math.abs(a.length - b.length) > cutoff) return over;
  if (a === b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;
      const value = Math.min(substitution, deletion, insertion);
      current[j] = value;
      if (value < best) best = value;
    }

    if (best > cutoff) return over;

    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[b.length] as number;
}
