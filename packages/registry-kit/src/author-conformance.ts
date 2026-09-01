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

interface EvidenceMapping {
  item: string;
  evidence: string;
}

export interface StylesApiEvidenceMapping extends EvidenceMapping {
  component: string;
}

export interface PropsEvidenceMapping extends EvidenceMapping {
  export: string;
}

export type UsageEvidenceMapping = EvidenceMapping;

export type AuthorEvidenceMapping =
  | StylesApiEvidenceMapping
  | PropsEvidenceMapping
  | UsageEvidenceMapping;

export interface AuthorProfile {
  $schema?: string;
  schemaVersion: 2;
  stylesApi?: StylesApiEvidenceMapping[];
  props?: PropsEvidenceMapping[];
  usage?: UsageEvidenceMapping[];
  verification?: AuthorVerificationConfig;
}

export interface AuthorVerificationConfig {
  scripts: string[];
  timeoutMs?: number;
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
  | "props-claim-empty"
  | "props-evidence-missing"
  | "props-evidence-stale"
  | "props-evidence-duplicate"
  | "usage-evidence-missing"
  | "usage-evidence-stale"
  | "usage-evidence-duplicate"
  | "evidence-path-shared"
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
    props?: Record<string, unknown[]>;
    usage?: string;
  }>;
}

export interface AuthorConformanceInspection {
  enabled: boolean;
  profilePath: string | null;
  mappings: AuthorEvidenceMapping[];
  failures: AuthorConformanceFailure[];
  claimCount: number;
  evidenceCount: number;
  verification: AuthorVerificationConfig | null;
}

interface RepositoryFile {
  repositoryPath: string;
  realPath: string;
}

interface Claim<TMapping extends AuthorEvidenceMapping> {
  key: string;
  label: string;
  mappingLabel: string;
  matches: (mapping: TMapping) => boolean;
  details: Record<string, unknown>;
}

interface EvidenceOwner {
  path: string;
  claims: Set<string>;
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

function stylesApiClaims(
  catalog: AuthorConformanceCatalog,
  failures: AuthorConformanceFailure[],
): Claim<StylesApiEvidenceMapping>[] {
  const claims: Claim<StylesApiEvidenceMapping>[] = [];
  for (const item of catalog.items) {
    if (!Object.hasOwn(item, "stylesApi")) continue;
    const components = Object.keys(item.stylesApi ?? {});
    if (components.length === 0) {
      failures.push({
        code: "styles-api-claim-empty",
        message: `${catalog.namespace}/${item.name} declares stylesApi without a component claim`,
        details: { item: item.name },
      });
    }
    for (const component of components) {
      claims.push({
        key: JSON.stringify([item.name, component]),
        label: `${catalog.namespace}/${item.name}#stylesApi.${component}`,
        mappingLabel: `${item.name}#${component}`,
        matches: (mapping) => mapping.item === item.name && mapping.component === component,
        details: { item: item.name, component },
      });
    }
  }
  return claims;
}

function propsClaims(
  catalog: AuthorConformanceCatalog,
  failures: AuthorConformanceFailure[],
): Claim<PropsEvidenceMapping>[] {
  const claims: Claim<PropsEvidenceMapping>[] = [];
  for (const item of catalog.items) {
    if (!Object.hasOwn(item, "props")) continue;
    const exports = Object.keys(item.props ?? {});
    if (exports.length === 0) {
      failures.push({
        code: "props-claim-empty",
        message: `${catalog.namespace}/${item.name} declares props without an export claim`,
        details: { item: item.name },
      });
    }
    for (const exportName of exports) {
      claims.push({
        key: JSON.stringify([item.name, exportName]),
        label: `${catalog.namespace}/${item.name}#props.${exportName}`,
        mappingLabel: `${item.name}#${exportName}`,
        matches: (mapping) => mapping.item === item.name && mapping.export === exportName,
        details: { item: item.name, export: exportName },
      });
    }
  }
  return claims;
}

function usageClaims(catalog: AuthorConformanceCatalog): Claim<UsageEvidenceMapping>[] {
  return catalog.items
    .filter((item) => Object.hasOwn(item, "usage"))
    .map((item) => ({
      key: JSON.stringify([item.name]),
      label: `${catalog.namespace}/${item.name}#usage`,
      mappingLabel: item.name,
      matches: (mapping: UsageEvidenceMapping) => mapping.item === item.name,
      details: { item: item.name },
    }));
}

function inspectMappings<TMapping extends AuthorEvidenceMapping>(
  category: "styles-api" | "props" | "usage",
  mappings: TMapping[],
  claims: Claim<TMapping>[],
  repositoryRoot: string,
  failures: AuthorConformanceFailure[],
  evidenceOwners: Map<string, EvidenceOwner>,
): void {
  const mappingsByClaim = new Map<string, TMapping[]>();
  const currentClaims = new Map(claims.map((claim) => [claim.key, claim]));

  for (const mapping of mappings) {
    const claim = claims.find((candidate) => candidate.matches(mapping));
    const key = claim?.key ?? JSON.stringify(mapping);
    const owners = mappingsByClaim.get(key) ?? [];
    owners.push(mapping);
    mappingsByClaim.set(key, owners);

    if (claim === undefined || !currentClaims.has(key)) {
      failures.push({
        code: `${category}-evidence-stale`,
        message: `${category} mapping ${JSON.stringify(mapping)} does not identify a current catalog claim`,
        details: { mapping },
      });
    }

    const evidenceFile = inspectRepositoryFile(
      repositoryRoot,
      mapping.evidence,
      "evidence",
      failures,
    );
    if (evidenceFile !== null) {
      const owner = evidenceOwners.get(evidenceFile.realPath) ?? {
        path: evidenceFile.repositoryPath,
        claims: new Set<string>(),
      };
      owner.claims.add(claim?.label ?? `${category}:${JSON.stringify(mapping)}`);
      evidenceOwners.set(evidenceFile.realPath, owner);
    }
  }

  for (const claim of claims) {
    const owners = mappingsByClaim.get(claim.key) ?? [];
    if (owners.length === 0) {
      failures.push({
        code: `${category}-evidence-missing`,
        message: `${claim.label} has no evidence mapping`,
        details: claim.details,
      });
    } else if (owners.length > 1) {
      failures.push({
        code: `${category}-evidence-duplicate`,
        message: `${claim.label} has ${owners.length} evidence mappings; expected exactly one`,
        details: { ...claim.details, count: owners.length },
      });
    }
  }
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
      verification: null,
    };
  }

  const repositoryRoot = dirname(resolve(catalogPath));
  const failures: AuthorConformanceFailure[] = [];
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
      claimCount: 0,
      evidenceCount: 0,
      verification: null,
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
      claimCount: 0,
      evidenceCount: 0,
      verification: null,
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
      claimCount: 0,
      evidenceCount: 0,
      verification: null,
    };
  }

  const authorProfile = profile as AuthorProfile;
  const mappings = [
    ...(authorProfile.stylesApi ?? []),
    ...(authorProfile.props ?? []),
    ...(authorProfile.usage ?? []),
  ];
  const evidenceOwners = new Map<string, EvidenceOwner>();
  let claimCount = 0;

  if (authorProfile.stylesApi) {
    const claims = stylesApiClaims(catalog, failures);
    claimCount += claims.length;
    inspectMappings(
      "styles-api",
      authorProfile.stylesApi,
      claims,
      repositoryRoot,
      failures,
      evidenceOwners,
    );
  }
  if (authorProfile.props) {
    const claims = propsClaims(catalog, failures);
    claimCount += claims.length;
    inspectMappings("props", authorProfile.props, claims, repositoryRoot, failures, evidenceOwners);
  }
  if (authorProfile.usage) {
    const claims = usageClaims(catalog);
    claimCount += claims.length;
    inspectMappings("usage", authorProfile.usage, claims, repositoryRoot, failures, evidenceOwners);
  }

  for (const owner of evidenceOwners.values()) {
    if (owner.claims.size <= 1) continue;
    const claims = [...owner.claims].sort();
    failures.push({
      code: "evidence-path-shared",
      message: `evidence ${JSON.stringify(owner.path)} is reused by ${claims.join(", ")}`,
      details: { path: owner.path, claims },
    });
  }

  return {
    enabled: true,
    profilePath: catalog.authorProfile,
    mappings,
    failures,
    claimCount,
    evidenceCount: evidenceOwners.size,
    verification: authorProfile.verification ?? null,
  };
}
