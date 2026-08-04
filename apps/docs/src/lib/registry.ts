import { readFileSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";

// registry-presentation only imports types from this module, so the cycle is erased at runtime.
import { orderRegistryEntries } from "./registry-presentation";

export interface RegistryIndexItem {
  name: string;
  type: string;
  title?: string;
  description?: string;
  meta?: {
    mantine?: {
      requires?: string;
      provider?: string;
    };
  };
}

export interface RegistryFile {
  path: string;
  type: string;
  target?: string;
  content?: string;
}

/** One author-documented prop, carried verbatim under meta.mantine.props. */
export interface RegistryPropDoc {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description?: string;
}

export interface RegistryItem extends RegistryIndexItem {
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  docs?: string;
  css?: Record<string, unknown>;
  files?: RegistryFile[];
  meta?: {
    mantine?: {
      requires?: string;
      provider?: string;
      stylesApi?: Record<string, string[]>;
      props?: Record<string, RegistryPropDoc[]>;
      usage?: { path: string; content: string };
      themeFragment?: { path: string; content: string };
    };
  };
}

export interface RegistryDocument {
  name: string;
  homepage?: string;
  items: RegistryIndexItem[];
}

export interface RegistryEntry {
  index: RegistryIndexItem;
  detail: RegistryItem;
}

export interface RegistryGroup {
  label: string;
  key: string;
  items: RegistryEntry[];
}

const REGISTRY_ROOT = resolve(process.cwd(), "../../public/r");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readRegistry(): { index: RegistryDocument; entries: RegistryEntry[] } {
  const index = readJson<RegistryDocument>(resolve(REGISTRY_ROOT, "registry.json"));
  if (!Array.isArray(index.items)) {
    throw new Error("Registry index does not contain an items array.");
  }

  const entries = index.items.map((item) => ({
    index: item,
    detail: readRegistryItem(item.name),
  }));
  return { index, entries };
}

export function readRegistryItem(name: string): RegistryItem {
  const path = resolve(REGISTRY_ROOT, `${name}.json`);
  if (path !== REGISTRY_ROOT && !path.startsWith(`${REGISTRY_ROOT}${sep}`)) {
    throw new Error(`Registry item ${JSON.stringify(name)} resolves outside public/r.`);
  }
  return readJson<RegistryItem>(path);
}

export function registryGroups(entries: RegistryEntry[]): RegistryGroup[] {
  const definitions = [
    { key: "components", label: "Components", types: ["registry:ui", "registry:component"] },
    { key: "blocks", label: "Blocks", types: ["registry:block", "registry:page"] },
    { key: "hooks", label: "Hooks", types: ["registry:hook"] },
    {
      key: "themes-files",
      label: "Libraries, themes & files",
      types: ["registry:lib", "registry:theme", "registry:file", "registry:style"],
    },
  ];

  const known = new Set(definitions.flatMap((definition) => definition.types));
  const groups = definitions
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      items: entries.filter((entry) => definition.types.includes(entry.index.type)),
    }))
    .filter((group) => group.items.length > 0);
  const other = entries.filter((entry) => !known.has(entry.index.type));
  if (other.length > 0) groups.push({ key: "other", label: "Other", items: other });
  return groups;
}

// Both registry routes hand StarlightPage the same sidebar; one builder keeps the two
// from drifting, and the curated order keeps it agreeing with the catalog grid.
// Starlight prepends the configured base to internal links itself.
export function registrySidebar(entries: RegistryEntry[]) {
  return [
    {
      label: "Registry",
      items: [{ label: `All items (${entries.length})`, link: "/registry/" }],
    },
    ...registryGroups(entries).map((group) => ({
      label: group.label,
      items: orderRegistryEntries(group.items).map(({ index }) => ({
        label: index.title ?? index.name,
        link: `/registry/${itemPath(index.name)}/`,
      })),
    })),
  ];
}

export function kindLabel(type: string): string {
  return (
    {
      "registry:ui": "component",
      "registry:component": "component",
      "registry:block": "block",
      "registry:page": "page",
      "registry:hook": "hook",
      "registry:lib": "library",
      "registry:theme": "theme",
      "registry:file": "file",
      "registry:style": "style",
    }[type] ?? type.replace(/^registry:/, "")
  );
}

export function itemPath(name: string): string {
  return name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function fileName(file: RegistryFile): string {
  return basename(file.target ?? file.path);
}

// L3 — the installed-files rail and the source meta strip both labeled their entries by stripping
// the `registry:` prefix off the declared type, which produced "ui" and "file" side by side: two
// vocabularies, and "file" carries no information at all. `h42HCk` labels the same three entries
// "component", "style" and "license". Ordered by how specific the evidence is: a license is named
// one, a declared type that says something specific is trusted, and the generic `registry:file`
// falls through to what the extension actually is. "file" is only reached when nothing is known.
export function fileKindLabel(file: RegistryFile): string {
  const path = file.target ?? file.path;
  if (/licen[cs]e/i.test(`${file.path} ${file.target ?? ""}`)) return "license";
  const declared = {
    "registry:ui": "component",
    "registry:component": "component",
    "registry:block": "block",
    "registry:page": "page",
    "registry:hook": "hook",
    "registry:lib": "library",
    "registry:theme": "theme",
    "registry:style": "style",
  }[file.type];
  if (declared) return declared;
  return (
    {
      ".css": "style",
      ".scss": "style",
      ".less": "style",
      ".md": "document",
      ".txt": "document",
      ".json": "data",
      ".ts": "source",
      ".tsx": "source",
      ".js": "source",
      ".jsx": "source",
    }[extname(path).toLowerCase()] ?? "file"
  );
}

export function codeLanguage(path: string): string {
  const extension = extname(path).toLowerCase();
  return (
    {
      ".tsx": "tsx",
      ".ts": "ts",
      ".jsx": "jsx",
      ".js": "js",
      ".mjs": "js",
      ".css": "css",
      ".json": "json",
      ".md": "md",
      ".html": "html",
    }[extension] ?? "text"
  );
}

export function isVisualItem(type: string): boolean {
  return ["registry:ui", "registry:component", "registry:block", "registry:page"].includes(type);
}

export function acceptsProps(type: string): boolean {
  return isVisualItem(type) || type === "registry:hook";
}

export function styleFiles(item: RegistryItem): RegistryFile[] {
  return (item.files ?? []).filter((file) => {
    const path = file.target ?? file.path;
    return file.type === "registry:style" || /\.(?:css|scss|sass|less)$/i.test(path);
  });
}

export function packageStyleImports(item: RegistryItem): string[] {
  return Object.keys(item.css ?? {}).map((rule) => {
    const match = rule.match(/^@import\s+["'](.+?)["']$/);
    return match?.[1] ?? rule;
  });
}
