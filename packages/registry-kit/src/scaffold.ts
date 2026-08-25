import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { isAbsolute as isAbsolutePosix, normalize as normalizePosix } from "node:path/posix";

import { inspectAuthorConformance, type MantineRegistry, validateCatalog } from "./build-registry";
import { inspectMantineRanges } from "./mantine-ranges";
import {
  renderScaffoldTemplate,
  type ScaffoldTemplate,
  type ScaffoldTemplateFile,
} from "./scaffold-templates";

const SHA256 = /^[a-f0-9]{64}$/;
export const SCAFFOLD_ITEM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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
  constructor(readonly diagnostics: ScaffoldDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "ScaffoldError";
  }
}

interface ScaffoldApplyHooks {
  afterCommit?: (path: string, committedCount: number) => void;
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
    if (!existsSync(rootCursor)) continue;
    const rootStatus = lstatSync(rootCursor);
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
    if (!existsSync(cursor)) continue;
    const status = lstatSync(cursor);
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
  if (!existsSync(destination)) {
    return {
      path: file.path,
      sha256: hash,
      preimageSha256: null,
      operation: "create",
      content: file.content,
    };
  }

  const status = lstatSync(destination);
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
  if (!existsSync(destination)) {
    if (required) {
      diagnostics.push({
        code: `scaffold-${role}-missing`,
        message: `${role} file is missing: ${path}`,
        details: { path },
      });
    }
    return { role, path, sha256: null };
  }
  const status = lstatSync(destination);
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
  const diagnostics: ScaffoldDiagnostic[] = [];
  const absoluteCatalog = resolve(input.catalogPath);
  const root = dirname(absoluteCatalog);
  const catalogPath = basename(absoluteCatalog);
  const rendered = renderScaffoldTemplate(input.template, input.itemName);
  const catalogSnapshot = inspectPreservedFile(root, "catalog", catalogPath, true, diagnostics);
  let catalog: MantineRegistry | null = null;
  let catalogBytes = "";

  if (!SCAFFOLD_ITEM_NAME.test(input.itemName)) {
    diagnostics.push({
      code: "scaffold-item-name-invalid",
      message: `Scaffold item name must be strict kebab-case: ${JSON.stringify(input.itemName)}.`,
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
    const current =
      destination && existsSync(destination) && lstatSync(destination).isFile()
        ? sha256(readFileSync(destination))
        : null;
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
      if (!existsSync(path)) needed.add(path);
      path = dirname(path);
    }
  }
  const ordered = [...needed].sort((left, right) => {
    const depth = left.split(sep).length - right.split(sep).length;
    return depth || codeUnitCompare(left, right);
  });
  const created: string[] = [];
  for (const path of ordered) {
    if (existsSync(path)) continue;
    mkdirSync(path);
    created.push(path);
  }
  return created;
}

function removeEmptyDirectories(paths: string[]): void {
  for (const path of [...paths].reverse()) {
    if (existsSync(path) && lstatSync(path).isDirectory() && readdirSync(path).length === 0) {
      rmdirSync(path);
    }
  }
}

/** Internal hook exists only so tests can prove rollback after a mid-commit failure. */
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
  const temporaryFiles: string[] = [];
  const committed: ScaffoldPlannedFile[] = [];
  try {
    createdDirectories.push(...createParentDirectories(root, creates));
    for (const file of creates) {
      const parentDiagnostics = inspectParents(root, file.path);
      if (parentDiagnostics.length > 0) throw new ScaffoldError(parentDiagnostics);
      const destination = join(root, ...file.path.split("/"));
      if (existsSync(destination)) {
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
      const temporary = join(
        dirname(destination),
        `.${basename(destination)}.manteen-kit-${process.pid}-${index}.tmp`,
      );
      writeFileSync(temporary, file.content, { flag: "wx" });
      temporaryFiles.push(temporary);
    }

    for (const [index, file] of creates.entries()) {
      const destination = join(root, ...file.path.split("/"));
      const temporary = temporaryFiles[index]!;
      linkSync(temporary, destination);
      committed.push(file);
      hooks.afterCommit?.(file.path, committed.length);
    }

    const postconditionDiagnostics = verifyPreservedFiles(root, plan);
    for (const file of plan.files) {
      const destination = join(root, ...file.path.split("/"));
      if (
        !existsSync(destination) ||
        !lstatSync(destination).isFile() ||
        sha256(readFileSync(destination)) !== file.sha256
      ) {
        postconditionDiagnostics.push({
          code: "scaffold-file-postcondition-failed",
          message: `Scaffold file does not match the plan after apply: ${file.path}.`,
          details: { path: file.path },
        });
      }
    }
    if (postconditionDiagnostics.length > 0) throw new ScaffoldError(postconditionDiagnostics);

    for (const temporary of temporaryFiles.splice(0)) unlinkSync(temporary);
    return { plan, mutated: true, writtenPaths: creates.map((file) => file.path) };
  } catch (error) {
    const rollbackDiagnostics: ScaffoldDiagnostic[] = [];
    for (const file of [...committed].reverse()) {
      const destination = join(root, ...file.path.split("/"));
      try {
        if (existsSync(destination)) {
          if (sha256(readFileSync(destination)) === file.sha256) {
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
    for (const temporary of temporaryFiles.splice(0)) {
      try {
        if (existsSync(temporary)) unlinkSync(temporary);
      } catch (cleanupError) {
        rollbackDiagnostics.push({
          code: "scaffold-temporary-cleanup-failed",
          message: "A scaffold staging file could not be removed after failure.",
          details: {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          },
        });
      }
    }
    try {
      removeEmptyDirectories(createdDirectories);
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
    throw new ScaffoldError([...original, ...rollbackDiagnostics]);
  }
}

export function applyScaffold(input: ScaffoldInput, expectedPlan: string): ScaffoldApplyOutcome {
  return applyScaffoldWithHooks(input, expectedPlan);
}
