/**
 * The theme fold — D5, D6, D7.
 *
 * One `createTheme({...})` file in the consumer's project is the destination for
 * every theme contribution in a run, and the three decisions that shape this
 * module are worth stating together because each one is invisible from the
 * others:
 *
 * - **D5** — a planned file whose destination equals the resolved `config.theme`
 *   is REMOVED from the write list and folded instead. `resolve.ts` does that
 *   absorption (resolve.ts:319) and hands the result over as
 *   `ResolvedGraph.themeFragments`; this module never sees the write list. The
 *   failure it prevents: `manteen add theme data-table` writing then overwriting,
 *   silently losing the base theme's `primaryColor` and four component entries —
 *   and the pre-image hash still verifying, because it was taken before the write.
 *
 * - **D6** — fold order is topological, then lexicographic by canonical id, and
 *   when no base exists on disk the FIRST source in that order becomes the base.
 *   `prefer: "base"` is first-write-wins on conflicting leaves
 *   (merge-theme.ts:195-208), so the order is semantically load-bearing, not
 *   cosmetic: two runs in a different order produce different text AND a
 *   different conflict set. **This module must not sort `fragments`.** They
 *   arrive in fold order from `topoSort` (resolve.ts:448), including the
 *   deliberate intra-item ordering of `absorbed-file` before `meta-fragment`
 *   (resolve.ts:338-348) — a whole module makes a better base than an addition
 *   to one. Re-sorting here would silently duplicate and then contradict a
 *   decision `resolve.ts` owns.
 *
 * - **D7** — the ENTIRE merge runs in `plan()`. `mergeThemeSource` is pure
 *   (in-memory ts-morph, `useInMemoryFileSystem: true`) and *throws* on a source
 *   it cannot read as a theme, so merging during `apply()` would put a reachable
 *   throw after component files are already on disk — a direct violation of
 *   "nothing touches disk until every check has passed". Every throw is caught
 *   here and returned as a `theme-base-unmergeable` refusal. `apply()` performs
 *   one temp+rename write of the precomputed `PlannedTheme.text` and merges
 *   nothing.
 *
 * Pure: no fs, no fetch, no env, no clock. The base theme's bytes are read by
 * `plan/index.ts` and arrive as a parameter; `node:crypto`'s `createHash` is
 * deterministic computation over those parameters, not ambient state.
 *
 * ## What the fold does NOT prove
 *
 * D7's guarantee is that the merge cannot throw after files are on disk. It is
 * NOT a guarantee that the folded text compiles, and the difference has one
 * reachable shape worth naming, because nothing downstream will catch it:
 *
 * `mergeObject` copies an incoming initializer's SOURCE TEXT verbatim
 * (merge-theme.ts:164-167), and `syncMantineImports` adds imports only for
 * `components.*` `X.extend(...)` targets. So a fragment written as
 * `createTheme({ primaryColor: brand })` — with `brand` imported from the
 * registry author's own module, or declared as a `const` above the call — folds
 * to a base containing a bare `primaryColor: brand` that resolves to nothing
 * there, with `changed: true`, no import added and zero diagnostics. Verified.
 *
 * Detecting it is deliberately not attempted: distinguishing "this identifier
 * resolves in the merged file" from "it does not" needs a type checker rather
 * than ts-morph node text, there is no code for it in §1's refusal table, and
 * `plan/types.ts` is frozen. A theme fragment must therefore be written with
 * literal values — a constraint on registry authors, stated here because this is
 * the module whose silence would otherwise imply the opposite.
 */
import { createHash } from "node:crypto";

import { mergeThemeSource } from "manteen-kit";

import { toReceiptPath } from "../receipt/path";
import { diag } from "./diagnostics";
import type { CanonicalId, Diagnostic, MergeConflict, PlannedTheme, ThemeFragment } from "./types";

export interface ThemeFoldInput {
  /**
   * ABSOLUTE resolved `config.theme`, or null when `manteen.json` declares no
   * `theme` at all. Null with contributions waiting is a real case and gets a
   * `meta-degraded` warning rather than a silent drop.
   */
  destination: string | null;
  /**
   * The base theme already on disk, or null when `destination` does not exist.
   *
   * `text` is the file decoded as UTF-8. `sha256` must be the hash of the RAW
   * BYTES — i.e. `hashFileBytes(destination)` from `apply/preflight.ts`, the same
   * function that builds `ExistingHashes` — because `apply()`'s preflight
   * re-reads the file and compares against `PlannedTheme.base.sha256` for the
   * TOCTOU check. Hashing the decoded string here instead would make the two
   * sides of that comparison different domains, and the disagreement would only
   * show up on a file with a BOM.
   *
   * Both fields must come from ONE read, not two:
   *
   *   const bytes = readFileSync(destination);            // ENOENT -> null
   *   { text: bytes.toString("utf8"),
   *     sha256: createHash("sha256").update(bytes).digest("hex") }
   *
   * The natural `hashFileBytes(dest)` then `readFileSync(dest, "utf8")` pair
   * lets the file change between the two calls, and `PlannedTheme.base.sha256`
   * would then describe content that is not what was folded — apply's preflight
   * would either false-fail or, worse, pass against the wrong bytes.
   */
  base: { text: string; sha256: string } | null;
  /** Exactly `ResolvedGraph.themeFragments`, in fold order. Never re-sorted (D6). */
  fragments: readonly ThemeFragment[];
  /** Project root. Used ONLY to render root-relative paths in messages — an
   *  absolute tmpdir is unassertable across machines. */
  root: string;
}

export interface ThemeFoldResult {
  /**
   * Null in three distinct situations, all of them correct: no `theme` declared,
   * nothing contributed, and a refused fold. The last one always ships a
   * blocking diagnostic alongside, so `plan.ok` is what distinguishes it.
   */
  theme: PlannedTheme | null;
  /** Push these into `plan()`'s list BEFORE `aggregate()` — it is what decides
   *  `ok`, and anything appended after it is silently dropped. */
  diagnostics: Diagnostic[];
}

/**
 * Fold every contribution into one theme text, or refuse.
 *
 * Sequential and left-to-right: each merge's output is the next merge's base, so
 * `prefer: "base"` means "the project's own value wins, and after that the
 * earlier contributor's value wins". A single `mergeThemeSource(base, all)` call
 * does not exist — the kit merges one fragment at a time — and even if it did,
 * folding pairwise is what makes each conflict attributable to the source that
 * raised it.
 */
export function foldTheme(input: ThemeFoldInput): ThemeFoldResult {
  const { destination, base, fragments, root } = input;
  const diagnostics: Diagnostic[] = [];

  if (destination === null) {
    if (fragments.length > 0) diagnostics.push(noThemeDeclared(fragments));
    return { theme: null, diagnostics };
  }

  if (fragments.length === 0) {
    // Correct, not a gap: nothing was folded, so nothing is owned. The receipt
    // records `theme: null` for exactly this case even when `config.theme` names
    // a file that exists on disk.
    return { theme: null, diagnostics };
  }

  const label = toReceiptPath(destination, root);

  // ---- establish the base ---------------------------------------------------
  // D6: with no base on disk the first source becomes it, verbatim. `text` is
  // then threaded through the loop below as the accumulating base.
  let text: string;
  let pending: readonly ThemeFragment[];

  if (base === null) {
    const [first, ...rest] = fragments;
    // Unreachable — `fragments.length === 0` returned above — but destructuring
    // is what makes that provable to the compiler without a cast.
    if (first === undefined) return { theme: null, diagnostics };

    // The adopted base is the one source that no merge would ever validate when
    // it is also the ONLY source, and writing an unreadable file is precisely
    // what D7 exists to prevent. Probing unconditionally keeps one invariant
    // true for every path out of this function: the text handed to `apply()` has
    // been through the kit's `findThemeObject` at least once.
    if (!canServeAsTheme(first.content)) {
      diagnostics.push(
        unmergeableFragment(
          first,
          `${first.itemId} would become ${label} — no theme file exists there yet — and its theme source cannot be merged: ${first.path}`,
        ),
      );
      return { theme: null, diagnostics };
    }
    text = first.content;
    pending = rest;
  } else {
    text = base.text;
    pending = fragments;
  }

  // ---- fold -----------------------------------------------------------------
  const added: string[] = [];
  const importsAdded: string[] = [];
  const conflicts: MergeConflict[] = [];
  // Parallel to `conflicts` and never exposed: `MergeConflict` is the kit's
  // frozen shape and carries no attribution, but the user needs to know WHICH
  // item offered the value that lost. Widening the kit's type is not an option;
  // remembering the source on this side costs nothing.
  const attributed: { source: ThemeFragment; conflict: MergeConflict }[] = [];

  for (const fragment of pending) {
    let merged: ReturnType<typeof mergeThemeSource>;
    try {
      merged = mergeThemeSource(text, fragment.content, { prefer: "base" });
    } catch (error) {
      // The kit throws from `findThemeObject` for either side, labelled "base"
      // or "incoming". Rather than parse that label out of a message string the
      // kit is free to reword, re-probe the accumulated base: if IT cannot serve
      // as a theme the culprit is the file on disk, otherwise it is the fragment
      // being merged. (The adopted-base case cannot land here — it was probed
      // above — so a "base" verdict always means the real file.)
      diagnostics.push(
        canServeAsTheme(text)
          ? unmergeableFragment(
              fragment,
              `${fragment.itemId} contributes to ${label} and its theme source cannot be merged: ${fragment.path}`,
              detailOf(error),
            )
          : unmergeableBase(label, destination, fragments, detailOf(error)),
      );
      return { theme: null, diagnostics };
    }

    text = merged.text;
    // Concatenated, not deduped: a path added by one source is present for every
    // later source, which finds it and merges into it rather than adding it
    // again, so duplicates cannot arise.
    added.push(...merged.added);
    importsAdded.push(...merged.importsAdded);
    for (const conflict of merged.conflicts) {
      conflicts.push(conflict);
      attributed.push({ source: fragment, conflict });
    }
  }

  if (attributed.length > 0) diagnostics.push(conflictDiagnostic(attributed, label, destination));

  return {
    theme: {
      destination,
      base: base === null ? null : { sha256: base.sha256 },
      text,
      // Of the UTF-8 encoding of the STRING apply will write, matching
      // `PlannedFile.sha256` and `ReceiptTheme.sha256`. `base.sha256` above is
      // the other domain — raw bytes — and the two compare equal only because
      // apply writes with an explicit "utf8" encoding, no BOM and no newline
      // translation.
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
      /**
       * Textual, deliberately — not `MergeResult.changed`.
       *
       * `changed` answers exactly one question: must `apply()` write? A run that
       * merges nothing new still passes through `mergeThemeSource`, which
       * returns the base's own text untouched when it made no mutations, so
       * comparing the final text against the base is both correct and the thing
       * that makes re-running idempotent — the second `manteen add` produces
       * `changed: false` and apply skips phase 4 entirely. Or-ing N per-merge
       * `changed` flags would answer a subtly different question ("did any merge
       * do work?") and would miss the no-base case, where nothing merged at all
       * but a file still has to be created.
       *
       * One known text change the kit makes that no `MergeResult` field reports:
       * `syncMantineImports` appends a bare `import "@mantine/core";` to a base
       * that has no `@mantine/core` import declaration at all — reachable only
       * when a project re-exports `createTheme` through its own module. Textual
       * `changed` catches it (so apply writes the import rather than silently
       * dropping it), and it converges on the next run, because the appended
       * declaration is then found and not added again.
       */
      changed: base === null || text !== base.text,
      added,
      importsAdded,
      conflicts,
      // Every contribution, including the one adopted as the base — provenance
      // is the point, and the receipt accumulates these across runs.
      sources: fragments.map((fragment) => ({
        itemId: fragment.itemId,
        kind: fragment.kind,
        path: fragment.path,
      })),
    },
    diagnostics,
  };
}

// ---- shape probe ------------------------------------------------------------

/**
 * A theme source with no properties, used only to drive the kit's own
 * `findThemeObject` over a candidate base.
 *
 * Merging it is a no-op by construction — there are no incoming properties to
 * iterate, so no mutations, no conflicts and no added imports — which is what
 * makes it usable as a pure validity probe.
 */
const EMPTY_THEME_PROBE =
  'import { createTheme } from "@mantine/core";\nexport const theme = createTheme({});\n';

/**
 * Whether `source` is something the kit can read as a theme.
 *
 * Asks the kit rather than reimplementing its rule: a second parser here would
 * be a second opinion about what `createTheme(...)` means, and the two would
 * drift. The merged TEXT is discarded — this is a question, not a step of the
 * fold — which also disposes of `syncMantineImports`' side effect of appending
 * an empty `@mantine/core` import to a base that has none.
 */
function canServeAsTheme(source: string): boolean {
  try {
    mergeThemeSource(source, EMPTY_THEME_PROBE, { prefer: "base" });
    return true;
  } catch {
    return false;
  }
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---- diagnostics ------------------------------------------------------------

/**
 * The shape every theme source has to have, printed rather than described.
 *
 * Both of the kit's throws — no `createTheme(...)` call at all, and
 * `createTheme(someVariable)` instead of a literal — are answered by the same
 * example, so one block covers both without this module having to tell them
 * apart from a message string.
 */
const REQUIRED_SHAPE = [
  "manteen merges themes structurally, so every theme source must contain a",
  "literal `createTheme({ ... })` call:",
  "",
  '  import { createTheme } from "@mantine/core";',
  "",
  "  export const theme = createTheme({",
  '    primaryColor: "indigo",',
  "  });",
  "",
  "`createTheme(someVariable)` cannot be merged either — the object has to be",
  "written out at the call site.",
];

/** D7's guarantee, said to the user in the one place it is load-bearing. */
const NOTHING_WRITTEN = "The whole merge runs before manteen touches disk, so nothing was written.";

/**
 * The base theme on disk cannot be read as a theme.
 *
 * This is the case §1's refusal table names, and the phase-3 criterion is
 * explicit that the message names the file and the required shape. Error and
 * non-forceable: `--force` would mean "merge into a file I cannot parse", which
 * has no meaning — the only outcomes would be clobbering the user's file or
 * writing something that does not compile.
 *
 * `items` are the contributors rather than the base: they are why the fold ran,
 * and the base file belongs to no item.
 */
function unmergeableBase(
  label: string,
  destination: string,
  fragments: readonly ThemeFragment[],
  detail: string,
): Diagnostic {
  return diag(
    "theme-base-unmergeable",
    [
      `${label} cannot be merged into: ${detail}`,
      "",
      ...REQUIRED_SHAPE,
      "",
      `Contributions waiting on it: ${renderSources(fragments)}.`,
      NOTHING_WRITTEN,
    ].join("\n"),
    // Absolute, matching `PlannedTheme.destination` — a reporter joins on it
    // rather than parsing the root-relative form back out of the prose.
    { items: uniqueIds(fragments), path: destination },
  );
}

/**
 * A CONTRIBUTION cannot be read as a theme — reusing `theme-base-unmergeable`,
 * which is a decision worth being explicit about.
 *
 * `findThemeObject` throws for the incoming side too (it is called with the
 * label "incoming"), and `themeFragment.content` is schema-typed as a bare
 * string with no `minLength` and no pattern, so an empty or garbage fragment
 * passes D20's fail-open validation and arrives here. §1's table has no code for
 * that case and `plan/types.ts` is frozen, so the options were: reuse this code,
 * or drop the fragment as `meta-degraded`.
 *
 * Reuse, because a dropped fragment is a theme silently missing entries that
 * nobody will connect to an install — the same reasoning that made D5 fold
 * rather than overwrite. The message names the item and its source path, so the
 * code's "base" in the name never leaves the user looking at the wrong file.
 */
function unmergeableFragment(
  fragment: ThemeFragment,
  headline: string,
  detail?: string,
): Diagnostic {
  return diag(
    "theme-base-unmergeable",
    [
      detail === undefined ? headline : `${headline}\n${detail}`,
      "",
      ...REQUIRED_SHAPE,
      "",
      NOTHING_WRITTEN,
    ].join("\n"),
    { items: [fragment.itemId] },
  );
}

/**
 * `prefer: "base"` kept the project's value. Warn, never an error: nothing was
 * lost, and the remedy is a hand edit the user may well not want to make.
 *
 * One grouped diagnostic rather than one per conflict, following `collision.ts`:
 * a theme with eight kept leaves is one situation, and eight separate warnings
 * bury the run's other output. The raw `MergeConflict[]` is on `PlannedTheme`
 * for a reporter that wants to render it differently.
 */
function conflictDiagnostic(
  attributed: readonly { source: ThemeFragment; conflict: MergeConflict }[],
  label: string,
  destination: string,
): Diagnostic {
  const lines = [
    `${attributed.length} theme value(s) in ${label} were already set and were kept.`,
    "",
  ];

  // Grouped by source, in fold order — the order in which the values were
  // offered is the order in which they lost, and reordering would hide that.
  let current: ThemeFragment | null = null;
  for (const { source, conflict } of attributed) {
    if (current === null || current.itemId !== source.itemId || current.path !== source.path) {
      if (current !== null) lines.push("");
      lines.push(`  ${source.itemId}  ${source.path}`);
      current = source;
    }
    lines.push(
      `    ${conflict.path}`,
      `      kept     ${conflict.base}`,
      `      offered  ${conflict.incoming}`,
      `      ${conflict.reason}`,
    );
  }

  lines.push(
    "",
    "manteen prefers the theme already in your project, so nothing you wrote was",
    `overwritten. Edit ${label} by hand to take a contributed value instead.`,
  );

  return diag("theme-conflict", lines.join("\n"), {
    items: uniqueIds(attributed.map((entry) => entry.source)),
    // Absolute, matching `PlannedTheme.destination`, so a reporter joins on it
    // rather than parsing it back out of the prose.
    path: destination,
  });
}

/**
 * Contributions with nowhere to go.
 *
 * Wording preserved verbatim from the placeholder this replaced in
 * `plan/index.ts` — it is the user-visible text for a case that predates the
 * fold, and churning it would invalidate assertions for no gain.
 */
function noThemeDeclared(fragments: readonly ThemeFragment[]): Diagnostic {
  return diag(
    "meta-degraded",
    `${fragments.length} theme contribution(s) were dropped because manteen.json declares no \`theme\`: ${fragments
      .map((f) => `${f.itemId} (${f.path})`)
      .join(
        ", ",
      )}. Set \`theme\` to the file that exports your createTheme(...) call to fold them in.`,
    { items: uniqueIds(fragments) },
  );
}

// ---- rendering helpers ------------------------------------------------------

function renderSources(fragments: readonly ThemeFragment[]): string {
  return fragments.map((fragment) => `${fragment.itemId} (${fragment.path})`).join(", ");
}

/** Fold order preserved: these ids are printed, and re-sorting them would make
 *  the message disagree with `PlannedTheme.sources`. */
function uniqueIds(fragments: readonly { itemId: CanonicalId }[]): CanonicalId[] {
  return [...new Set(fragments.map((fragment) => fragment.itemId))];
}
