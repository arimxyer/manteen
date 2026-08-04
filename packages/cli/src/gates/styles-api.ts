/**
 * `meta.mantine.stylesApi` — the one gate whose entire job is to SAY something.
 *
 * It reports the Styles API selectors a registry author declares. A truthful
 * declaration means the component exposes those named parts through its public
 * `classNames={{ … }}` / `styles={{ … }}` interface; an internal CSS-module map
 * alone is not a Styles API. This gate echoes the author assertion so a user does
 * not have to open the source, but cannot prove the implementation honors it.
 * Severity info, exit 0, and it contributes nothing to `plan.ok` — there is no
 * input to this module that can refuse a run.
 *
 * ECHO-ONLY, AND PERMANENTLY SO. The obvious next step — cross-check the
 * declared selectors against what Mantine itself exposes — cannot be built, and
 * not merely "not yet":
 *
 *   - `@mantine/core` DOES carry real runtime selector data: 202 of its 291
 *     capitalized exports have a `Component.classes` CSS-module map
 *     (`Button.classes` = root, inner, label, section, loader, group,
 *     groupSection). So the tempting premise is true.
 *   - But the key spaces are DISJOINT. `stylesApi` is keyed by the REGISTRY's
 *     component names — `StatCard`, which is not an export of `@mantine/core` at
 *     all — while `.classes` is keyed by Mantine's own exports. There is no join,
 *     so the runtime data cannot validate a registry declaration even in
 *     principle.
 *   - `.classes` is not the Styles API selector list anyway: it OVERCOUNTS
 *     `Button` (7 keys vs the 5 in `ButtonStylesNames`) and UNDERCOUNTS `Modal`
 *     (4 vs 8), so it would be the wrong oracle even where the keys did line up.
 *   - And reading it at all would mean importing the CONSUMER's `@mantine/core`
 *     from inside a gate, which §1's parameters-only convention forbids.
 *
 * §7's deferred-work table states the consequence directly: a cross-check would
 * compare against unverified author assertions, so an UNDER-declaring
 * registry would produce warnings about the user's perfectly correct code. That
 * is the failure mode this module must never have — hence reporting only, and
 * hence nothing here consults the user's theme or component call sites.
 *
 * Pure: no fs, no fetch, no env. Ambient state arrives as parameters.
 */
import { diag } from "../plan/diagnostics";
import type { CanonicalId, Diagnostic } from "../plan/types";

/**
 * The slice of an item this gate reads.
 *
 * Structural rather than `ResolvedItem` so a unit test can state the input in
 * two lines, and so `PlanItem` — which carries the same two fields — works
 * unchanged if a reporter ever wants to re-derive these from a `Plan`.
 */
export interface StylesApiSource {
  id: CanonicalId;
  stylesApi?: Record<string, string[]>;
}

/**
 * One info diagnostic per item that declares usable selectors.
 *
 * Per ITEM, not per component: the report should grow with the number of things
 * being installed, not with how finely each one is subdivided. `items: [id]` and
 * no `path` makes `sortDiagnostics` order these by canonical id.
 *
 * The message is self-contained (it names the item), matching `collision.ts` —
 * a reporter must be able to print `message` alone and still be understood.
 */
export function reportStylesApi(items: readonly StylesApiSource[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const item of items) {
    const lines = renderComponents(item.stylesApi);
    if (lines.length === 0) continue;
    diagnostics.push(
      diag("styles-api", [`Styles API selectors for ${item.id}:`, ...lines].join("\n"), {
        items: [item.id],
      }),
    );
  }
  return diagnostics;
}

/**
 * `Component: sel, sel, sel`, one line per component.
 *
 * The two axes are ordered DIFFERENTLY on purpose, which reads as a bug unless
 * it is written down:
 *
 *   - Component names are SORTED. They are a set, and object key order is not
 *     quite insertion order in JS — an integer-like key ("1") is hoisted ahead
 *     of everything else — so sorting is what makes the output a function of the
 *     wire bytes alone.
 *   - Selectors keep DECLARATION order. That order is authored and meaningful
 *     (`root` first, then the inner parts), and phase 3's acceptance criterion
 *     is the literal line `StatCard: root, label, value, trend` — sorting would
 *     render `label, root, trend, value` and break it.
 *
 * Each line starts at column 0 and holds exactly one component, so that
 * criterion holds under both a substring and a line-equality assertion.
 */
function renderComponents(stylesApi: Record<string, string[]> | undefined): string[] {
  if (stylesApi === undefined) return [];

  const lines: string[] = [];
  for (const key of Object.keys(stylesApi).sort(compare)) {
    const component = key.trim();
    // A blank component name is SCHEMA-LEGAL: manteen-item-meta.schema.json
    // constrains `stylesApi` values but puts no `minLength` on its keys. Printing
    // it would yield a line that is just ": root, label".
    if (component === "") continue;

    // `?? []` for `noUncheckedIndexedAccess`, which packages/cli/tsconfig.json
    // sets and the root config does not: an index read is `string[] | undefined`
    // there. The key came from `Object.keys`, so the fallback is unreachable —
    // it is here to keep the stricter of the two configs compiling, not to
    // describe a case.
    const selectors = usableSelectors(stylesApi[key] ?? []);
    // Likewise `[]` and `[""]`: schema-legal, and NOT a validation failure this
    // module owns — `validate-item.ts` already had its say and kept the field, so
    // skipping a component with nothing to print is the whole remedy. Emitting
    // `meta-degraded` from here would turn a display gate into a validator.
    if (selectors.length === 0) continue;

    lines.push(`${component}: ${selectors.join(", ")}`);
  }
  return lines;
}

/**
 * Non-blank selectors, deduped, first occurrence wins.
 *
 * Both filters are load-bearing rather than paranoia: the schema declares
 * `items: { type: "string" }` with no `minLength` and no `uniqueItems`, so
 * `["root", "", "root"]` validates and would render `root, , root` — which reads
 * as a manteen bug rather than as a registry typo.
 */
function usableSelectors(selectors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of selectors) {
    const selector = raw.trim();
    if (selector === "" || seen.has(selector)) continue;
    seen.add(selector);
    out.push(selector);
  }
  return out;
}

/** Default comparator semantics — UTF-16 code units, locale-independent.
 *  `localeCompare` would make the message depend on the machine's LANG.
 *  Module-local: `gates/index.ts` re-exports with `export *`, which SILENTLY
 *  drops a name two gate modules both export. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
