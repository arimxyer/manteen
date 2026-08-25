import { createHash } from "node:crypto";
import {
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { isAbsolute as isAbsolutePosix, normalize as normalizePosix } from "node:path/posix";

import { inspectAuthorConformance, type MantineRegistry, validateCatalog } from "./build-registry";
import { inspectMantineRanges } from "./mantine-ranges";
import {
  renderScaffoldTemplate,
  SCAFFOLD_TEMPLATES,
  type ScaffoldTemplate,
  type ScaffoldTemplateFile,
} from "./scaffold-templates";

const SHA256 = /^[a-f0-9]{64}$/;
export const SCAFFOLD_ITEM_NAME =
  /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isScaffoldItemName(value: string): boolean {
  return SCAFFOLD_ITEM_NAME.test(value);
}

export interface ScaffoldDiagnostic {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ScaffoldPlannedFile {
  path: string;
  sha256: string;
  preimageSha256: string | null;
  operation: "create" | "noop" | "refuse";
  content: string;
}

export interface ScaffoldPreservedFile {
  role: "catalog" | "author-profile" | "package-manifest";
  path: string;
  sha256: string | null;
}

export interface ScaffoldPlanBody {
  schemaVersion: 1;
  template: ScaffoldTemplate;
  itemName: string;
  catalogPath: string;
  catalogPreimageSha256: string;
  files: ScaffoldPlannedFile[];
  preservedFiles: ScaffoldPreservedFile[];
  requiredPackages: { runtime: string[]; development: string[] };
  catalogInsertion: ReturnType<typeof renderScaffoldTemplate>["catalogInsertion"];
  authorProfileInsertion: {
    profilePath: string | null;
    mapping: NonNullable<ReturnType<typeof renderScaffoldTemplate>["authorProfileMapping"]>;
  } | null;
  safe: boolean;
  diagnostics: ScaffoldDiagnostic[];
}

export interface ScaffoldPlan extends ScaffoldPlanBody {
  planDigest: string;
}

export interface ScaffoldInput {
  catalogPath: string;
  template: ScaffoldTemplate;
  itemName: string;
}

export interface ScaffoldApplyOutcome {
  plan: ScaffoldPlan;
  mutated: boolean;
  writtenPaths: string[];
}

export class ScaffoldError extends Error {
  constructor(
    readonly diagnostics: ScaffoldDiagnostic[],
    readonly mutated = false,
  ) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "ScaffoldError";
  }
}

function lstatIfPresent(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

interface ScaffoldApplyHooks {
  afterCommit?: (path: string, committedCount: number) => void;
  beforeTemporaryCleanup?: (paths: readonly string[]) => void;
  beforeStageWrite?: (path: string, temporaryPath: string, index: number) => void;
  beforeCommitLink?: (path: string, temporaryPath: string, index: number) => void;
  beforeCleanup?: (phase: ScaffoldCleanupPhase, path: string) => void;
}

type ScaffoldCleanupPhase =
  | "rollback"
  | "success-staging"
  | "failure-staging"
  | "created-directory";

interface ScaffoldTemporaryFile {
  absolutePath: string;
  repositoryPath: string;
  sha256: string;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPathDiagnostic(path: string): ScaffoldDiagnostic | null {
  const normalized = normalizePosix(path);
  const hasWindowsRoot = /^[A-Za-z]:/.test(path) || path.startsWith("\\\\");
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolutePosix(path) ||
    hasWindowsRoot ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== path
  ) {
    return {
      code: "scaffold-path-invalid",
      message: `Scaffold path ${JSON.stringify(path)} is not canonical catalog-root-relative POSIX syntax.`,
      details: { path },
    };
  }
  return null;
}

function fullPath(root: string, repositoryPath: string): string | null {
  const candidate = resolve(root, ...repositoryPath.split("/"));
  const fromRoot = relative(root, candidate);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    return null;
  }
  return candidate;
}

function repositoryPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

function inspectParents(root: string, repositoryPath: string): ScaffoldDiagnostic[] {
  const diagnostics: ScaffoldDiagnostic[] = [];
  const parts = repositoryPath.split("/").slice(0, -1);
  let cursor = root;

  const absoluteRoot = resolve(root);
  const filesystemRoot = parse(absoluteRoot).root;
  let rootCursor = filesystemRoot;
  const rootParts = absoluteRoot.slice(filesystemRoot.length).split(sep).filter(Boolean);
  for (const part of rootParts) {
    rootCursor = join(rootCursor, part);
    const rootStatus = lstatIfPresent(rootCursor);
    if (!rootStatus) continue;
    if (rootStatus.isSymbolicLink()) {
      diagnostics.push({
        code: "scaffold-parent-symlink",
        message: "The catalog root is reached through a symbolic link.",
      });
      return diagnostics;
    }
    if (!rootStatus.isDirectory() && rootCursor !== absoluteRoot) {
      diagnostics.push({
        code: "scaffold-parent-not-directory",
        message: "The catalog root has a non-directory ancestor.",
      });
      return diagnostics;
    }
  }

  for (const part of parts) {
    cursor = join(cursor, part);
    const status = lstatIfPresent(cursor);
    if (!status) continue;
    if (status.isSymbolicLink()) {
      diagnostics.push({
        code: "scaffold-parent-symlink",
        message: `Scaffold destination has a symbolic-link parent: ${repositoryPath}`,
        details: { path: repositoryPath, parent: relative(root, cursor).split(sep).join("/") },
      });
      break;
    }
    if (!status.isDirectory()) {
      diagnostics.push({
        code: "scaffold-parent-not-directory",
        message: `Scaffold destination has a non-directory parent: ${repositoryPath}`,
        details: { path: repositoryPath, parent: relative(root, cursor).split(sep).join("/") },
      });
      break;
    }
  }
  return diagnostics;
}

function cleanupPathDiagnostics(
  root: string,
  path: string,
  phase: ScaffoldCleanupPhase,
): ScaffoldDiagnostic[] {
  const causes = inspectParents(root, path);
  if (causes.length === 0) return [];
  return [
    {
      code: "scaffold-cleanup-path-unsafe",
      message: `Refusing ${phase} cleanup through an unsafe parent chain: ${path}.`,
      details: { path, phase, causes: causes.map((cause) => cause.code) },
    },
  ];
}

function inspectPlannedFile(
  root: string,
  file: ScaffoldTemplateFile,
  diagnostics: ScaffoldDiagnostic[],
): ScaffoldPlannedFile {
  const hash = sha256(file.content);
  const pathDiagnostic = canonicalPathDiagnostic(file.path);
  if (pathDiagnostic) {
    diagnostics.push(pathDiagnostic);
    return {
      path: file.path,
      sha256: hash,
      preimageSha256: null,
      operation: "refuse",
      content: file.content,
    };
  }
  const destination = fullPath(root, file.path);
  if (!destination) {
    diagnostics.push({
      code: "scaffold-path-escape",
      message: `Scaffold destination escapes the catalog root: ${file.path}`,
      details: { path: file.path },
    });
    return {
      path: file.path,
      sha256: hash,
      preimageSha256: null,
      operation: "refuse",
      content: file.content,
    };
  }
  const parentDiagnostics = inspectParents(root, file.path);
  diagnostics.push(...parentDiagnostics);
  if (parentDiagnostics.length > 0) {
    return {
      path: file.path,
      sha256: hash,
      preimageSha256: null,
      operation: "refuse",
      content: file.content,
    };
  }
  const status = lstatIfPresent(destination);
  if (!status) {
    return {
      path: file.path,
      sha256: hash,
      preimageSha256: null,
      operation: "create",
      content: file.content,
    };
  }

  if (status.isSymbolicLink()) {
    diagnostics.push({
      code: "scaffold-file-symlink",
      message: `Scaffold destination is a symbolic link: ${file.path}`,
      details: { path: file.path },
    });
  } else if (!status.isFile()) {
    diagnostics.push({
      code: status.isDirectory() ? "scaffold-file-directory" : "scaffold-file-not-ordinary",
      message: `Scaffold destination is not an ordinary file: ${file.path}`,
      details: { path: file.path },
    });
  } else {
    const bytes = readFileSync(destination);
    const preimageSha256 = sha256(bytes);
    if (bytes.equals(Buffer.from(file.content))) {
      return {
        path: file.path,
        sha256: hash,
        preimageSha256,
        operation: "noop",
        content: file.content,
      };
    }
    diagnostics.push({
      code: "scaffold-file-collision",
      message: `Authored file differs from the scaffold and will not be overwritten: ${file.path}`,
      details: { path: file.path, preimageSha256 },
    });
    return {
      path: file.path,
      sha256: hash,
      preimageSha256,
      operation: "refuse",
      content: file.content,
    };
  }

  return {
    path: file.path,
    sha256: hash,
    preimageSha256: null,
    operation: "refuse",
    content: file.content,
  };
}

function inspectPreservedFile(
  root: string,
  role: ScaffoldPreservedFile["role"],
  path: string,
  required: boolean,
  diagnostics: ScaffoldDiagnostic[],
): ScaffoldPreservedFile {
  const invalid = canonicalPathDiagnostic(path);
  if (invalid) {
    diagnostics.push({ ...invalid, code: `scaffold-${role}-path-invalid` });
    return { role, path, sha256: null };
  }
  const destination = fullPath(root, path);
  if (!destination) {
    diagnostics.push({
      code: `scaffold-${role}-path-escape`,
      message: `${role} path escapes the catalog root: ${path}`,
      details: { path },
    });
    return { role, path, sha256: null };
  }
  const parentDiagnostics = inspectParents(root, path);
  if (parentDiagnostics.length > 0) {
    diagnostics.push(
      ...parentDiagnostics.map((diagnostic) => ({
        ...diagnostic,
        code: `scaffold-${role}-parent-unsafe`,
      })),
    );
    return { role, path, sha256: null };
  }
  const status = lstatIfPresent(destination);
  if (!status) {
    if (required) {
      diagnostics.push({
        code: `scaffold-${role}-missing`,
        message: `${role} file is missing: ${path}`,
        details: { path },
      });
    }
    return { role, path, sha256: null };
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    diagnostics.push({
      code: `scaffold-${role}-not-ordinary`,
      message: `${role} path is not an ordinary file: ${path}`,
      details: { path },
    });
    return { role, path, sha256: null };
  }
  return { role, path, sha256: sha256(readFileSync(destination)) };
}

function digestBody(body: ScaffoldPlanBody): string {
  return sha256(JSON.stringify(body));
}

export function planScaffold(input: ScaffoldInput): ScaffoldPlan {
  if (!SCAFFOLD_TEMPLATES.includes(input.template)) {
    throw new ScaffoldError([
      {
        code: "scaffold-template-invalid",
        message: `Unknown scaffold template: ${String(input.template)}.`,
        details: { template: input.template },
      },
    ]);
  }

  const diagnostics: ScaffoldDiagnostic[] = [];
  const absoluteCatalog = resolve(input.catalogPath);
  const root = dirname(absoluteCatalog);
  const catalogPath = basename(absoluteCatalog);
  const rendered = renderScaffoldTemplate(input.template, input.itemName);
  const catalogSnapshot = inspectPreservedFile(root, "catalog", catalogPath, true, diagnostics);
  let catalog: MantineRegistry | null = null;
  let catalogBytes = "";

  if (!isScaffoldItemName(input.itemName)) {
    diagnostics.push({
      code: "scaffold-item-name-invalid",
      message: `Scaffold item name must be portable strict kebab-case: ${JSON.stringify(input.itemName)}.`,
      details: { itemName: input.itemName },
    });
  }

  if (catalogSnapshot.sha256) {
    try {
      catalogBytes = readFileSync(absoluteCatalog, "utf8");
      const value: unknown = JSON.parse(catalogBytes);
      const errors = validateCatalog(value);
      if (errors) {
        diagnostics.push({
          code: "scaffold-catalog-invalid",
          message: "The scaffold catalog does not satisfy the authoring schema.",
          details: { errors },
        });
      } else {
        catalog = value as MantineRegistry;
        const rangeFailures = inspectMantineRanges(catalog);
        if (rangeFailures.length > 0) {
          diagnostics.push({
            code: "scaffold-catalog-range-invalid",
            message: "The scaffold catalog has incoherent Mantine compatibility declarations.",
            details: { failures: rangeFailures },
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        code: "scaffold-catalog-unreadable",
        message: `The scaffold catalog is not readable JSON: ${catalogPath}.`,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  if (catalog?.items.some((item) => item.name === input.itemName)) {
    diagnostics.push({
      code: "scaffold-catalog-item-collision",
      message: `Catalog item already exists: ${input.itemName}.`,
      details: { itemName: input.itemName },
    });
  }

  const preservedFiles: ScaffoldPreservedFile[] = [catalogSnapshot];
  const packageSnapshot = inspectPreservedFile(
    root,
    "package-manifest",
    "package.json",
    false,
    diagnostics,
  );
  preservedFiles.push(packageSnapshot);

  let profilePath: string | null = null;
  if (catalog?.authorProfile !== undefined) {
    profilePath = catalog.authorProfile;
    const profileSnapshot = inspectPreservedFile(
      root,
      "author-profile",
      profilePath,
      true,
      diagnostics,
    );
    preservedFiles.push(profileSnapshot);
    if (profileSnapshot.sha256) {
      try {
        const profile = JSON.parse(readFileSync(join(root, ...profilePath.split("/")), "utf8")) as {
          schemaVersion?: unknown;
          stylesApi?: unknown;
        };
        if (profile.schemaVersion !== 1 || !Array.isArray(profile.stylesApi)) {
          diagnostics.push({
            code: "scaffold-author-profile-invalid",
            message: `Author profile is not a schema-version 1 evidence document: ${profilePath}.`,
            details: { path: profilePath },
          });
        }
      } catch (error) {
        diagnostics.push({
          code: "scaffold-author-profile-invalid",
          message: `Author profile is not readable JSON: ${profilePath}.`,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }

  if (catalog) {
    const conformance = inspectAuthorConformance(absoluteCatalog, catalog);
    if (conformance.failures.length > 0) {
      diagnostics.push({
        code: "scaffold-author-profile-invalid",
        message: "The scaffold catalog's author profile does not currently conform.",
        details: { failures: conformance.failures },
      });
    }
  }

  const files = [...rendered.files]
    .sort((left, right) => codeUnitCompare(left.path, right.path))
    .map((file) => inspectPlannedFile(root, file, diagnostics));
  preservedFiles.sort((left, right) => codeUnitCompare(left.path, right.path));
  diagnostics.sort((left, right) =>
    codeUnitCompare(
      `${left.code}\0${JSON.stringify(left.details ?? {})}`,
      `${right.code}\0${JSON.stringify(right.details ?? {})}`,
    ),
  );

  const body: ScaffoldPlanBody = {
    schemaVersion: 1,
    template: input.template,
    itemName: input.itemName,
    catalogPath,
    catalogPreimageSha256: catalogSnapshot.sha256 ?? sha256(catalogBytes),
    files,
    preservedFiles,
    requiredPackages: rendered.requiredPackages,
    catalogInsertion: rendered.catalogInsertion,
    authorProfileInsertion: rendered.authorProfileMapping
      ? { profilePath, mapping: rendered.authorProfileMapping }
      : null,
    safe: diagnostics.length === 0 && files.every((file) => file.operation !== "refuse"),
    diagnostics,
  };
  return { ...body, planDigest: digestBody(body) };
}

function verifyPreservedFiles(root: string, plan: ScaffoldPlan): ScaffoldDiagnostic[] {
  const diagnostics: ScaffoldDiagnostic[] = [];
  for (const preserved of plan.preservedFiles) {
    const destination = fullPath(root, preserved.path);
    const status = destination ? lstatIfPresent(destination) : null;
    const current = destination && status?.isFile() ? sha256(readFileSync(destination)) : null;
    if (current !== preserved.sha256) {
      diagnostics.push({
        code: `scaffold-${preserved.role}-drift`,
        message: `${preserved.role} changed after planning: ${preserved.path}.`,
        details: { path: preserved.path, expected: preserved.sha256, actual: current },
      });
    }
  }
  return diagnostics;
}

function createParentDirectories(root: string, files: ScaffoldPlannedFile[]): string[] {
  const needed = new Set<string>();
  for (const file of files) {
    let path = dirname(join(root, ...file.path.split("/")));
    while (path !== root && relative(root, path) !== "") {
      if (!lstatIfPresent(path)) needed.add(path);
      path = dirname(path);
    }
  }
  const ordered = [...needed].sort((left, right) => {
    const depth = left.split(sep).length - right.split(sep).length;
    return depth || codeUnitCompare(left, right);
  });
  const created: string[] = [];
  for (const path of ordered) {
    if (lstatIfPresent(path)) continue;
    mkdirSync(path);
    created.push(path);
  }
  return created;
}

function unsafeCleanupLeafDiagnostic(
  path: string,
  phase: ScaffoldCleanupPhase,
  reason: string,
): ScaffoldDiagnostic {
  return {
    code: "scaffold-cleanup-path-unsafe",
    message: `Refusing ${phase} cleanup at an unsafe leaf: ${path}.`,
    details: { path, phase, reason },
  };
}

function cleanupTemporaryFile(
  root: string,
  temporary: ScaffoldTemporaryFile,
  phase: "success-staging" | "failure-staging",
  hooks: ScaffoldApplyHooks,
): ScaffoldDiagnostic[] {
  hooks.beforeCleanup?.(phase, temporary.repositoryPath);
  const diagnostics = cleanupPathDiagnostics(root, temporary.repositoryPath, phase);
  if (diagnostics.length > 0) return diagnostics;

  const status = lstatIfPresent(temporary.absolutePath);
  if (!status) {
    return phase === "success-staging"
      ? [
          {
            code: "scaffold-temporary-cleanup-failed",
            message: `A scaffold staging file disappeared before success cleanup: ${temporary.repositoryPath}.`,
            details: { path: temporary.repositoryPath, phase },
          },
        ]
      : [];
  }
  if (!status.isFile()) {
    return [
      unsafeCleanupLeafDiagnostic(
        temporary.repositoryPath,
        phase,
        "staging leaf is not an ordinary file",
      ),
    ];
  }
  if (sha256(readFileSync(temporary.absolutePath)) !== temporary.sha256) {
    return [
      {
        code: "scaffold-temporary-cleanup-failed",
        message: `A scaffold staging file changed before cleanup: ${temporary.repositoryPath}.`,
        details: { path: temporary.repositoryPath, phase },
      },
    ];
  }
  unlinkSync(temporary.absolutePath);
  return [];
}

function cleanupCreatedDirectories(
  root: string,
  paths: string[],
  hooks: ScaffoldApplyHooks,
): ScaffoldDiagnostic[] {
  const diagnostics: ScaffoldDiagnostic[] = [];
  for (const absolutePath of [...paths].reverse()) {
    const path = repositoryPath(root, absolutePath);
    hooks.beforeCleanup?.("created-directory", path);
    const pathDiagnostics = cleanupPathDiagnostics(root, path, "created-directory");
    if (pathDiagnostics.length > 0) {
      diagnostics.push(...pathDiagnostics);
      continue;
    }

    const status = lstatIfPresent(absolutePath);
    if (!status) continue;
    if (!status.isDirectory()) {
      diagnostics.push(
        unsafeCleanupLeafDiagnostic(path, "created-directory", "created directory was replaced"),
      );
      continue;
    }
    if (readdirSync(absolutePath).length > 0) {
      diagnostics.push({
        code: "scaffold-directory-cleanup-failed",
        message: `A scaffold-created directory is not empty after cleanup: ${path}.`,
        details: { path },
      });
      continue;
    }
    rmdirSync(absolutePath);
  }
  return diagnostics;
}

/** Internal hooks exist only so tests can prove deterministic operation-boundary failures. */
export function applyScaffoldWithHooks(
  input: ScaffoldInput,
  expectedPlan: string,
  hooks: ScaffoldApplyHooks = {},
): ScaffoldApplyOutcome {
  if (!SHA256.test(expectedPlan)) {
    throw new ScaffoldError([
      {
        code: "scaffold-plan-digest-invalid",
        message: "Expected plan must be a lowercase SHA-256 digest.",
      },
    ]);
  }
  const plan = planScaffold(input);
  if (!plan.safe) throw new ScaffoldError(plan.diagnostics);
  if (plan.planDigest !== expectedPlan) {
    throw new ScaffoldError([
      {
        code: "scaffold-plan-stale",
        message: "The scaffold plan no longer matches --expect-plan; run a new dry-run.",
        details: { expectedPlan, actualPlan: plan.planDigest },
      },
    ]);
  }

  const root = dirname(resolve(input.catalogPath));
  const preservedDiagnostics = verifyPreservedFiles(root, plan);
  if (preservedDiagnostics.length > 0) throw new ScaffoldError(preservedDiagnostics);
  const fresh = planScaffold(input);
  if (!fresh.safe || fresh.planDigest !== expectedPlan) {
    throw new ScaffoldError(
      fresh.safe
        ? [{ code: "scaffold-plan-stale", message: "The scaffold plan changed before apply." }]
        : fresh.diagnostics,
    );
  }

  const creates = plan.files.filter((file) => file.operation === "create");
  if (creates.length === 0) return { plan, mutated: false, writtenPaths: [] };

  const createdDirectories: string[] = [];
  const temporaryFiles: ScaffoldTemporaryFile[] = [];
  const committed: ScaffoldPlannedFile[] = [];
  try {
    createdDirectories.push(...createParentDirectories(root, creates));
    for (const file of creates) {
      const parentDiagnostics = inspectParents(root, file.path);
      if (parentDiagnostics.length > 0) throw new ScaffoldError(parentDiagnostics);
      const destination = join(root, ...file.path.split("/"));
      if (lstatIfPresent(destination)) {
        throw new ScaffoldError([
          {
            code: "scaffold-file-preimage-stale",
            message: `Scaffold destination became occupied before apply: ${file.path}.`,
            details: { path: file.path },
          },
        ]);
      }
    }

    for (const [index, file] of creates.entries()) {
      const destination = join(root, ...file.path.split("/"));
      const absolutePath = join(
        dirname(destination),
        `.${basename(destination)}.manteen-kit-${process.pid}-${index}.tmp`,
      );
      const temporaryPath = repositoryPath(root, absolutePath);
      hooks.beforeStageWrite?.(file.path, temporaryPath, index);
      const parentDiagnostics = inspectParents(root, temporaryPath);
      if (parentDiagnostics.length > 0) throw new ScaffoldError(parentDiagnostics);
      if (lstatIfPresent(absolutePath)) {
        throw new ScaffoldError([
          {
            code: "scaffold-staging-file-preimage-stale",
            message: `Scaffold staging destination became occupied: ${temporaryPath}.`,
            details: { path: temporaryPath },
          },
        ]);
      }
      writeFileSync(absolutePath, file.content, { flag: "wx" });
      temporaryFiles.push({ absolutePath, repositoryPath: temporaryPath, sha256: file.sha256 });
    }

    for (const [index, file] of creates.entries()) {
      const destination = join(root, ...file.path.split("/"));
      const temporary = temporaryFiles[index]!;
      hooks.beforeCommitLink?.(file.path, temporary.repositoryPath, index);
      const parentDiagnostics = [
        ...inspectParents(root, file.path),
        ...inspectParents(root, temporary.repositoryPath),
      ];
      if (parentDiagnostics.length > 0) throw new ScaffoldError(parentDiagnostics);
      const temporaryStatus = lstatIfPresent(temporary.absolutePath);
      if (
        !temporaryStatus?.isFile() ||
        sha256(readFileSync(temporary.absolutePath)) !== temporary.sha256
      ) {
        throw new ScaffoldError([
          {
            code: "scaffold-staging-file-drift",
            message: `Scaffold staging file changed before commit: ${temporary.repositoryPath}.`,
            details: { path: temporary.repositoryPath },
          },
        ]);
      }
      if (lstatIfPresent(destination)) {
        throw new ScaffoldError([
          {
            code: "scaffold-file-preimage-stale",
            message: `Scaffold destination became occupied before commit: ${file.path}.`,
            details: { path: file.path },
          },
        ]);
      }
      linkSync(temporary.absolutePath, destination);
      committed.push(file);
      hooks.afterCommit?.(file.path, committed.length);
    }

    const postconditionDiagnostics = verifyPreservedFiles(root, plan);
    for (const file of plan.files) {
      const destination = join(root, ...file.path.split("/"));
      const status = lstatIfPresent(destination);
      if (!status?.isFile() || sha256(readFileSync(destination)) !== file.sha256) {
        postconditionDiagnostics.push({
          code: "scaffold-file-postcondition-failed",
          message: `Scaffold file does not match the plan after apply: ${file.path}.`,
          details: { path: file.path },
        });
      }
    }
    if (postconditionDiagnostics.length > 0) throw new ScaffoldError(postconditionDiagnostics);

    hooks.beforeTemporaryCleanup?.(temporaryFiles.map((temporary) => temporary.absolutePath));
    while (temporaryFiles.length > 0) {
      const cleanupDiagnostics = cleanupTemporaryFile(
        root,
        temporaryFiles[0]!,
        "success-staging",
        hooks,
      );
      if (cleanupDiagnostics.length > 0) throw new ScaffoldError(cleanupDiagnostics);
      temporaryFiles.shift();
    }
    return { plan, mutated: true, writtenPaths: creates.map((file) => file.path) };
  } catch (error) {
    const rollbackDiagnostics: ScaffoldDiagnostic[] = [];
    for (const file of [...committed].reverse()) {
      const destination = join(root, ...file.path.split("/"));
      try {
        hooks.beforeCleanup?.("rollback", file.path);
        const pathDiagnostics = cleanupPathDiagnostics(root, file.path, "rollback");
        if (pathDiagnostics.length > 0) {
          rollbackDiagnostics.push(...pathDiagnostics);
          continue;
        }
        const status = lstatIfPresent(destination);
        if (status) {
          if (status.isFile() && sha256(readFileSync(destination)) === file.sha256) {
            unlinkSync(destination);
          } else {
            rollbackDiagnostics.push({
              code: "scaffold-rollback-preimage-drift",
              message: `Scaffold file changed before rollback and was preserved: ${file.path}.`,
              details: { path: file.path },
            });
          }
        }
      } catch (rollbackError) {
        rollbackDiagnostics.push({
          code: "scaffold-rollback-failed",
          message: `Could not roll back scaffold file: ${file.path}.`,
          details: {
            path: file.path,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          },
        });
      }
    }
    for (const temporary of temporaryFiles) {
      try {
        rollbackDiagnostics.push(
          ...cleanupTemporaryFile(root, temporary, "failure-staging", hooks),
        );
      } catch (cleanupError) {
        rollbackDiagnostics.push({
          code: "scaffold-temporary-cleanup-failed",
          message: "A scaffold staging file could not be removed after failure.",
          details: {
            path: temporary.repositoryPath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          },
        });
      }
    }
    temporaryFiles.length = 0;
    try {
      rollbackDiagnostics.push(...cleanupCreatedDirectories(root, createdDirectories, hooks));
    } catch (cleanupError) {
      rollbackDiagnostics.push({
        code: "scaffold-directory-cleanup-failed",
        message: "A scaffold-created directory could not be removed after failure.",
        details: {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        },
      });
    }
    const original =
      error instanceof ScaffoldError
        ? error.diagnostics
        : [
            {
              code: "scaffold-apply-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          ];
    throw new ScaffoldError([...original, ...rollbackDiagnostics], rollbackDiagnostics.length > 0);
  }
}

export function applyScaffold(input: ScaffoldInput, expectedPlan: string): ScaffoldApplyOutcome {
  return applyScaffoldWithHooks(input, expectedPlan);
}
