/**
 * A registry served over loopback HTTP, for the e2e tier.
 *
 * The HTTP loader is the one module in the package allowed to call `fetch`, so
 * the only honest test of it opens a real socket. This serves compiled registry
 * JSON — the same bytes `writeRegistry` puts on disk — from `127.0.0.1` on an
 * EPHEMERAL port, and every failure mode the loader has a branch for.
 *
 * Two choices that look incidental and are not:
 *
 * - **Port 0.** A fixed port makes the suite fail whenever anything else on the
 *   machine holds it, including a second copy of this suite under a parallel
 *   runner. The caller reads the assigned port back off `url`.
 * - **`127.0.0.1`, never `localhost`.** On a dual-stack host `localhost` may
 *   resolve to `::1` first while the listener is bound to IPv4, which surfaces
 *   as an intermittent ECONNREFUSED that reads like a loader bug.
 *
 * Every request is recorded, headers included. That is the only place in the
 * suite where an EXPANDED `${VAR}` may legitimately appear: proving the token
 * reached the wire is half of the redaction property, and asserting the streams
 * never showed it is the other half.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, sep } from "node:path";

/** Mount names with behaviour of their own; they take no `mounts` entry. */
export const OVERSIZE_MOUNT = "oversize";
export const MALFORMED_MOUNT = "malformed";

const JSON_TYPE = "application/json; charset=utf-8";

/**
 * Truncated mid-object, so `JSON.parse` fails on a document that still smells
 * like a registry item. A body of `not json at all` would also fail, but it
 * would fail for a reason no real registry ever produces — a proxy error page
 * or a half-flushed response is what this is standing in for.
 */
const MALFORMED_BODY = Buffer.from('{"name": "empty-state", "type": "registry:ui", "files": [');

function send(response, status, body, contentType = JSON_TYPE) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  response.writeHead(status, {
    "content-type": contentType,
    // Set explicitly rather than left to chunked encoding: a loader that refuses
    // an oversized document from the declared length must have a length to read.
    "content-length": String(buffer.byteLength),
  });
  response.end(buffer);
}

/**
 * Start the server.
 *
 * @param {object} [options]
 * @param {Record<string, { dir: string, token?: string }>} [options.mounts]
 *   Path prefix -> the compiled registry directory it serves. `token`, when
 *   present, makes the mount require `Authorization: Bearer <token>`.
 * @param {number} [options.oversizeBytes] Size of the `/oversize/` body.
 * @returns {Promise<{
 *   url: string, port: number,
 *   itemUrl: (mount: string) => string,
 *   requests: () => object[], clear: () => void,
 *   close: () => Promise<void>,
 * }>}
 */
export async function startRegistryServer(options = {}) {
  const mounts = new Map(Object.entries(options.mounts ?? {}));
  // Over 8 MiB with room to spare on either reading of "8 MB", so the test
  // measures the ceiling rather than the unit the ceiling was written in.
  const oversizeBytes = options.oversizeBytes ?? 9 * 1024 * 1024;
  const received = [];

  let oversizeBody = null;
  /** Built once and cached — nine megabytes per request is a slow suite. */
  const oversize = () => {
    // VALID JSON on purpose. A loader that ignores the ceiling then parses it
    // happily and fails later as `wire-invalid`, which is a different assertion
    // from `response-too-large` — so the two failure modes stay distinguishable
    // instead of both arriving as "did not return JSON".
    oversizeBody ??= Buffer.from(`{"padding":"${"a".repeat(oversizeBytes)}"}`);
    return oversizeBody;
  };

  const server = createServer((request, response) => {
    // A loader that caps by streaming destroys the socket mid-write. Unhandled,
    // that ECONNRESET takes down the test process rather than the request.
    response.on("error", () => {});
    request.on("error", () => {});
    request.resume();

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const segments = url.pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
    const [mountName, ...rest] = segments;
    const name = rest.join("/");

    received.push({
      method: request.method,
      pathname: url.pathname,
      mount: mountName ?? null,
      name,
      query: Object.fromEntries(url.searchParams),
      // Node lowercases incoming header names, so `authorization` is the key.
      headers: { ...request.headers },
    });

    if (mountName === OVERSIZE_MOUNT) {
      send(response, 200, oversize());
      return;
    }

    if (mountName === MALFORMED_MOUNT) {
      send(response, 200, MALFORMED_BODY);
      return;
    }

    const mount = mountName === undefined ? undefined : mounts.get(mountName);
    if (mount === undefined) {
      send(response, 404, JSON.stringify({ error: `no registry is mounted at /${mountName ?? ""}` }));
      return;
    }

    if (mount.token !== undefined) {
      const authorization = request.headers.authorization;
      // 401 vs 403 is the difference between "you sent no credential" and "you
      // sent the wrong one", and the two reach the client by different routes: a
      // registry with no `headers` block at all versus one whose `${VAR}` holds
      // a stale token. Collapsing them would make the second untestable.
      if (authorization === undefined) {
        send(response, 401, JSON.stringify({ error: "missing Authorization header" }));
        return;
      }
      if (authorization !== `Bearer ${mount.token}`) {
        // The body ECHOES the credential it rejected, deliberately. Real
        // registries do this ("bad token: Bearer abc123"), and a loader that
        // folds a response body into `LoadedDoc.detail` — a helpful-looking
        // design — would then print the user's token into a diagnostic. Making
        // the body hostile turns "we hope nobody quotes error bodies" into
        // something the caller's stream scan actually catches.
        send(response, 403, JSON.stringify({ error: `bad token: ${authorization}` }));
        return;
      }
    }

    // Containment, on a server whose whole job is to hand out file contents.
    // `..` cannot survive `decodeURIComponent` here without being caught, and
    // the prefix check covers whatever `join` normalises away.
    const file = join(mount.dir, ...rest);
    if (
      name === "" ||
      rest.some((segment) => segment === "." || segment === ".." || segment.includes("\\")) ||
      !file.startsWith(mount.dir + sep) ||
      !existsSync(file)
    ) {
      send(response, 404, JSON.stringify({ error: `${name} is not published by this registry` }));
      return;
    }

    send(response, 200, readFileSync(file));
  });

  // A malformed request line would otherwise emit an unhandled 'clientError'.
  server.on("clientError", (_error, socket) => socket.destroy());

  await new Promise((ready, failed) => {
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", failed);
      ready();
    });
  });

  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  let closed = false;

  return {
    url,
    port,
    /** The `url` template D21 requires, with the literal `{name}` intact. */
    itemUrl: (mount) => `${url}/${mount}/{name}.json`,
    requests: () => received.map((entry) => ({ ...entry })),
    clear: () => {
      received.length = 0;
    },
    close: () =>
      new Promise((done, failed) => {
        if (closed) {
          done();
          return;
        }
        closed = true;
        // Keep-alive sockets from the client outlive the last response, and
        // `close()` alone waits for them — which is a hung suite rather than a
        // slow one.
        server.closeAllConnections();
        server.close((error) => (error ? failed(error) : done()));
      }),
  };
}
