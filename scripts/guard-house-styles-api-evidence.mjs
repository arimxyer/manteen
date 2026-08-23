#!/usr/bin/env bun
/**
 * House-only adapter over manteen-kit's generic author-conformance invariant.
 *
 * The kit owns bidirectional claim/evidence validation and filesystem safety.
 * This runner adds only the house repository's Bun discovery contract so the
 * named evidence is included by the normal author-owned test command.
 */
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { inspectAuthorConformance } from "../packages/registry-kit/src/author-conformance.ts";

const DEFAULT_REPO_ROOT = resolve(import.meta.dirname, "..");
const CATALOG_PATH = "manteen.registry.json";
const PACKAGE_PATH = "package.json";
const ROOT_TEST_SCRIPT = "bun run build:kit && bun test";
const BUN_TEST_FILE = /(?:\.test|_test|\.spec|_spec)\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(repoRoot, repositoryPath, failures) {
  try {
    return JSON.parse(readFileSync(resolve(repoRoot, repositoryPath), "utf8"));
  } catch {
    failures.push(`${repositoryPath}: not readable JSON`);
    return null;
  }
}

function inspectBunTestDiscovery(repoRoot, manifest, mappings, failures) {
  if (!isRecord(manifest) || !isRecord(manifest.scripts)) {
    failures.push(`${PACKAGE_PATH}: expected an object with a scripts object`);
  } else if (manifest.scripts.test !== ROOT_TEST_SCRIPT) {
    failures.push(
      `${PACKAGE_PATH}: test script drifted from ${JSON.stringify(ROOT_TEST_SCRIPT)}; review the evidence discovery guard before changing the normal test surface`,
    );
  }

  try {
    lstatSync(resolve(repoRoot, "bunfig.toml"));
    failures.push(
      "bunfig.toml: the house evidence guard only proves Bun's default discovery surface; review it before adding test discovery configuration",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") {
      failures.push(`bunfig.toml: could not verify absence (${String(error)})`);
    }
  }

  for (const mapping of mappings) {
    const segments = mapping.evidence.split("/");
    const file = segments.pop() ?? "";
    const ignoredDirectory = segments.some(
      (segment) => segment === "node_modules" || segment.startsWith("."),
    );
    if (ignoredDirectory || !BUN_TEST_FILE.test(file)) {
      failures.push(
        `${mapping.evidence}: house evidence is outside the repository's plain bun test discovery surface`,
      );
    }
  }
}

export function inspectHouseStylesApiEvidence(repoRoot = DEFAULT_REPO_ROOT) {
  const failures = [];
  const catalog = readJson(repoRoot, CATALOG_PATH, failures);
  const manifest = readJson(repoRoot, PACKAGE_PATH, failures);
  if (catalog === null || manifest === null) {
    return { failures, claimCount: 0, evidenceCount: 0 };
  }

  const generic = inspectAuthorConformance(resolve(repoRoot, CATALOG_PATH), catalog);
  if (!generic.enabled) {
    failures.push(`${CATALOG_PATH}: the house registry must opt into authorProfile`);
  }
  failures.push(...generic.failures.map((failure) => `${failure.code}: ${failure.message}`));
  inspectBunTestDiscovery(repoRoot, manifest, generic.mappings, failures);

  return {
    failures,
    claimCount: generic.claimCount,
    evidenceCount: generic.evidenceCount,
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
    `guard-house-styles-api-evidence: clean — manteen-kit bound ${result.claimCount} stylesApi claim(s) to ${result.evidenceCount} unique repository-contained evidence file(s); the house adapter confirmed root bun test discovery without inspecting test semantics or results.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
