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
