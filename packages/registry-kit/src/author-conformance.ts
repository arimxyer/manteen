/**
 * Author-only conformance validation.
 *
 * This module intentionally proves only explicit claim ownership and filesystem
 * containment. It does not read evidence contents, infer source behavior,
 * execute author commands, or depend on a particular test runner.
 */
import { lstatSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isAbsolute as isAbsolutePosix, normalize as normalizePosix } from "node:path/posix";

import Ajv, { type ValidateFunction } from "ajv";

const PKG_ROOT = resolve(import.meta.dirname, "..");

export interface StylesApiEvidenceMapping {
  item: string;
  component: string;
  evidence: string;
}

export interface AuthorProfile {
  $schema?: string;
  schemaVersion: 1;
  stylesApi: StylesApiEvidenceMapping[];
}

export type AuthorConformanceFailureCode =
  | "author-profile-path-invalid"
  | "author-profile-file-missing"
  | "author-profile-not-file"
  | "author-profile-path-escape"
  | "author-profile-unreadable"
  | "author-profile-schema-invalid"
  | "styles-api-claim-empty"
  | "styles-api-evidence-missing"
  | "styles-api-evidence-stale"
  | "styles-api-evidence-duplicate"
  | "styles-api-evidence-shared"
  | "evidence-path-invalid"
  | "evidence-file-missing"
  | "evidence-not-file"
  | "evidence-path-escape";

export interface AuthorConformanceFailure {
  code: AuthorConformanceFailureCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthorConformanceCatalog {
  namespace: string;
  authorProfile?: string;
  items: Array<{
    name: string;
    stylesApi?: Record<string, string[]>;
  }>;
}

export interface AuthorConformanceInspection {
  enabled: boolean;
  profilePath: string | null;
  mappings: StylesApiEvidenceMapping[];
  failures: AuthorConformanceFailure[];
  claimCount: number;
  evidenceCount: number;
}

interface RepositoryFile {
  repositoryPath: string;
  realPath: string;
}

interface ClaimedComponent {
  item: string;
  component: string;
}

export class AuthorConformanceError extends Error {
  readonly failures: AuthorConformanceFailure[];

  constructor(profilePath: string, failures: AuthorConformanceFailure[]) {
    super(
      `${profilePath} failed author conformance:\n  ${failures
        .map((failure) => `[${failure.code}] ${failure.message}`)
        .join("\n  ")}`,
    );
    this.name = "AuthorConformanceError";
    this.failures = failures;
  }
}

function profileValidator(): ValidateFunction {
  const schema = JSON.parse(
    readFileSync(resolve(PKG_ROOT, "schema/manteen.author-profile.schema.json"), "utf8"),
  );
  delete schema.$schema;
  return new Ajv({ strict: false, allErrors: true }).compile(schema);
}

function schemaMessages(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

function claimKey(item: string, component: string): string {
  return JSON.stringify([item, component]);
}

function claimLabel(namespace: string, item: string, component: string): string {
  return `${namespace}/${item}#${component}`;
}

function inspectRepositoryFile(
  repositoryRoot: string,
  repositoryPath: unknown,
  role: "profile" | "evidence",
  failures: AuthorConformanceFailure[],
): RepositoryFile | null {
  const label = role === "profile" ? "authorProfile" : "evidence";
  const invalidCode = role === "profile" ? "author-profile-path-invalid" : "evidence-path-invalid";
  const missingCode = role === "profile" ? "author-profile-file-missing" : "evidence-file-missing";
  const notFileCode = role === "profile" ? "author-profile-not-file" : "evidence-not-file";
  const escapeCode = role === "profile" ? "author-profile-path-escape" : "evidence-path-escape";

  if (typeof repositoryPath !== "string" || repositoryPath.length === 0) {
    failures.push({
      code: invalidCode,
      message: `${label} must be a non-empty canonical repository-relative POSIX path`,
    });
    return null;
  }

  const normalized = normalizePosix(repositoryPath);
  const hasWindowsRoot = /^[A-Za-z]:/.test(repositoryPath) || repositoryPath.startsWith("\\\\");
  if (
    repositoryPath.includes("\\") ||
    repositoryPath.includes("\0") ||
    isAbsolutePosix(repositoryPath) ||
    hasWindowsRoot ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== repositoryPath
  ) {
    failures.push({
      code: invalidCode,
      message: `${label} ${JSON.stringify(repositoryPath)} must use canonical repository-relative POSIX syntax`,
      details: { path: repositoryPath },
    });
    return null;
  }

  const fullPath = resolve(repositoryRoot, ...repositoryPath.split("/"));
  const lexicalRelative = relative(repositoryRoot, fullPath);
  if (
    lexicalRelative === "" ||
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(lexicalRelative)
  ) {
    failures.push({
      code: escapeCode,
      message: `${label} ${JSON.stringify(repositoryPath)} escapes the catalog repository`,
      details: { path: repositoryPath },
    });
    return null;
  }

  let status: Stats;
  try {
    status = lstatSync(fullPath);
  } catch {
    failures.push({
      code: missingCode,
      message: `${label} file ${JSON.stringify(repositoryPath)} is missing`,
      details: { path: repositoryPath },
    });
    return null;
  }

  if (!status.isFile()) {
    failures.push({
      code: notFileCode,
      message: `${label} ${JSON.stringify(repositoryPath)} is not an ordinary file`,
      details: { path: repositoryPath },
    });
    return null;
  }

  const realRepositoryRoot = realpathSync(repositoryRoot);
  const realFile = realpathSync(fullPath);
  const realRelative = relative(realRepositoryRoot, realFile);
  if (
    realRelative === "" ||
    realRelative === ".." ||
    realRelative.startsWith(`..${sep}`) ||
    isAbsolute(realRelative)
  ) {
    failures.push({
      code: escapeCode,
      message: `${label} ${JSON.stringify(repositoryPath)} resolves outside the catalog repository`,
      details: { path: repositoryPath },
    });
    return null;
  }

  return { repositoryPath, realPath: realFile };
}

function catalogClaims(
  catalog: AuthorConformanceCatalog,
  failures: AuthorConformanceFailure[],
): Map<string, ClaimedComponent> {
  const claims = new Map<string, ClaimedComponent>();
  for (const item of catalog.items) {
    if (!Object.hasOwn(item, "stylesApi")) continue;
    const components = Object.keys(item.stylesApi ?? {});
    if (components.length === 0) {
      failures.push({
        code: "styles-api-claim-empty",
        message: `${catalog.namespace}/${item.name} declares stylesApi without a component claim`,
        details: { item: item.name },
      });
      continue;
    }
    for (const component of components) {
      claims.set(claimKey(item.name, component), { item: item.name, component });
    }
  }
  return claims;
}

/**
 * Inspect the optional author profile declared by a validated catalog.
 * Evidence file contents are never opened.
 */
export function inspectAuthorConformance(
  catalogPath: string,
  catalog: AuthorConformanceCatalog,
): AuthorConformanceInspection {
  if (catalog.authorProfile === undefined) {
    return {
      enabled: false,
      profilePath: null,
      mappings: [],
      failures: [],
      claimCount: 0,
      evidenceCount: 0,
    };
  }

  const repositoryRoot = dirname(resolve(catalogPath));
  const failures: AuthorConformanceFailure[] = [];
  const claims = catalogClaims(catalog, failures);
  const profileFile = inspectRepositoryFile(
    repositoryRoot,
    catalog.authorProfile,
    "profile",
    failures,
  );
  if (profileFile === null) {
    return {
      enabled: true,
      profilePath: catalog.authorProfile,
      mappings: [],
      failures,
      claimCount: claims.size,
      evidenceCount: 0,
    };
  }

  let profile: unknown;
  try {
    profile = JSON.parse(readFileSync(profileFile.realPath, "utf8"));
  } catch {
    failures.push({
      code: "author-profile-unreadable",
      message: `authorProfile ${JSON.stringify(catalog.authorProfile)} is not readable JSON`,
      details: { path: catalog.authorProfile },
    });
    return {
      enabled: true,
      profilePath: catalog.authorProfile,
      mappings: [],
      failures,
      claimCount: claims.size,
      evidenceCount: 0,
    };
  }

  const validate = profileValidator();
  if (!validate(profile)) {
    const messages = schemaMessages(validate);
    failures.push({
      code: "author-profile-schema-invalid",
      message: `authorProfile ${JSON.stringify(catalog.authorProfile)} is invalid: ${messages.join("; ")}`,
      details: { path: catalog.authorProfile, messages },
    });
    return {
      enabled: true,
      profilePath: catalog.authorProfile,
      mappings: [],
      failures,
      claimCount: claims.size,
      evidenceCount: 0,
    };
  }

  const mappings = (profile as AuthorProfile).stylesApi;
  const items = new Map(catalog.items.map((item) => [item.name, item]));
  const mappingsByClaim = new Map<string, StylesApiEvidenceMapping[]>();
  const claimsByEvidence = new Map<string, { path: string; claims: Map<string, string> }>();

  for (const mapping of mappings) {
    const key = claimKey(mapping.item, mapping.component);
    const owners = mappingsByClaim.get(key) ?? [];
    owners.push(mapping);
    mappingsByClaim.set(key, owners);

    const item = items.get(mapping.item);
    if (item === undefined || !Object.hasOwn(item, "stylesApi")) {
      failures.push({
        code: "styles-api-evidence-stale",
        message: `${claimLabel(catalog.namespace, mapping.item, mapping.component)} does not point to an item with a current stylesApi claim`,
        details: { item: mapping.item, component: mapping.component },
      });
    } else if (!Object.hasOwn(item.stylesApi ?? {}, mapping.component)) {
      failures.push({
        code: "styles-api-evidence-stale",
        message: `${claimLabel(catalog.namespace, mapping.item, mapping.component)} is not declared by the item's current stylesApi`,
        details: { item: mapping.item, component: mapping.component },
      });
    }

    const evidenceFile = inspectRepositoryFile(
      repositoryRoot,
      mapping.evidence,
      "evidence",
      failures,
    );
    if (evidenceFile !== null) {
      const evidenceOwner = claimsByEvidence.get(evidenceFile.realPath) ?? {
        path: evidenceFile.repositoryPath,
        claims: new Map<string, string>(),
      };
      evidenceOwner.claims.set(key, claimLabel(catalog.namespace, mapping.item, mapping.component));
      claimsByEvidence.set(evidenceFile.realPath, evidenceOwner);
    }
  }

  for (const [key, claim] of claims) {
    const owners = mappingsByClaim.get(key) ?? [];
    if (owners.length === 0) {
      failures.push({
        code: "styles-api-evidence-missing",
        message: `${claimLabel(catalog.namespace, claim.item, claim.component)} has no evidence mapping`,
        details: { item: claim.item, component: claim.component },
      });
    } else if (owners.length > 1) {
      failures.push({
        code: "styles-api-evidence-duplicate",
        message: `${claimLabel(catalog.namespace, claim.item, claim.component)} has ${owners.length} evidence mappings; expected exactly one`,
        details: { item: claim.item, component: claim.component, count: owners.length },
      });
    }
  }

  for (const owner of claimsByEvidence.values()) {
    if (owner.claims.size <= 1) continue;
    const claimLabels = [...owner.claims.values()].sort();
    failures.push({
      code: "styles-api-evidence-shared",
      message: `evidence ${JSON.stringify(owner.path)} is reused by ${claimLabels.join(", ")}`,
      details: { path: owner.path, claims: claimLabels },
    });
  }

  return {
    enabled: true,
    profilePath: catalog.authorProfile,
    mappings,
    failures,
    claimCount: claims.size,
    evidenceCount: claimsByEvidence.size,
  };
}
