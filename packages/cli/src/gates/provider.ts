/**
 * Is a Mantine provider mounted anywhere in this project? (D13)
 *
 * The failure this describes is total, not cosmetic: `@mantine/core` throws at
 * render without one — verified, `react-dom/server` on a bare `<Button/>` gives
 * "MantineProvider was not found in component tree". So the check is worth
 * having. It is also, structurally and permanently, a check that can be WRONG in
 * both directions, which is why §1's table gives it `warn` / non-forceable /
 * exit 0 and why nothing here ever contributes to `plan.ok`.
 *
 * ## What fires it
 *
 * An item declares `meta.mantine.provider`, OR any content that item ships
 * imports from `@mantine/core`. The second trigger is not redundancy: only 1 of
 * 5 items in this repo's catalog sets `provider: true` (the `theme` item),
 * because `build-registry.ts:114` emits the field on author opt-in only — yet
 * `stat-card.tsx`, `empty-state.tsx` and `data-table.tsx` all import
 * `@mantine/core` and genuinely need a provider. The content is already on the
 * `ResolvedGraph`, so the broader trigger costs nothing.
 *
 * `themeFragments` is scanned alongside `files` because D5 absorbs a theme
 * item's file OUT of the write list. Reading `graph.files` alone would make
 * `manteen add theme` — the one item that declares the flag — the one item whose
 * content the trigger cannot see.
 *
 * The DECLARED identifier wins when present, so a future `ModalsProvider` needs
 * no change here. Only one identifier is required per item: an item that names
 * `ModalsProvider` is not also asked for `MantineProvider`, because guessing a
 * second requirement from a field the author used to state one is inventing a
 * demand the author did not make.
 *
 * ## What it scans, and what that cannot see
 *
 * A word-boundary text match over the project's source files, plus the content
 * about to be written. Every one of the following was verified against real
 * projects; none of them is filtered out, because each filter is itself a
 * false-negative generator and the check warns either way:
 *
 * - FALSE PASS: a mount in `.storybook/preview.tsx` (D13 names this), in a
 *   testing-library wrapper (`test-utils/render.tsx` in mantinedev's own
 *   vite-template), commented out, or inside a template string of generated
 *   sample code (mantine.dev's `ColorsOutput.tsx` does exactly this).
 * - FALSE PASS: content manteen is about to write that merely mentions the
 *   identifier in a doc comment. Accepted deliberately — see `checkProvider`.
 * - FALSE NEGATIVE: the provider lives in a sibling workspace package
 *   (`packages/ui/src/Wrappers/Mantine.tsx` is a real, common shape). `root` is
 *   `dirname(manteen.json)` and config loading does no upward search, so no scan
 *   rooted here can reach it. This is the second independent reason the check
 *   must never refuse.
 * - FALSE NEGATIVE: a mount behind a wrapper that re-exports under another name
 *   without naming the identifier (mantine-cra-template's `ThemeProvider.tsx`
 *   does name it, so that one is caught; a wrapper that does not, is not).
 *
 * Word boundary, NOT substring. `"HeadlessMantineProvider".includes("MantineProvider")`
 * is `true` and that provider installs no styles — a substring match would
 * silence the warning on precisely the project whose components render
 * unstyled. `\bMantineProvider\b` rejects it, rejects `MantineProviderProps`,
 * and still accepts `import { MantineProvider as Base }`.
 *
 * ## Purity
 *
 * Pure by §1's convention: no `node:fs`, no `fetch`, no env, no clock. The
 * filesystem arrives as the injected `walk` port. The import from `../fs/walk`
 * is TYPE-ONLY and erases at build — the walker's contract is declared where the
 * walker lives, so there is one declaration site rather than two that can drift.
 * Nothing from `fs/` is re-exported, so `gates/index.ts`'s barrel surface stays
 * inside `gates/`.
 */
import type { SourceWalker, WalkReport } from "../fs/walk";
import { diag } from "../plan/diagnostics";
import type { CanonicalId, Diagnostic } from "../plan/types";

/**
 * What `build-registry.ts` emits for `provider: true` — the literal string, and
 * the only value the field takes today. Used as the fallback for the
 * content-import trigger, which names no identifier of its own.
 */
export const DEFAULT_PROVIDER = "MantineProvider";

/**
 * A quoted `@mantine/core` specifier, with or without a subpath.
 *
 * Deliberately loose — it matches inside a comment too. This is the TRIGGER, not
 * the verdict: over-triggering costs one warning on an item that might not need
 * one, while under-triggering costs silence on a component that throws at
 * render.
 */
const MANTINE_CORE_SPECIFIER = /["']@mantine\/core(?:\/[^"']*)?["']/;

/** A JS identifier, so `\b…\b` around it asserts what it looks like it does. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface ProviderGateInput {
  /** Absolute project root = `dirname(manteen.json)`. Handed to the walker. */
  root: string;
  /** From `ResolvedGraph.items`. */
  items: readonly { id: CanonicalId; provider?: string }[];
  /** From `ResolvedGraph.files` — the write list. */
  files: readonly { itemId: CanonicalId; content: string }[];
  /** From `ResolvedGraph.themeFragments`. Absorbed out of `files` by D5, so a
   *  gate that wants to see a theme item's content must read this too. */
  themeFragments: readonly { itemId: CanonicalId; content: string }[];
  /** Injected so this module never touches the filesystem. `plan/index.ts`
   *  passes `createSourceWalker()`; a test passes a three-line array walker. */
  walk: SourceWalker;
}

/**
 * Zero or one `provider-missing` warning per required identifier.
 *
 * The walk runs only when something is unsatisfied after the free pass, and it
 * stops at the first file that satisfies everything still outstanding — so the
 * common case (a mount in `src/App.tsx`, alphabetically early) costs a handful
 * of reads, and the expensive full walk happens exactly when the answer is
 * "missing", which is when it is worth paying for.
 */
export function checkProvider(input: ProviderGateInput): Diagnostic[] {
  const incoming = new Map<CanonicalId, string[]>();
  for (const source of [...input.files, ...input.themeFragments]) {
    const bucket = incoming.get(source.itemId);
    if (bucket === undefined) incoming.set(source.itemId, [source.content]);
    else bucket.push(source.content);
  }

  // identifier -> the items that want it.
  const required = new Map<string, Set<CanonicalId>>();
  for (const item of input.items) {
    const identifier = requiredIdentifier(item, incoming.get(item.id) ?? []);
    if (identifier === null) continue;
    const wanted = required.get(identifier);
    if (wanted === undefined) required.set(identifier, new Set([item.id]));
    else wanted.add(item.id);
  }
  if (required.size === 0) return [];

  // Compiled once, then reused across every file the walk reads. No `g` flag, so
  // there is no `lastIndex` to carry between `.test()` calls.
  const patterns = new Map<string, RegExp>();
  for (const identifier of required.keys()) {
    patterns.set(identifier, new RegExp(`\\b${escapeRegExp(identifier)}\\b`));
  }
  const mentions = (text: string, identifier: string): boolean =>
    patterns.get(identifier)?.test(text) ?? false;

  const missing = new Set(required.keys());

  // Pass A — the content about to be written. Free: it is already in memory.
  //
  // This is a satisfaction source and not merely a trigger, which is a judgement
  // call worth naming. It closes the day-one case: on a greenfield project
  // `manteen add theme` triggers on the declared flag and then scans a tree that
  // has nothing in it yet, so without this the user's very first command warns
  // about a provider the install itself may be delivering. The cost is that an
  // identifier appearing in a shipped doc comment silences the warning — a false
  // pass, in a check whose contract already tolerates false passes (D13's
  // `.storybook/preview.tsx`) and which never blocks.
  const shipped = [...incoming.values()].flat();
  for (const identifier of [...missing]) {
    if (shipped.some((text) => mentions(text, identifier))) missing.delete(identifier);
  }
  if (missing.size === 0) return [];

  // Pass B — the project on disk.
  const report = input.walk(input.root, (file) => {
    for (const identifier of [...missing]) {
      if (mentions(file.text, identifier)) missing.delete(identifier);
    }
    return missing.size === 0;
  });
  if (missing.size === 0) return [];

  return [...missing].sort(compare).map((identifier) => {
    const items = [...(required.get(identifier) ?? [])].sort(compare);
    return diag("provider-missing", message(identifier, items, report), { items });
  });
}

/**
 * Which provider identifier this item needs, or null.
 *
 * A declared value that is not a JS identifier falls back to the default rather
 * than being interpolated into a regex — `\b` around punctuation asserts the
 * opposite of what it reads like, so a malformed declaration would otherwise
 * produce a pattern that matches everything or nothing, silently. The
 * malformed-metadata diagnostic for the field itself belongs to the meta
 * validator, not here.
 */
function requiredIdentifier(
  item: { provider?: string },
  contents: readonly string[],
): string | null {
  if (typeof item.provider === "string" && item.provider !== "") {
    return IDENTIFIER.test(item.provider) ? item.provider : DEFAULT_PROVIDER;
  }
  return contents.some((text) => MANTINE_CORE_SPECIFIER.test(text)) ? DEFAULT_PROVIDER : null;
}

/**
 * Two distinct openings, because they are two distinct claims.
 *
 * "Not found in this project" is a fact about the tree. When the walk hit a
 * limit it is not — it is a fact about the prefix that was read — and stating
 * the second as the first is how an advisory warning becomes a lie. Same code,
 * different sentence; `describeMantineInstall`'s four-messages discipline,
 * applied to the one distinction that exists here.
 */
function message(identifier: string, items: readonly CanonicalId[], report: WalkReport): string {
  const head = report.complete
    ? `No \`${identifier}\` was found in this project's source files.`
    : `manteen read ${report.filesRead} source file(s) without finding \`${identifier}\`, but ` +
      `its scan did not cover the whole project (${incompleteBecause(report)}), so it may well ` +
      "be mounted somewhere it did not look.";

  const lines = [head, "", "Needed by:", ...items.map((id) => `  ${id}`), ""];

  if (identifier === DEFAULT_PROVIDER) {
    lines.push(
      "Mantine components throw at render without it — \"MantineProvider was not found",
      "in component tree\". Mount one at the root of your app:",
      "",
      '  import "@mantine/core/styles.css";',
      '  import { MantineProvider } from "@mantine/core";',
      "",
      "  <MantineProvider>{/* your app */}</MantineProvider>",
      "",
    );
  } else {
    lines.push(
      `Mount \`<${identifier}>\` at the root of your app; the item's registry documents`,
      "which package it comes from.",
      "",
    );
  }

  lines.push(
    "This is a text scan over your source files (node_modules, .git and build output",
    "are skipped), so it warns and never blocks: it cannot see a provider mounted in a",
    "sibling workspace package, and it counts one named in a test or a comment.",
  );

  return lines.join("\n");
}

/**
 * Which bound cut the scan short, in the order a user can act on them.
 *
 * All three are reachable together; naming one is enough for the sentence, and
 * `WalkReport` carries the full counts for `--verbose` to render if it wants
 * them.
 */
function incompleteBecause(report: WalkReport): string {
  if (report.stoppedBy === "file-limit") return "it stopped at its file limit";
  if (report.stoppedBy === "byte-limit") return "it stopped at its total-size limit";
  if (report.prunedDirs > 0) {
    return `${report.prunedDirs} ${plural(report.prunedDirs, "directory", "directories")} below its depth limit`;
  }
  if (report.skippedDirs > 0) {
    return `${report.skippedDirs} ${plural(report.skippedDirs, "directory", "directories")} could not be read`;
  }
  return `${report.skippedFiles} ${plural(report.skippedFiles, "file", "files")} unreadable or too large`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Belt to `IDENTIFIER`'s braces. Nothing that passes that test contains a
 * metacharacter, so this is a no-op today — it is here so that widening the
 * identifier rule later cannot silently turn a registry-authored string into a
 * pattern that matches everything.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** UTF-16 code units, locale-independent. Never `localeCompare`. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
