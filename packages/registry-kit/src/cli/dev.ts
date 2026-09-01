import { existsSync, type FSWatcher, readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, isAbsolute, resolve } from "node:path";
import { AuthorVerificationError, runAuthorVerification } from "../author-verification";
import {
  AuthorConformanceError,
  type CompileResult,
  compileRegistry,
  type MantineRegistry,
  RegistryOutputError,
  ThemeFragmentImportError,
  writeRegistry,
} from "../build-registry";
import { MantineRangeError } from "../mantine-ranges";

export const DEV_USAGE = `manteen-kit dev [catalog.json] [outDir] [options]

Watches, validates, writes and serves a local registry in the foreground.
Defaults: ./manteen.registry.json -> <catalog dir>/public/r at 127.0.0.1:4174

Options:
  --host <host>          bind host (default: 127.0.0.1)
  --port <port>          bind port; 0 selects an available port (default: 4174)
  --overwrite-output    replace drifted marker-owned generated files
  --jsonl               emit one versioned JSON event per line
`;

interface DevArgs {
  catalog: string;
  outDir: string;
  host: string;
  port: number;
  overwriteOutput: boolean;
  jsonl: boolean;
  help: boolean;
}

export interface DevEvent {
  schemaVersion: 1;
  sequence: number;
  event: "ready" | "build-succeeded" | "build-failed" | "stopped";
  payload: Record<string, unknown>;
}

function parseArgs(argv: string[]): DevArgs | null {
  const positional: string[] = [];
  let host = "127.0.0.1";
  let port = 4174;
  let overwriteOutput = false;
  let jsonl = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) return null;
      index += 1;
      return next;
    };
    if (arg === "--host") {
      const next = value();
      if (next === null) return null;
      host = next;
    } else if (arg === "--port") {
      const next = value();
      if (next === null || !/^\d+$/.test(next)) return null;
      port = Number(next);
    } else if (arg === "--overwrite-output") overwriteOutput = true;
    else if (arg === "--jsonl") jsonl = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg.startsWith("-")) return null;
    else positional.push(arg);
  }
  if (positional.length > 2 || port < 0 || port > 65535 || host.length === 0) return null;
  const catalog = resolve(positional[0] ?? "manteen.registry.json");
  return {
    catalog,
    outDir: resolve(positional[1] ?? resolve(catalog, "../public/r")),
    host,
    port,
    overwriteOutput,
    jsonl,
    help,
  };
}

function snapshot(result: CompileResult): Map<string, string> {
  const files = new Map<string, string>();
  for (const item of result.items)
    files.set(`/${String(item.name)}.json`, `${JSON.stringify(item, null, 2)}\n`);
  files.set("/registry.json", `${JSON.stringify(result.index, null, 2)}\n`);
  return files;
}

function discoverInputs(catalogPath: string): string[] {
  const root = dirname(catalogPath);
  const paths = new Set<string>([catalogPath]);
  try {
    const source = JSON.parse(readFileSync(catalogPath, "utf8")) as Partial<MantineRegistry>;
    for (const item of source.items ?? []) {
      for (const file of item.files ?? []) paths.add(resolve(root, file.path));
      if (item.usage) paths.add(resolve(root, item.usage));
      if (item.themeFragment) paths.add(resolve(root, item.themeFragment));
    }
    if (source.authorProfile) {
      const profilePath = resolve(root, source.authorProfile);
      paths.add(profilePath);
      try {
        const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Record<string, unknown>;
        for (const section of ["stylesApi", "props", "usage"]) {
          const mappings = profile[section];
          if (!Array.isArray(mappings)) continue;
          for (const mapping of mappings) {
            if (
              mapping &&
              typeof mapping === "object" &&
              typeof (mapping as { evidence?: unknown }).evidence === "string"
            ) {
              paths.add(resolve(root, (mapping as { evidence: string }).evidence));
            }
          }
        }
        if (
          profile.verification &&
          typeof profile.verification === "object" &&
          Array.isArray((profile.verification as { scripts?: unknown }).scripts)
        ) {
          paths.add(resolve(root, "package.json"));
        }
      } catch {
        // The profile itself remains watched; a later valid write refreshes its evidence graph.
      }
    }
  } catch {
    // Invalid catalog JSON still leaves the catalog watched for recovery.
  }
  return [...paths].sort();
}

function nearestExistingDirectory(path: string): string {
  let cursor = existsSync(path)
    ? isAbsolute(path)
      ? dirname(path)
      : dirname(resolve(path))
    : dirname(path);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return parent;
    cursor = parent;
  }
  return cursor;
}

function errorPayload(error: unknown): { code: string; message: string; details?: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AuthorConformanceError)
    return { code: "author-conformance-failed", message, details: error.failures };
  if (error instanceof MantineRangeError)
    return { code: "mantine-range-validation-failed", message, details: error.failures };
  if (error instanceof RegistryOutputError)
    return { code: "registry-output-refused", message, details: error.diagnostics };
  if (error instanceof ThemeFragmentImportError)
    return { code: "theme-fragment-import-unsupported", message, details: error.failures };
  if (error instanceof AuthorVerificationError)
    return {
      code: error.outcome.failure?.code ?? "author-verification-failed",
      message,
      details: error.outcome,
    };
  return { code: "build-failed", message };
}

export async function dev(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args === null) {
    process.stderr.write(DEV_USAGE);
    return 2;
  }
  if (args.help) {
    process.stdout.write(DEV_USAGE);
    return 0;
  }

  let sequence = 0;
  const emit = (event: DevEvent["event"], payload: Record<string, unknown>) => {
    sequence += 1;
    const value: DevEvent = { schemaVersion: 1, sequence, event, payload };
    if (args.jsonl) process.stdout.write(`${JSON.stringify(value)}\n`);
    else if (event === "build-failed")
      process.stderr.write(`Build failed: ${String(payload.message ?? "unknown failure")}\n`);
    else if (event === "build-succeeded")
      process.stdout.write(
        `Built and serving ${String(payload.itemCount)} items from ${String(payload.namespace)}.\n`,
      );
    else if (event === "ready")
      process.stdout.write(`Registry server listening at ${String(payload.baseUrl)}\n`);
  };

  let served: Map<string, string> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watchers = new Map<string, FSWatcher>();
  let baseUrl = "";

  const refreshWatchers = (schedule: () => void) => {
    const wanted = new Set(discoverInputs(args.catalog).map(nearestExistingDirectory));
    for (const [directory, watcher] of watchers) {
      if (!wanted.has(directory)) {
        watcher.close();
        watchers.delete(directory);
      }
    }
    for (const directory of wanted) {
      if (watchers.has(directory)) continue;
      try {
        watchers.set(directory, watch(directory, schedule));
      } catch {
        // The next catalog change or rebuild retries watcher discovery.
      }
    }
  };

  const build = () => {
    try {
      let result = compileRegistry(args.catalog);
      if (result.failures.length > 0)
        throw new Error(`${result.failures.length} item(s) failed wire-schema validation.`);
      const authorVerification = runAuthorVerification(args.catalog, result.authorConformance);
      if (authorVerification.status === "failed") {
        throw new AuthorVerificationError(authorVerification);
      }
      if (authorVerification.status === "passed") {
        try {
          const revalidated = compileRegistry(args.catalog);
          if (revalidated.failures.length > 0) {
            throw new Error(
              `${revalidated.failures.length} item(s) failed wire-schema validation.`,
            );
          }
          if (
            JSON.stringify(revalidated.authorConformance?.verification ?? null) !==
            JSON.stringify(result.authorConformance?.verification ?? null)
          ) {
            throw new Error("The author verification configuration changed while its scripts ran.");
          }
          result = revalidated;
        } catch (error) {
          throw new AuthorVerificationError({
            ...authorVerification,
            status: "failed",
            failure: {
              code: "author-verification-input-drift",
              script: null,
              message: `Registry inputs could not be revalidated after author verification: ${error instanceof Error ? error.message : String(error)}`,
            },
          });
        }
      }
      const outcome = writeRegistry(result, args.outDir, { overwriteOutput: args.overwriteOutput });
      served = snapshot(result);
      const itemUrl = `${baseUrl}/{name}.json`;
      const indexUrl = `${baseUrl}/registry.json`;
      emit("build-succeeded", {
        namespace: result.source.namespace,
        itemCount: result.items.length,
        mutated: outcome.mutated,
        outputStatus: outcome.status,
        authorVerification,
        itemUrl,
        indexUrl,
        registryAddArgv: [
          "manteen",
          "registry",
          "add",
          result.source.namespace,
          "--url",
          itemUrl,
          "--index",
          indexUrl,
          "--dry-run",
          "--json",
        ],
        registryReconnectArgv: [
          "manteen",
          "registry",
          "reconnect",
          result.source.namespace,
          "--url",
          itemUrl,
          "--index",
          indexUrl,
          "--dry-run",
          "--json",
        ],
      });
    } catch (error) {
      const detail = errorPayload(error);
      emit("build-failed", { ...detail, servingLastGood: served !== null });
    }
    refreshWatchers(schedule);
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      build();
    }, 75);
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", baseUrl);
    const allowedMethod = request.method === "GET" || request.method === "HEAD";
    const body = served?.get(url.pathname);
    if (!allowedMethod) {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end('{"error":"method-not-allowed"}\n');
      return;
    }
    if (served === null) {
      response.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "1",
      });
      response.end('{"error":"registry-not-ready"}\n');
      return;
    }
    if (body === undefined) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end('{"error":"not-found"}\n');
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });

  try {
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(args.port, args.host, () => accept());
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : args.port;
  baseUrl = `http://${args.host}:${port}`;
  emit("ready", { host: args.host, port, baseUrl, catalog: args.catalog, outDir: args.outDir });
  build();

  const stopped = await new Promise<string>((accept) => {
    const stop = (signal: string) => accept(signal);
    process.once("SIGINT", () => stop("SIGINT"));
    process.once("SIGTERM", () => stop("SIGTERM"));
  });
  if (timer !== null) clearTimeout(timer);
  for (const watcher of watchers.values()) watcher.close();
  await new Promise<void>((accept) => server.close(() => accept()));
  emit("stopped", { reason: stopped });
  return 0;
}
