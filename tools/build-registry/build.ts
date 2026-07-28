#!/usr/bin/env bun
/**
 * Compile the Mantine authoring format into the interchange wire format.
 *
 * Reads `mantine-registry.json` (our schema, our vocabulary) and emits
 * `public/r/*.json` conforming to the published registry-item schema, so the
 * output is readable by any client that speaks it — including the stock shadcn
 * CLI — while nothing a human authors mentions that vocabulary.
 *
 * Mantine-only concepts that the wire format has no field for (version gate,
 * provider requirement, theme fragment, Styles API selectors) ride along under
 * `meta.mantine`, which is an open object. Clients that understand it act on
 * it; clients that do not ignore it and still install the files correctly.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import Ajv from "ajv";

const ROOT = resolve(import.meta.dir, "../..");
const SOURCE = join(ROOT, "mantine-registry.json");
const OUT_DIR = join(ROOT, "public/r");
const WIRE_SCHEMA = join(ROOT, "schema/wire/registry-item.schema.json");

type Kind = "component" | "block" | "hook" | "lib" | "theme" | "file";
type FileRole = "component" | "hook" | "lib" | "style" | "file";

interface MantineItem {
  name: string;
  kind: Kind;
  title?: string;
  description?: string;
  mantine?: string;
  provider?: boolean;
  npm?: string[];
  npmDev?: string[];
  uses?: string[];
  files: { path: string; as: FileRole; target?: string }[];
  themeFragment?: string;
  stylesApi?: Record<string, string[]>;
  docs?: string;
}

interface MantineRegistry {
  name: string;
  namespace: string;
  homepage?: string;
  items: MantineItem[];
}

/** Mantine vocabulary -> wire vocabulary. The only place these strings exist. */
const ITEM_TYPE: Record<Kind, string> = {
  component: "registry:ui",
  block: "registry:block",
  hook: "registry:hook",
  lib: "registry:lib",
  theme: "registry:lib",
  file: "registry:file",
};

const FILE_TYPE: Record<FileRole, string> = {
  component: "registry:ui",
  hook: "registry:hook",
  lib: "registry:lib",
  style: "registry:file",
  file: "registry:file",
};

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function toWireItem(item: MantineItem, namespace: string) {
  const meta: Record<string, unknown> = {};

  if (item.mantine) meta.requires = item.mantine;
  if (item.provider) meta.provider = "MantineProvider";
  if (item.stylesApi) meta.stylesApi = item.stylesApi;
  if (item.themeFragment) {
    // Inlined rather than listed in `files`: a client that understands it
    // merges it into the project theme, and one that does not must not drop a
    // stray theme file into the project.
    meta.themeFragment = {
      path: item.themeFragment,
      content: read(item.themeFragment),
    };
  }

  const wire: Record<string, unknown> = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: item.name,
    type: ITEM_TYPE[item.kind],
  };

  if (item.title) wire.title = item.title;
  if (item.description) wire.description = item.description;
  if (item.npm?.length) wire.dependencies = item.npm;
  if (item.npmDev?.length) wire.devDependencies = item.npmDev;

  if (item.uses?.length) {
    // Bare names are local to this registry. Qualifying them here is what keeps
    // authors from having to hardcode the namespace into every item — and what
    // stops a bare name from resolving against the default public registry.
    wire.registryDependencies = item.uses.map((used) =>
      used.startsWith("@") ? used : `${namespace}/${used}`,
    );
  }

  wire.files = item.files.map((file) => ({
    path: file.path,
    type: FILE_TYPE[file.as],
    ...(file.target ? { target: file.target } : {}),
    content: read(file.path),
  }));

  if (Object.keys(meta).length > 0) wire.meta = { mantine: meta };

  return wire;
}

const source = JSON.parse(readFileSync(SOURCE, "utf8")) as MantineRegistry;

const ajv = new Ajv({ strict: false, allErrors: true });
// The vendored schema declares draft-07 under its https:// id; ajv registers
// the http:// one, so alias it rather than editing the vendored copy.
const draft07 = JSON.parse(
  readFileSync(join(ROOT, "node_modules/ajv/dist/refs/json-schema-draft-07.json"), "utf8"),
);
delete draft07.$id; // otherwise it re-registers under the http:// id ajv already has
ajv.addMetaSchema(draft07, "https://json-schema.org/draft-07/schema#");
const validate = ajv.compile(JSON.parse(readFileSync(WIRE_SCHEMA, "utf8")));

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;

for (const item of source.items) {
  const wire = toWireItem(item, source.namespace);

  if (!validate(wire)) {
    failed += 1;
    process.stderr.write(`✗ ${item.name} does not conform to the wire schema:\n`);
    for (const error of validate.errors ?? []) {
      process.stderr.write(`    ${error.instancePath || "/"} ${error.message}\n`);
    }
    continue;
  }

  const outPath = join(OUT_DIR, `${item.name}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(wire, null, 2)}\n`);
  process.stdout.write(`  ${item.name} → r/${item.name}.json (${item.kind} → ${wire.type})\n`);
}

// Index, for discovery and `list`.
const index = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: source.name,
  ...(source.homepage ? { homepage: source.homepage } : {}),
  items: source.items.map((item) => ({
    name: item.name,
    type: ITEM_TYPE[item.kind],
    ...(item.title ? { title: item.title } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.mantine || item.provider
      ? {
          meta: {
            mantine: {
              ...(item.mantine ? { requires: item.mantine } : {}),
              ...(item.provider ? { provider: "MantineProvider" } : {}),
            },
          },
        }
      : {}),
  })),
};

writeFileSync(join(OUT_DIR, "registry.json"), `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`  index → r/registry.json (${source.items.length} items)\n`);

if (failed > 0) {
  process.stderr.write(`\n${failed} item(s) failed wire-schema validation.\n`);
  process.exit(1);
}

process.stdout.write(`\nBuilt ${source.items.length} items. Wire-schema conformance verified.\n`);
