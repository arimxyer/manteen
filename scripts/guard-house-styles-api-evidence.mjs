#!/usr/bin/env node
/**
 * Bind every @house `stylesApi` item/component claim to one explicit evidence
 * file, and reject mappings that do not point back to a current claim.
 *
 * This is deliberately an ownership guard, not a test parser. It proves that
 * the catalog claim and a unique, ordinary, repository-contained evidence file
 * are linked in both directions. The normal test runner remains responsible for
 * executing that file, and only the author-owned assertions establish runtime
 * behavior.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isAbsolute as isAbsolutePosix, normalize as normalizePosix } from "node:path/posix";
import { pathToFileURL } from "node:url";

const DEFAULT_REPO_ROOT = resolve(import.meta.dirname, "..");
const CATALOG_PATH = "manteen.registry.json";
const EVIDENCE_MAP_PATH = "house-styles-api-evidence.json";
const MAP_ENTRY_KEYS = ["component", "evidence", "item"];

function claimKey(item, component) {
  return JSON.stringify([item, component]);
}

function claimLabel(item, component) {
  return `@house/${item}#${component}`;
}

function readJson(repoRoot, repositoryPath, failures) {
  try {
    return JSON.parse(readFileSync(resolve(repoRoot, repositoryPath), "utf8"));
  } catch (error) {
    failures.push(`${repositoryPath}: not readable JSON (${String(error)})`);
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inspectCatalog(catalog, failures) {
  const items = new Map();
  const claims = new Map();

  if (!isRecord(catalog) || !Array.isArray(catalog.items)) {
    failures.push(`${CATALOG_PATH}: expected an object with an items array`);
    return { items, claims };
  }

  for (const [index, item] of catalog.items.entries()) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) {
      failures.push(`${CATALOG_PATH}: items[${index}] must have a non-empty string name`);
      continue;
    }

    if (items.has(item.name)) {
      failures.push(`${CATALOG_PATH}: duplicate item name ${JSON.stringify(item.name)}`);
      continue;
    }

    const hasStylesApi = Object.hasOwn(item, "stylesApi");
    const components = new Set();
    items.set(item.name, { components, hasStylesApi });

    if (!hasStylesApi) continue;
    if (!isRecord(item.stylesApi)) {
      failures.push(
        `${CATALOG_PATH}: @house/${item.name} stylesApi must be an object before evidence can be bound`,
      );
      continue;
    }

    const componentNames = Object.keys(item.stylesApi);
    if (componentNames.length === 0) {
      failures.push(
        `${CATALOG_PATH}: @house/${item.name} stylesApi has no component claim to bind to evidence`,
      );
      continue;
    }

    for (const component of componentNames) {
      components.add(component);
      const key = claimKey(item.name, component);
      claims.set(key, { item: item.name, component });
    }
  }

  return { items, claims };
}

function repositoryEvidencePath(repoRoot, evidence, failures) {
  if (typeof evidence !== "string" || evidence.length === 0) {
    failures.push(`${EVIDENCE_MAP_PATH}: evidence must be a non-empty repository-relative path`);
    return null;
  }

  const normalized = normalizePosix(evidence);
  const hasWindowsRoot = /^[A-Za-z]:/.test(evidence) || evidence.startsWith("\\\\");
  if (
    evidence.includes("\\") ||
    isAbsolutePosix(evidence) ||
    hasWindowsRoot ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== evidence
  ) {
    failures.push(
      `${EVIDENCE_MAP_PATH}: evidence ${JSON.stringify(evidence)} must use canonical repository-relative POSIX syntax`,
    );
    return null;
  }

  const fullPath = resolve(repoRoot, ...evidence.split("/"));
  const lexicalRelative = relative(repoRoot, fullPath);
  if (
    lexicalRelative === "" ||
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(lexicalRelative)
  ) {
    failures.push(
      `${EVIDENCE_MAP_PATH}: evidence ${JSON.stringify(evidence)} escapes the repository`,
    );
    return null;
  }

  let fileStatus;
  try {
    fileStatus = lstatSync(fullPath);
  } catch {
    failures.push(`${EVIDENCE_MAP_PATH}: evidence file ${JSON.stringify(evidence)} is missing`);
    return null;
  }

  if (!fileStatus.isFile()) {
    failures.push(
      `${EVIDENCE_MAP_PATH}: evidence ${JSON.stringify(evidence)} is not an ordinary file`,
    );
    return null;
  }

  const realRepoRoot = realpathSync(repoRoot);
  const realEvidence = realpathSync(fullPath);
  const realRelative = relative(realRepoRoot, realEvidence);
  if (
    realRelative === "" ||
    realRelative === ".." ||
    realRelative.startsWith(`..${sep}`) ||
    isAbsolute(realRelative)
  ) {
    failures.push(
      `${EVIDENCE_MAP_PATH}: evidence ${JSON.stringify(evidence)} resolves outside the repository`,
    );
    return null;
  }

  return { normalized, realPath: realEvidence };
}

function inspectEvidenceMap(repoRoot, evidenceMap, failures) {
  const mappings = [];

  if (!Array.isArray(evidenceMap)) {
    failures.push(`${EVIDENCE_MAP_PATH}: expected an array of evidence mappings`);
    return mappings;
  }

  for (const [index, entry] of evidenceMap.entries()) {
    if (!isRecord(entry)) {
      failures.push(`${EVIDENCE_MAP_PATH}: entry ${index} must be an object`);
      continue;
    }

    const keys = Object.keys(entry).sort();
    if (JSON.stringify(keys) !== JSON.stringify(MAP_ENTRY_KEYS)) {
      failures.push(
        `${EVIDENCE_MAP_PATH}: entry ${index} must contain exactly item, component, and evidence`,
      );
      continue;
    }

    if (typeof entry.item !== "string" || entry.item.length === 0) {
      failures.push(`${EVIDENCE_MAP_PATH}: entry ${index} item must be a non-empty string`);
      continue;
    }
    if (typeof entry.component !== "string" || entry.component.length === 0) {
      failures.push(`${EVIDENCE_MAP_PATH}: entry ${index} component must be a non-empty string`);
      continue;
    }

    const repositoryPath = repositoryEvidencePath(repoRoot, entry.evidence, failures);
    mappings.push({
      item: entry.item,
      component: entry.component,
      evidence: entry.evidence,
      repositoryPath,
    });
  }

  return mappings;
}

export function inspectHouseStylesApiEvidence(repoRoot = DEFAULT_REPO_ROOT) {
  const failures = [];
  const catalog = readJson(repoRoot, CATALOG_PATH, failures);
  const evidenceMap = readJson(repoRoot, EVIDENCE_MAP_PATH, failures);
  if (catalog === null || evidenceMap === null) {
    return { failures, claimCount: 0, evidenceCount: 0 };
  }

  const { items, claims } = inspectCatalog(catalog, failures);
  const mappings = inspectEvidenceMap(repoRoot, evidenceMap, failures);
  const mappingsByClaim = new Map();
  const claimsByEvidence = new Map();

  for (const mapping of mappings) {
    const key = claimKey(mapping.item, mapping.component);
    const claimMappings = mappingsByClaim.get(key) ?? [];
    claimMappings.push(mapping);
    mappingsByClaim.set(key, claimMappings);

    const item = items.get(mapping.item);
    if (item === undefined) {
      failures.push(
        `${EVIDENCE_MAP_PATH}: ${claimLabel(mapping.item, mapping.component)} targets an item absent from ${CATALOG_PATH}`,
      );
    } else if (!item.hasStylesApi) {
      failures.push(
        `${EVIDENCE_MAP_PATH}: ${claimLabel(mapping.item, mapping.component)} targets an item without stylesApi`,
      );
    } else if (!item.components.has(mapping.component)) {
      failures.push(
        `${EVIDENCE_MAP_PATH}: ${claimLabel(mapping.item, mapping.component)} is not declared by the item's stylesApi`,
      );
    }

    if (mapping.repositoryPath !== null) {
      const evidenceKey = mapping.repositoryPath.realPath;
      const evidenceOwner = claimsByEvidence.get(evidenceKey) ?? {
        path: mapping.repositoryPath.normalized,
        claims: new Map(),
      };
      evidenceOwner.claims.set(key, claimLabel(mapping.item, mapping.component));
      claimsByEvidence.set(evidenceKey, evidenceOwner);
    }
  }

  for (const [key, claim] of claims) {
    const claimMappings = mappingsByClaim.get(key) ?? [];
    if (claimMappings.length === 0) {
      failures.push(
        `${CATALOG_PATH}: stylesApi claim ${claimLabel(claim.item, claim.component)} has no evidence mapping`,
      );
    } else if (claimMappings.length > 1) {
      failures.push(
        `${EVIDENCE_MAP_PATH}: stylesApi claim ${claimLabel(claim.item, claim.component)} has ${claimMappings.length} mappings; expected exactly one`,
      );
    }
  }

  for (const evidenceOwner of claimsByEvidence.values()) {
    if (evidenceOwner.claims.size <= 1) continue;
    const labels = [...evidenceOwner.claims.values()].sort().join(", ");
    failures.push(
      `${EVIDENCE_MAP_PATH}: evidence ${JSON.stringify(evidenceOwner.path)} is reused by ${labels}`,
    );
  }

  return {
    failures,
    claimCount: claims.size,
    evidenceCount: claimsByEvidence.size,
  };
}

function main() {
  const result = inspectHouseStylesApiEvidence();
  if (result.failures.length > 0) {
    console.error(
      `guard-house-styles-api-evidence: ${result.failures.length} ownership problem(s).\n`,
    );
    for (const failure of result.failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  console.log(
    `guard-house-styles-api-evidence: clean — ${result.claimCount} stylesApi claim(s) own ${result.evidenceCount} unique repository-contained evidence file(s); test semantics and results are not inspected.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
