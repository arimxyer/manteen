/**
 * Loaders that never open a socket: `file:` URLs read off disk, and an
 * in-memory map for tests and fixtures.
 *
 * `file:` is not an optimisation. Node's `fetch` rejects the scheme outright
 * ("not implemented... yet..."), so a `file://` registry — which is how the e2e
 * tier, every fixture registry and `npm pack` verification serve items — has no
 * path through the HTTP loader at all.
 *
 * IMPURE by design: one of the four modules §1 names as allowed to touch the
 * filesystem. It reads only; `plan()` never writes.
 *
 * Every failure carries `redactedUrl` and never the expanded one, and `detail`
 * is built from an errno rather than from `error.message` — Node puts the full
 * path into ENOENT messages, and a path is exactly the thing that may hold an
 * expanded `${VAR}`.
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LIMITS } from "./resolve";
import type { ItemLoader, ItemRequest, LoadedDoc } from "./types";

/**
 * D25's response ceiling, taken from the resolver's `LIMITS` rather than
 * redeclared.
 *
 * File contents are inlined into the wire document and the whole plan is
 * materialised in memory, so a hostile or mistaken registry needs a ceiling —
 * and a second copy of the number is how the loader and the resolver come to
 * disagree about what "too large" means. The HTTP loader should take it from
 * the same place.
 */
export const MAX_RESPONSE_BYTES = LIMITS.responseBytes;

/** Truncation for anything echoed back from a parser. Keeps a mangled 8 MB
 *  document from becoming an 8 MB error message. */
const MAX_DETAIL = 200;

export function isFileUrl(url: string): boolean {
  return url.startsWith("file:");
}

export interface FileLoaderOptions {
  maxBytes?: number;
}

/**
 * Read `file:` URLs off disk.
 *
 * A missing file is reported as a 404 rather than as a network failure: it is
 * the local analogue of "this registry does not publish that item", and it is
 * the reason a did-you-mean can be attached to the same branch for both loaders.
 * Any other errno stays `network`, because "the file is there and we could not
 * read it" is a different problem with a different fix.
 */
export function createFileLoader(options: FileLoaderOptions = {}): ItemLoader {
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;

  return async (request) => {
    const { redactedUrl } = request;

    if (!isFileUrl(request.url)) {
      return { ok: false, reason: "network", redactedUrl, detail: "not a file: URL" };
    }

    let path: string;
    try {
      path = fileURLToPath(request.url);
    } catch {
      return { ok: false, reason: "network", redactedUrl, detail: "malformed file: URL" };
    }

    try {
      const stats = statSync(path);
      if (stats.isDirectory()) {
        return { ok: false, reason: "status", status: 404, redactedUrl, detail: "is a directory" };
      }
      // Checked before the read, so an oversized document is refused rather than
      // loaded into memory in order to discover that it is oversized.
      if (stats.size > maxBytes) {
        return {
          ok: false,
          reason: "too-large",
          redactedUrl,
          detail: `${stats.size} bytes exceeds the ${maxBytes} byte ceiling`,
        };
      }
    } catch (error) {
      return fromErrno(error, redactedUrl);
    }

    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (error) {
      return fromErrno(error, redactedUrl);
    }

    try {
      return { ok: true, doc: JSON.parse(text) as unknown, redactedUrl };
    } catch (error) {
      // A JSON.parse SyntaxError names a position and quotes the input, never
      // the path — so unlike an errno message this one is safe to pass through.
      return {
        ok: false,
        reason: "not-json",
        redactedUrl,
        detail: truncate(error instanceof Error ? error.message : String(error)),
      };
    }
  };
}

export interface MemoryLoaderOptions {
  /**
   * Awaited before each lookup. Exists so the determinism suite can inject
   * randomised microtask delays and assert that fifty runs produce byte-identical
   * output — resolution order must come from the graph, not from completion
   * order.
   */
  delay?: (request: ItemRequest) => Promise<void> | void;
}

/**
 * Serve documents from a map, keyed by canonical id or by URL.
 *
 * A `Record` argument is copied into a `Map` rather than indexed directly. A
 * plain object answers `docs["toString"]` and `docs["constructor"]` with
 * functions inherited from `Object.prototype`, so an item literally named
 * `constructor` would be served a function instead of missing — and `Object.hasOwn`
 * guards at every lookup are the kind of thing that gets added to three call
 * sites and forgotten at the fourth.
 */
export function createMemoryLoader(
  docs: Record<string, unknown> | ReadonlyMap<string, unknown>,
  options: MemoryLoaderOptions = {},
): ItemLoader {
  const table = new Map<string, unknown>(
    docs instanceof Map ? (docs as ReadonlyMap<string, unknown>) : Object.entries(docs),
  );

  return async (request) => {
    await options.delay?.(request);

    const { redactedUrl } = request;
    for (const key of [request.id, request.url, redactedUrl]) {
      if (table.has(key)) return { ok: true, doc: table.get(key), redactedUrl };
    }
    return {
      ok: false,
      reason: "status",
      status: 404,
      redactedUrl,
      detail: "no in-memory document is registered for this item",
    };
  };
}

function fromErrno(error: unknown, redactedUrl: string): LoadedDoc {
  const code = errnoOf(error);
  if (code === "ENOENT" || code === "ENOTDIR") {
    return { ok: false, reason: "status", status: 404, redactedUrl, detail: code };
  }
  return { ok: false, reason: "network", redactedUrl, detail: code };
}

/** The errno alone. `error.message` is deliberately not used: Node interpolates
 *  the full path into it, and that path can hold an expanded `${VAR}`. */
function errnoOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };
    if (typeof code === "string") return code;
  }
  return "unreadable";
}

function truncate(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;
}
