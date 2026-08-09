import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import type { CompileResult } from "./build-registry";
import { createWireValidator } from "./build-registry";

const MARKER_NAME = ".manteen-kit-output.json";
const OUTPUT_SCHEMA_VERSION = 1 as const;

export interface RegistryOutputMarker {
  schemaVersion: 1;
  namespace: string;
  packageVersion: string;
  files: { path: string; sha256: string }[];
}

export interface RegistryOutputDiagnostic {
  code: string;
  message: string;
}

export type RegistryOutputStatus = "clean" | "missing" | "changed" | "refused";

export interface RegistryWriteOptions {
  /** Explicitly permits drift in marker-owned files. Unknown files are never overwritten. */
  overwriteOutput?: boolean;
}

export interface RegistryWritePlan {
  schemaVersion: 1;
  status: RegistryOutputStatus;
  ok: boolean;
  outDir: string;
  namespace: string;
  changedFiles: string[];
  marker: RegistryOutputMarker;
  diagnostics: RegistryOutputDiagnostic[];
}

export interface RegistryWriteOutcome extends RegistryWritePlan {
  mutated: boolean;
}

interface RenderedOutput {
  files: Map<string, string>;
  marker: RegistryOutputMarker;
  markerText: string;
}

interface TransactionJournal {
  schemaVersion: 1;
  targetName: string;
  stageName: string;
  backupName: string;
  hadTarget: boolean;
  markerSha256: string;
  phase: "prepared" | "backed-up" | "installed";
}

export class RegistryOutputError extends Error {
  readonly diagnostics: RegistryOutputDiagnostic[];

  constructor(diagnostics: RegistryOutputDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "RegistryOutputError";
    this.diagnostics = diagnostics;
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function packageVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

function renderOutput(result: CompileResult): RenderedOutput {
  if (result.failures.length > 0) {
    throw new RegistryOutputError([
      {
        code: "wire-schema-failures",
        message: `${result.failures.length} item(s) failed wire-schema validation.`,
      },
    ]);
  }

  const files = new Map<string, string>();
  const validateWire = createWireValidator();
  for (const item of [...result.items].sort((left, right) =>
    String(left.name).localeCompare(String(right.name)),
  )) {
    const name = item.name;
    const errors = validateWire(item);
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name) || errors) {
      throw new RegistryOutputError([
        {
          code: "invalid-rendered-item",
          message: `Refusing to render invalid item ${String(name)}${errors ? `: ${errors.join(", ")}` : "."}`,
        },
      ]);
    }
    const filename = `${name}.json`;
    if (files.has(filename)) {
      throw new RegistryOutputError([
        { code: "duplicate-rendered-item", message: `Refusing duplicate rendered item ${name}.` },
      ]);
    }
    files.set(filename, `${JSON.stringify(item, null, 2)}\n`);
  }
  const indexErrors = validateRegistryIndex(result.index, result.items);
  if (indexErrors.length > 0) throw new RegistryOutputError(indexErrors);
  files.set("registry.json", `${JSON.stringify(result.index, null, 2)}\n`);

  const marker: RegistryOutputMarker = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    namespace: result.source.namespace,
    packageVersion: packageVersion(),
    files: [...files]
      .map(([path, content]) => ({ path, sha256: sha256(content) }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
  const markerText = `${JSON.stringify(marker, null, 2)}\n`;
  return { files, marker, markerText };
}

function pathComponents(path: string): string[] {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = absolute.slice(root.length).split(sep).filter(Boolean);
  const paths: string[] = [];
  let cursor = root;
  for (const component of components) {
    cursor = join(cursor, component);
    paths.push(cursor);
  }
  return paths;
}

function inspectDestination(result: CompileResult, outDir: string): RegistryOutputDiagnostic[] {
  const absolute = resolve(outDir);
  const diagnostics: RegistryOutputDiagnostic[] = [];
  const filesystemRoot = parse(absolute).root;
  const forbidden = [
    [filesystemRoot, "filesystem root"],
    [resolve(homedir()), "user home"],
    [resolve(process.cwd()), "current working directory"],
  ] as const;

  for (const [path, label] of forbidden) {
    if (absolute === path) {
      diagnostics.push({
        code: "unsafe-output-path",
        message: `Refusing registry output at the ${label}: ${absolute}`,
      });
    }
  }

  if (result.catalogPath) {
    const catalogDirectory = dirname(resolve(result.catalogPath));
    const catalogFromOutput = relative(absolute, catalogDirectory);
    if (
      catalogFromOutput === "" ||
      (!catalogFromOutput.startsWith(`..${sep}`) &&
        catalogFromOutput !== ".." &&
        !isAbsolute(catalogFromOutput))
    ) {
      diagnostics.push({
        code: "unsafe-catalog-output-path",
        message: `Refusing registry output at the catalog directory or one of its ancestors: ${absolute}`,
      });
    }
  }

  for (const component of pathComponents(absolute)) {
    if (!existsSync(component)) continue;
    const stat = lstatSync(component);
    if (stat.isSymbolicLink()) {
      diagnostics.push({
        code: "output-path-link",
        message: `Refusing registry output through a symbolic link or junction: ${component}`,
      });
      break;
    }
    if (component === absolute && !stat.isDirectory()) {
      diagnostics.push({
        code: "output-not-directory",
        message: `Registry output exists and is not a directory: ${absolute}`,
      });
    }
  }
  return diagnostics;
}

function transactionPaths(outDir: string) {
  const target = resolve(outDir);
  const parent = dirname(target);
  const name = basename(target);
  return {
    target,
    parent,
    stage: join(parent, `.${name}.manteen-kit-stage`),
    backup: join(parent, `.${name}.manteen-kit-backup`),
    journal: join(parent, `.${name}.manteen-kit-journal.json`),
    journalTemp: join(parent, `.${name}.manteen-kit-journal.tmp`),
  };
}

function listDirectory(path: string): string[] {
  return readdirSync(path)
    .map((entry) => entry)
    .sort((left, right) => left.localeCompare(right));
}

function safeFileEntries(path: string): {
  names: string[];
  diagnostics: RegistryOutputDiagnostic[];
} {
  const diagnostics: RegistryOutputDiagnostic[] = [];
  const names = listDirectory(path);
  for (const name of names) {
    const entryPath = join(path, name);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      diagnostics.push({
        code: "unsafe-output-entry",
        message: `Registry output contains a link or non-file entry: ${name}`,
      });
    }
  }
  return { names, diagnostics };
}

function parseMarker(text: string): RegistryOutputMarker | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const marker = value as Partial<RegistryOutputMarker> & Record<string, unknown>;
  if (
    marker.schemaVersion !== OUTPUT_SCHEMA_VERSION ||
    typeof marker.namespace !== "string" ||
    typeof marker.packageVersion !== "string" ||
    !Array.isArray(marker.files) ||
    Object.keys(marker).some(
      (key) => !["schemaVersion", "namespace", "packageVersion", "files"].includes(key),
    )
  ) {
    return null;
  }
  const seen = new Set<string>();
  let previous = "";
  for (const file of marker.files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) return null;
    const candidate = file as { path?: unknown; sha256?: unknown };
    if (
      typeof candidate.path !== "string" ||
      !/^(?:registry|[a-z0-9][a-z0-9-]*)\.json$/.test(candidate.path) ||
      candidate.path === MARKER_NAME ||
      typeof candidate.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.sha256) ||
      seen.has(candidate.path) ||
      (previous && previous.localeCompare(candidate.path) >= 0) ||
      Object.keys(file as object).some((key) => !["path", "sha256"].includes(key))
    ) {
      return null;
    }
    seen.add(candidate.path);
    previous = candidate.path;
  }
  if (!seen.has("registry.json")) return null;
  return marker as RegistryOutputMarker;
}

function validateRegistryIndex(
  index: unknown,
  items?: CompileResult["items"],
): RegistryOutputDiagnostic[] {
  const invalid = (message: string): RegistryOutputDiagnostic[] => [
    { code: "invalid-registry-index", message },
  ];
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    return invalid("registry.json must be an object.");
  }
  const candidate = index as { $schema?: unknown; name?: unknown; items?: unknown };
  if (
    candidate.$schema !== "https://ui.shadcn.com/schema/registry.json" ||
    typeof candidate.name !== "string" ||
    candidate.name.length === 0 ||
    !Array.isArray(candidate.items)
  ) {
    return invalid("registry.json is missing its schema, name, or items array.");
  }
  const expected = items
    ? new Map(items.map((item) => [String(item.name), String(item.type)]))
    : null;
  const seen = new Set<string>();
  for (const entry of candidate.items) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return invalid("registry.json contains a non-object item.");
    }
    const name = (entry as { name?: unknown }).name;
    const type = (entry as { type?: unknown }).type;
    if (
      typeof name !== "string" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(name) ||
      typeof type !== "string" ||
      !/^registry:(?:ui|block|hook|lib|file)$/.test(type) ||
      seen.has(name)
    ) {
      return invalid("registry.json contains an invalid or duplicate item entry.");
    }
    if (expected && expected.get(name) !== type) {
      return invalid(`registry.json does not match the rendered item ${name}.`);
    }
    seen.add(name);
  }
  if (
    expected &&
    (seen.size !== expected.size || [...expected].some(([name]) => !seen.has(name)))
  ) {
    return invalid("registry.json does not contain exactly the rendered items.");
  }
  return [];
}

function validateUnmarkedOutput(path: string, names: string[]): RegistryOutputDiagnostic[] {
  const refuse = (message: string): RegistryOutputDiagnostic[] => [
    { code: "unowned-output", message },
  ];
  if (!names.includes("registry.json")) {
    return refuse("Unmarked output cannot be adopted because registry.json is missing.");
  }

  let index: unknown;
  try {
    index = JSON.parse(readFileSync(join(path, "registry.json"), "utf8"));
  } catch {
    return refuse("Unmarked output cannot be adopted because registry.json is invalid JSON.");
  }
  const indexDiagnostics = validateRegistryIndex(index);
  if (indexDiagnostics.length > 0) return refuse(indexDiagnostics[0]!.message);
  const entries = (index as { items?: unknown }).items;
  if (!Array.isArray(entries)) return refuse("Unmarked output has no registry items array.");
  const expected = new Set<string>(["registry.json"]);
  const validateWire = createWireValidator();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return refuse("Unmarked output cannot be adopted because an index item is invalid.");
    }
    const name = (entry as { name?: unknown }).name;
    const type = (entry as { type?: unknown }).type;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return refuse("Unmarked output cannot be adopted because an index item name is invalid.");
    }
    const filename = `${name}.json`;
    if (expected.has(filename)) return refuse(`Unmarked output contains duplicate item ${name}.`);
    expected.add(filename);
    let item: unknown;
    try {
      item = JSON.parse(readFileSync(join(path, filename), "utf8"));
    } catch {
      return refuse(`Unmarked output cannot be adopted because ${filename} is missing or invalid.`);
    }
    const errors = validateWire(item);
    if (
      errors ||
      (item as { name?: unknown }).name !== name ||
      (item as { type?: unknown }).type !== type
    ) {
      return refuse(
        `Unmarked output cannot be adopted because ${filename} does not match its index entry.`,
      );
    }
  }
  const unknown = names.filter((name) => !expected.has(name));
  const missing = [...expected].filter((name) => !names.includes(name));
  if (unknown.length > 0 || missing.length > 0) {
    return refuse(
      `Unmarked output is not an exact registry (unknown: ${unknown.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}).`,
    );
  }
  return [];
}

function compareOutput(
  result: CompileResult,
  outDir: string,
  rendered: RenderedOutput,
  options: RegistryWriteOptions,
): {
  status: RegistryOutputStatus;
  changedFiles: string[];
  diagnostics: RegistryOutputDiagnostic[];
} {
  if (!existsSync(outDir)) {
    return {
      status: "missing",
      changedFiles: [...rendered.files.keys(), MARKER_NAME].sort(),
      diagnostics: [],
    };
  }

  const inspected = safeFileEntries(outDir);
  if (inspected.diagnostics.length > 0) {
    return { status: "refused", changedFiles: [], diagnostics: inspected.diagnostics };
  }
  const names = inspected.names;
  const markerPath = join(outDir, MARKER_NAME);
  if (!names.includes(MARKER_NAME)) {
    const diagnostics = validateUnmarkedOutput(outDir, names);
    if (diagnostics.length > 0) return { status: "refused", changedFiles: [], diagnostics };
  } else {
    const marker = parseMarker(readFileSync(markerPath, "utf8"));
    if (!marker) {
      return {
        status: "refused",
        changedFiles: [],
        diagnostics: [
          {
            code: "invalid-output-marker",
            message: "Registry output ownership marker is invalid.",
          },
        ],
      };
    }
    if (marker.namespace !== result.source.namespace) {
      return {
        status: "refused",
        changedFiles: [],
        diagnostics: [
          {
            code: "output-owner-mismatch",
            message: `Registry output is owned by ${marker.namespace}, not ${result.source.namespace}.`,
          },
        ],
      };
    }
    const owned = new Set([MARKER_NAME, ...marker.files.map((file) => file.path)]);
    const unknown = names.filter((name) => !owned.has(name));
    if (unknown.length > 0) {
      return {
        status: "refused",
        changedFiles: [],
        diagnostics: [
          {
            code: "unknown-output-entry",
            message: `Registry output contains unknown entries: ${unknown.join(", ")}.`,
          },
        ],
      };
    }
    const drifted = marker.files
      .filter(
        (file) =>
          !existsSync(join(outDir, file.path)) ||
          sha256(readFileSync(join(outDir, file.path))) !== file.sha256,
      )
      .map((file) => file.path);
    if (drifted.length > 0 && !options.overwriteOutput) {
      return {
        status: "refused",
        changedFiles: [],
        diagnostics: [
          {
            code: "owned-output-drift",
            message: `Registry output has locally modified generated files: ${drifted.join(", ")}. Pass --overwrite-output to replace only marker-owned files.`,
          },
        ],
      };
    }
  }

  const prospective = new Map(rendered.files);
  prospective.set(MARKER_NAME, rendered.markerText);
  const changedFiles = [...prospective]
    .filter(
      ([name, content]) =>
        !existsSync(join(outDir, name)) || readFileSync(join(outDir, name), "utf8") !== content,
    )
    .map(([name]) => name)
    .sort();
  return { status: changedFiles.length === 0 ? "clean" : "changed", changedFiles, diagnostics: [] };
}

export function planRegistryWrite(
  result: CompileResult,
  outDir: string,
  options: RegistryWriteOptions = {},
): RegistryWritePlan {
  const absolute = resolve(outDir);
  const rendered = renderOutput(result);
  const pathDiagnostics = inspectDestination(result, absolute);
  const transaction = transactionPaths(absolute);
  const artifactDiagnostics: RegistryOutputDiagnostic[] = [];
  if (existsSync(transaction.journal) || existsSync(transaction.journalTemp)) {
    artifactDiagnostics.push({
      code: "output-recovery-required",
      message: `An interrupted registry output transaction requires recovery: ${transaction.journal}`,
    });
  } else if (existsSync(transaction.stage) || existsSync(transaction.backup)) {
    artifactDiagnostics.push({
      code: "orphaned-output-transaction",
      message:
        "Registry output has orphaned staging or backup evidence and cannot be changed automatically.",
    });
  }
  const diagnostics = [...pathDiagnostics, ...artifactDiagnostics];
  if (diagnostics.length > 0) {
    return {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      status: "refused",
      ok: false,
      outDir: absolute,
      namespace: result.source.namespace,
      changedFiles: [],
      marker: rendered.marker,
      diagnostics,
    };
  }
  const comparison = compareOutput(result, absolute, rendered, options);
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    status: comparison.status,
    ok: comparison.status !== "refused",
    outDir: absolute,
    namespace: result.source.namespace,
    changedFiles: comparison.changedFiles,
    marker: rendered.marker,
    diagnostics: comparison.diagnostics,
  };
}

function writeJournal(path: string, temporaryPath: string, journal: TransactionJournal): void {
  writeFileSync(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: "wx" });
  renameSync(temporaryPath, path);
}

function replaceJournal(path: string, temporaryPath: string, journal: TransactionJournal): void {
  writeFileSync(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: "wx" });
  renameSync(temporaryPath, path);
}

function markerHashAt(path: string): string | null {
  const markerPath = join(path, MARKER_NAME);
  return existsSync(markerPath) && lstatSync(markerPath).isFile()
    ? sha256(readFileSync(markerPath))
    : null;
}

function parseJournal(path: string): TransactionJournal | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const journal = value as TransactionJournal;
  return journal.schemaVersion === 1 &&
    typeof journal.targetName === "string" &&
    typeof journal.stageName === "string" &&
    typeof journal.backupName === "string" &&
    typeof journal.hadTarget === "boolean" &&
    /^[a-f0-9]{64}$/.test(journal.markerSha256) &&
    ["prepared", "backed-up", "installed"].includes(journal.phase)
    ? journal
    : null;
}

/** Recover only a journal whose names exactly match this destination's fixed sibling artifacts. */
export function recoverRegistryWrite(outDir: string): "none" | "recovered" {
  const paths = transactionPaths(outDir);
  if (!existsSync(paths.journal)) {
    if (existsSync(paths.journalTemp) || existsSync(paths.stage) || existsSync(paths.backup)) {
      throw new RegistryOutputError([
        {
          code: "orphaned-output-transaction",
          message:
            "Registry output has orphaned transaction evidence; refusing to delete it automatically.",
        },
      ]);
    }
    return "none";
  }
  if (lstatSync(paths.journal).isSymbolicLink() || !lstatSync(paths.journal).isFile()) {
    throw new RegistryOutputError([
      { code: "invalid-output-journal", message: "Registry output journal is not a regular file." },
    ]);
  }
  const journal = parseJournal(paths.journal);
  if (
    !journal ||
    journal.targetName !== basename(paths.target) ||
    journal.stageName !== basename(paths.stage) ||
    journal.backupName !== basename(paths.backup)
  ) {
    throw new RegistryOutputError([
      {
        code: "invalid-output-journal",
        message: "Registry output journal is invalid; preserving recovery evidence.",
      },
    ]);
  }
  for (const candidate of [paths.target, paths.stage, paths.backup]) {
    if (
      existsSync(candidate) &&
      (lstatSync(candidate).isSymbolicLink() || !lstatSync(candidate).isDirectory())
    ) {
      throw new RegistryOutputError([
        {
          code: "unsafe-recovery-entry",
          message: `Recovery evidence is a link or non-directory: ${candidate}`,
        },
      ]);
    }
  }

  const installed = existsSync(paths.target) && markerHashAt(paths.target) === journal.markerSha256;
  if (installed && !existsSync(paths.stage)) {
    if (existsSync(paths.backup)) rmSync(paths.backup, { recursive: true });
    rmSync(paths.journal);
    return "recovered";
  }
  if (journal.phase === "backed-up" && !existsSync(paths.target) && existsSync(paths.stage)) {
    renameSync(paths.stage, paths.target);
    if (markerHashAt(paths.target) !== journal.markerSha256) {
      renameSync(paths.target, paths.stage);
      throw new RegistryOutputError([
        {
          code: "recovery-hash-mismatch",
          message: "Staged registry output does not match its recovery journal.",
        },
      ]);
    }
    if (existsSync(paths.backup)) rmSync(paths.backup, { recursive: true });
    rmSync(paths.journal);
    return "recovered";
  }
  if (journal.phase === "prepared") {
    if (journal.hadTarget && !existsSync(paths.target) && existsSync(paths.backup)) {
      renameSync(paths.backup, paths.target);
    }
    if (existsSync(paths.stage)) rmSync(paths.stage, { recursive: true });
    if (
      (journal.hadTarget && existsSync(paths.target)) ||
      (!journal.hadTarget && !existsSync(paths.target))
    ) {
      rmSync(paths.journal);
      return "recovered";
    }
  }
  throw new RegistryOutputError([
    {
      code: "ambiguous-output-recovery",
      message: "Registry output transaction state is ambiguous; preserving all recovery evidence.",
    },
  ]);
}

function writeStage(path: string, rendered: RenderedOutput): void {
  mkdirSync(path);
  for (const [name, content] of rendered.files)
    writeFileSync(join(path, name), content, { flag: "wx" });
  writeFileSync(join(path, MARKER_NAME), rendered.markerText, { flag: "wx" });
}

export function writeRegistry(
  result: CompileResult,
  outDir: string,
  options: RegistryWriteOptions = {},
): RegistryWriteOutcome {
  const absolute = resolve(outDir);
  const initialDiagnostics = inspectDestination(result, absolute);
  if (initialDiagnostics.length > 0) throw new RegistryOutputError(initialDiagnostics);
  recoverRegistryWrite(absolute);
  const plan = planRegistryWrite(result, absolute, options);
  if (!plan.ok) throw new RegistryOutputError(plan.diagnostics);
  if (plan.status === "clean") return { ...plan, mutated: false };

  const rendered = renderOutput(result);
  const paths = transactionPaths(absolute);
  mkdirSync(paths.parent, { recursive: true });
  if (
    existsSync(paths.stage) ||
    existsSync(paths.backup) ||
    existsSync(paths.journal) ||
    existsSync(paths.journalTemp)
  ) {
    throw new RegistryOutputError([
      {
        code: "output-transaction-collision",
        message: "Registry output transaction paths are already occupied.",
      },
    ]);
  }
  writeStage(paths.stage, rendered);
  const journal: TransactionJournal = {
    schemaVersion: 1,
    targetName: basename(paths.target),
    stageName: basename(paths.stage),
    backupName: basename(paths.backup),
    hadTarget: existsSync(paths.target),
    markerSha256: sha256(rendered.markerText),
    phase: "prepared",
  };
  writeJournal(paths.journal, paths.journalTemp, journal);

  try {
    if (journal.hadTarget) {
      renameSync(paths.target, paths.backup);
      journal.phase = "backed-up";
      replaceJournal(paths.journal, paths.journalTemp, journal);
    }
    renameSync(paths.stage, paths.target);
    journal.phase = "installed";
    replaceJournal(paths.journal, paths.journalTemp, journal);
    if (existsSync(paths.backup)) rmSync(paths.backup, { recursive: true });
    rmSync(paths.journal);
  } catch (error) {
    try {
      recoverRegistryWrite(absolute);
    } catch {
      // Preserve the original error and all ambiguous evidence for manual recovery.
    }
    throw error;
  }

  return { ...plan, mutated: true };
}
