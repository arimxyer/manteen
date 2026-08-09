/**
 * Compile the Mantine authoring format into the interchange wire format.
 *
 * The authoring catalog (`manteen.registry.json`, our schema and vocabulary) is
 * validated, then compiled to items conforming to the vendored interchange
 * schema. Mantine-only concepts the wire format has no field for — version
 * gate, provider requirement, theme fragment, Styles API selectors — ride along
 * under `meta.mantine`, an open object. Clients that understand it act on it;
 * clients that do not ignore it and still install the files correctly.
 *
 * The wire vocabulary appears in exactly two places in this repo: ITEM_TYPE and
 * FILE_TYPE below.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import Ajv, { type ValidateFunction } from "ajv";

const ajv = () => new Ajv({ strict: false, allErrors: true });

/**
 * Package root, so bundled schemas resolve wherever this is installed.
 *
 * `import.meta.dirname` rather than Bun's `import.meta.dir`: the latter is
 * `undefined` under Node, which is what runs this once it is published.
 */
const PKG_ROOT = resolve(import.meta.dirname, "..");

export type Kind = "component" | "block" | "hook" | "lib" | "theme" | "file";
export type FileRole = "component" | "hook" | "lib" | "style" | "file";

/** One author-documented prop. Carried verbatim — the kit never infers props from source. */
export interface PropDoc {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description?: string;
}

export interface MantineItem {
  name: string;
  kind: Kind;
  title?: string;
  description?: string;
  mantine?: string;
  provider?: boolean;
  npm?: string[];
  npmDev?: string[];
  uses?: string[];
  /** Package-level stylesheet imports. Compiled through the interchange
   * `css` field's deliberately narrow import-only subset (D26). */
  css?: string[];
  files: { path: string; as: FileRole; target?: string }[];
  themeFragment?: string;
  stylesApi?: Record<string, string[]>;
  /** Author-documented prop surface, keyed by exported component or hook name. */
  props?: Record<string, PropDoc[]>;
  /** Path to a copy-ready usage example. Inlined like themeFragment, never installed. */
  usage?: string;
  docs?: string;
}

export interface MantineRegistry {
  name: string;
  namespace: string;
  homepage?: string;
  items: MantineItem[];
}

export type WireItem = Record<string, unknown>;

export interface CompileResult {
  source: MantineRegistry;
  items: WireItem[];
  index: Record<string, unknown>;
  failures: { item: string; messages: string[] }[];
  /** Absolute catalog path. Output safety uses it to refuse the catalog directory
   * and its ancestors without changing the long-standing compile/write call shape. */
  catalogPath?: string;
}

/** Mantine vocabulary -> wire vocabulary. */
export const ITEM_TYPE: Record<Kind, string> = {
  component: "registry:ui",
  block: "registry:block",
  hook: "registry:hook",
  lib: "registry:lib",
  theme: "registry:lib",
  file: "registry:file",
};

export const FILE_TYPE: Record<FileRole, string> = {
  component: "registry:ui",
  hook: "registry:hook",
  lib: "registry:lib",
  style: "registry:file",
  file: "registry:file",
};

function loadSchema(relativePath: string): Record<string, unknown> {
  const schema = JSON.parse(readFileSync(join(PKG_ROOT, relativePath), "utf8"));
  // Drop the dialect declaration and let ajv use its own draft-07 meta-schema.
  // The vendored copy declares the https:// id, which ajv does not register, and
  // reaching into ajv's internals to alias it breaks once installed as a dep.
  delete schema.$schema;
  return schema;
}

function messagesFrom(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

/** Validates a catalog against our own authoring schema. */
export function validateCatalog(value: unknown): string[] | null {
  const validate = ajv().compile(loadSchema("schema/manteen.registry.schema.json"));
  return validate(value) ? null : messagesFrom(validate);
}

/** Validates a compiled item against the vendored interchange schema. */
export function createWireValidator(): (value: unknown) => string[] | null {
  const validate = ajv().compile(loadSchema("schema/wire/registry-item.schema.json"));
  return (value) => (validate(value) ? null : messagesFrom(validate));
}

export function toWireItem(item: MantineItem, namespace: string, root: string): WireItem {
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const meta: Record<string, unknown> = {};

  if (item.mantine) meta.requires = item.mantine;
  if (item.provider) meta.provider = "MantineProvider";
  if (item.stylesApi) meta.stylesApi = item.stylesApi;
  if (item.props) meta.props = item.props;
  if (item.usage) {
    // Same shape and reasoning as themeFragment below: inlined so a documentation
    // client can render it, and kept out of `files` so no client installs it.
    meta.usage = { path: item.usage, content: read(item.usage) };
  }
  if (item.themeFragment) {
    // Inlined rather than listed in `files`: a client that understands it merges
    // it into the project theme, and one that does not must not drop a stray
    // theme file into the project.
    meta.themeFragment = { path: item.themeFragment, content: read(item.themeFragment) };
  }

  const wire: WireItem = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: item.name,
    type: ITEM_TYPE[item.kind],
  };

  if (item.title) wire.title = item.title;
  if (item.description) wire.description = item.description;
  if (item.npm?.length) wire.dependencies = item.npm;
  if (item.npmDev?.length) wire.devDependencies = item.npmDev;
  if (item.docs) wire.docs = item.docs;
  if (item.css?.length) {
    wire.css = Object.fromEntries(item.css.map((source) => [`@import "${source}"`, {}]));
  }

  if (item.uses?.length) {
    // Bare names are local to this registry. Qualifying them here keeps authors
    // from hardcoding the namespace into every item — and stops a bare name
    // from resolving against the default public registry instead of this one.
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

export function buildIndex(source: MantineRegistry): Record<string, unknown> {
  return {
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
}

/**
 * Read and compile a catalog. Paths inside it resolve against the catalog's own
 * directory, so one toolchain can build any number of registries from anywhere.
 */
export function compileRegistry(catalogPath: string): CompileResult {
  const source = JSON.parse(readFileSync(catalogPath, "utf8")) as MantineRegistry;

  const catalogErrors = validateCatalog(source);
  if (catalogErrors) {
    throw new Error(`${catalogPath} is not a valid catalog:\n  ${catalogErrors.join("\n  ")}`);
  }

  const root = dirname(resolve(catalogPath));
  const validateWire = createWireValidator();
  const items: WireItem[] = [];
  const failures: { item: string; messages: string[] }[] = [];

  for (const item of source.items) {
    const wire = toWireItem(item, source.namespace, root);
    const messages = validateWire(wire);
    if (messages) failures.push({ item: item.name, messages });
    else items.push(wire);
  }

  return { source, items, index: buildIndex(source), failures, catalogPath: resolve(catalogPath) };
}

export {
  planRegistryWrite,
  type RegistryOutputDiagnostic,
  RegistryOutputError,
  type RegistryOutputMarker,
  type RegistryWriteOptions,
  type RegistryWriteOutcome,
  type RegistryWritePlan,
  recoverRegistryWrite,
  writeRegistry,
} from "./registry-output";
