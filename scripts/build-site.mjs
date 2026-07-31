#!/usr/bin/env node
/**
 * Copy the COMPILED registry into the already-built Starlight artifact.
 *
 * The docs site is the human surface, but `/r/` remains the machine contract.
 * Reading only `public/r/` keeps the catalog page and the deployed JSON on the
 * same compiled source. Run through `apps/docs#build` after `build:registry`.
 */
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const source = join(REPO_ROOT, "public", "r");
const destination = join(REPO_ROOT, "apps", "docs", "dist", "r");
const indexPath = join(source, "registry.json");

if (!existsSync(indexPath)) {
  throw new Error(
    `build-site: ${indexPath} is missing; run "bun run build:registry" before the docs build.`,
  );
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
if (!Array.isArray(index.items)) {
  throw new Error(`build-site: ${indexPath} does not contain an items array.`);
}

for (const item of index.items) {
  if (typeof item?.name !== "string" || !existsSync(join(source, `${item.name}.json`))) {
    throw new Error(`build-site: compiled item ${JSON.stringify(item?.name)} is missing.`);
  }
}

// `destination` is a fixed generated directory, never user input. Removing it
// prevents an item deleted from the catalog from surviving in a later deploy.
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });

process.stdout.write(
  `build-site: copied registry.json and ${index.items.length} items to apps/docs/dist/r.\n`,
);
