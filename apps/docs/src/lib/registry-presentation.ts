import type { RegistryEntry, RegistryIndexItem } from "./registry";

export const registryFeaturedOrder = [
  "article-card",
  "authentication-form",
  "cards-carousel",
  "dropzone-button",
  "theme",
  "data-table",
  "empty-state",
  "page-header",
  "button-progress",
  "dnd-list",
  "stat-card",
  "stats-grid",
  "table-sort",
  "mantine-ui-license",
] as const;

const rank = new Map<string, number>(registryFeaturedOrder.map((name, index) => [name, index]));

export function orderRegistryEntries(entries: RegistryEntry[]): RegistryEntry[] {
  return [...entries].sort((left, right) => {
    const leftRank = rank.get(left.index.name) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.index.name) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

// The single source of truth for which registry items ship a curated live playground
// adapter, rather than a static gallery mini. Keep this list in sync with the detail
// page's own curated-preview check (RegistryItemDetail.astro) — that file hardcodes
// `index.name === "article-card"` today and should import this helper instead.
const curatedLivePreviewNames = new Set<string>(["article-card"]);

export function hasCuratedLivePreview(name: string): boolean {
  return curatedLivePreviewNames.has(name);
}

// One color per kind, shared by the catalog cards and the detail page's identity row so the
// same kind never wears two colors. Starlight's built-in Badge variants cover the semantic
// kinds; `library`/`file` take a neutral grey via a class (there is no built-in grey variant).
type BadgeVariant = "default" | "note" | "tip" | "caution" | "success" | "danger";

export function registryKindBadge(kind: string): { variant: BadgeVariant; class?: string } {
  switch (kind) {
    case "component":
      return { variant: "default" };
    case "block":
      return { variant: "tip" };
    case "hook":
      return { variant: "note" };
    case "theme":
      return { variant: "caution" };
    default:
      return { variant: "default", class: "registry-badge--neutral" };
  }
}

export function registryPresentationKind(index: RegistryIndexItem): string {
  if (index.name === "theme") return "theme";
  return (
    {
      "registry:ui": "component",
      "registry:component": "component",
      "registry:block": "block",
      "registry:page": "block",
      "registry:hook": "hook",
      "registry:theme": "theme",
      "registry:file": "file",
      "registry:style": "theme",
      "registry:lib": "library",
    }[index.type] ?? index.type.replace(/^registry:/, "")
  );
}
