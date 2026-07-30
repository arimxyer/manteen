/** Deterministic composition and ownership checks for package-level styles. */
import { createHash } from "node:crypto";

import { INIT_STYLES_SOURCE } from "../init/styles";
import { fromReceiptPath } from "../receipt/path";
import { diag } from "./diagnostics";
import type {
  Diagnostic,
  PlannedStyleSource,
  PlannedStyles,
  ReceiptStyles,
  ResolvedItem,
} from "./types";

export interface StyleBase {
  text: string;
  sha256: string;
}

export interface FoldStylesInput {
  root: string;
  destination: string | null;
  prior: ReceiptStyles | null;
  items: readonly ResolvedItem[];
  base: StyleBase | null;
}

export interface FoldStylesResult {
  styles: PlannedStyles | null;
  diagnostics: Diagnostic[];
}

export function needsStylePlan(
  items: readonly ResolvedItem[],
  prior: ReceiptStyles | null,
): boolean {
  const touched = new Set(items.map((item) => item.id));
  return (
    items.some((item) => item.cssImports.length > 0) ||
    (prior?.sources.some((source) => touched.has(source.itemId)) ?? false)
  );
}

export function foldStyles(input: FoldStylesInput): FoldStylesResult {
  if (!needsStylePlan(input.items, input.prior)) return { styles: null, diagnostics: [] };

  if (input.destination === null) {
    return {
      styles: null,
      diagnostics: [
        diag(
          "global-styles-unconfigured",
          "This install includes package-level styles, but manteen.json has no `styles` destination. Run `manteen init` to create and wire the managed stylesheet.",
        ),
      ],
    };
  }

  if (
    input.prior !== null &&
    fromReceiptPath(input.prior.destination, input.root) !== input.destination
  ) {
    return {
      styles: null,
      diagnostics: [
        diag(
          "global-styles-unconfigured",
          `manteen.json points managed styles at ${input.destination}, but the receipt owns ${input.prior.destination}. Run \`manteen init\` after reconciling the configured path.`,
          { path: input.destination },
        ),
      ],
    };
  }

  if (input.prior === null) {
    const scaffoldHash = sha256(INIT_STYLES_SOURCE);
    if (input.base === null || input.base.sha256 !== scaffoldHash) {
      return {
        styles: null,
        diagnostics: [
          diag(
            "global-styles-uninitialized",
            `${input.destination} is not the unclaimed Manteen scaffold, so it cannot be adopted as a managed stylesheet. Move project CSS to a host stylesheet and run \`manteen init\`.`,
            { path: input.destination },
          ),
        ],
      };
    }
  }

  const diagnostics: Diagnostic[] = [];
  if (input.prior !== null && input.base?.sha256 !== input.prior.sha256) {
    diagnostics.push(
      diag(
        "global-styles-drift",
        `${input.destination} changed after Manteen wrote it. Move overrides to the host stylesheet imported after this file; --force restores the generated imports.`,
        { path: input.destination },
      ),
    );
  }

  const touched = new Set(input.items.map((item) => item.id));
  const sources = new Map<string, PlannedStyleSource>();
  for (const source of input.prior?.sources ?? []) {
    if (!touched.has(source.itemId)) sources.set(source.itemId, source);
  }
  for (const item of input.items) {
    if (item.cssImports.length === 0) continue;
    sources.set(item.id, {
      itemId: item.id,
      dependsOn: [...item.dependsOn],
      imports: [...item.cssImports],
    });
  }

  const ordered = orderSources([...sources.values()]);
  const seenImports = new Set<string>();
  const imports: string[] = [];
  for (const source of ordered) {
    for (const styleImport of source.imports) {
      if (seenImports.has(styleImport)) continue;
      seenImports.add(styleImport);
      imports.push(styleImport);
    }
  }
  const text = `${INIT_STYLES_SOURCE}${imports.map((value) => `@import "${value}";\n`).join("")}`;
  const finalHash = sha256(text);

  return {
    styles: {
      destination: input.destination,
      base: input.base === null ? null : { sha256: input.base.sha256 },
      text,
      sha256: finalHash,
      changed: input.base?.sha256 !== finalHash,
      sources: ordered,
    },
    diagnostics,
  };
}

function orderSources(sources: readonly PlannedStyleSource[]): PlannedStyleSource[] {
  const byId = new Map(sources.map((source) => [source.itemId, source]));
  const remaining = new Set(byId.keys());
  const ordered: PlannedStyleSource[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => (byId.get(id)?.dependsOn ?? []).every((dep) => !remaining.has(dep)))
      .sort(compare);
    // Cycles are legal registry graphs (D25). The resolver already warns; use
    // canonical order for the remaining SCC rather than inventing a second verdict.
    const wave = ready.length > 0 ? ready : [...remaining].sort(compare);
    for (const id of wave) {
      const source = byId.get(id);
      if (source === undefined || !remaining.delete(id)) continue;
      ordered.push({
        itemId: source.itemId,
        dependsOn: [...source.dependsOn],
        imports: [...source.imports],
      });
    }
  }

  return ordered;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
