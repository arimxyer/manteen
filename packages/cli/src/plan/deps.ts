/**
 * npm dependency reconciliation across every item in the graph (D10).
 *
 * PURE — no `node:fs`, no `fetch`. It reads nothing about what is *installed*;
 * that comparison belongs to the version gate, which has a `MantineInstall`.
 * This module only reconciles what registry authors *declared*.
 *
 * The order in D10 is not stylistic, and each step exists because the obvious
 * shortcut is wrong:
 *
 *   1. `parseNpmSpec` splits on `lastIndexOf("@")`. Every npm entry in this
 *      repo's catalogs is `"@mantine/core@^9"` — a scoped name with an embedded
 *      `@` — so splitting on the first one yields the name `""`.
 *   2. `validRange()` guards every range before it reaches `subset`/`intersects`.
 *      Probed against semver 7.8.5: `subset("workspace:*", ">=9")` and
 *      `intersects("garbage", ">=9")` THROW `Invalid comparator`, unlike
 *      `satisfies`, which merely returns false. An author typo must degrade to a
 *      warning, never to an exception or an unclearable blocker.
 *   3. `intersects()` false is the refusal. `subset("^9", "^10")` is false and
 *      so is `subset("^10", "^9")` — disjoint, not merely incomparable — so a
 *      plan must not silently pick one by graph depth.
 *   4. `subset()` only ever picks a winner. It can never refuse on its own:
 *      `subset("*", ">=9")` is false while `intersects` is true.
 *   5. The whole reconciliation is wrapped in try/catch anyway, because step 2
 *      guarding every input is an invariant this module asserts rather than one
 *      semver promises.
 *
 * `includePrerelease: true` throughout, for D11's reason: a project that
 * deliberately opted into `9.0.0-alpha.1` should not be told its declarations
 * are disjoint on a semver technicality.
 */
import { intersects, subset, validRange } from "semver";

import { diag } from "./diagnostics";
import type { CanonicalId, Diagnostic, PlannedDependency } from "./types";

const SEMVER_OPTIONS = { includePrerelease: true } as const;

export interface NpmSpec {
  name: string;
  /**
   * The declared range, or `""` when the spec carried no version at all.
   *
   * `""` rather than `"*"` or `"latest"`, and the choice composes three ways:
   * `validRange("") === "*"` so it survives the guard; `subset("^9", "")` is
   * true so any real range wins over it; and it renders as a bare package name
   * at install time. Whoever builds the install command must therefore write
   * `range === "" ? name : \`${name}@${range}\`` — `react@` is a 404.
   */
  range: string;
}

/** One item's declaration of one npm package. */
export interface DependencyClaim {
  itemId: CanonicalId;
  /** Verbatim from the wire item's `dependencies` / `devDependencies`. */
  spec: string;
  dev: boolean;
}

export interface DependencyUnion {
  /** Sorted by package name. */
  dependencies: PlannedDependency[];
  diagnostics: Diagnostic[];
}

/**
 * Split `"@mantine/core@^9"` into name and range.
 *
 * `lastIndexOf("@")` with an `at <= 0` guard: index 0 is a scope marker, not a
 * separator, so `"@mantine/core"` is an unversioned scoped package and not a
 * package named `""` at range `"mantine/core"`.
 */
export function parseNpmSpec(spec: string): NpmSpec {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, range: "" };
  return { name: spec.slice(0, at), range: spec.slice(at + 1) };
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function show(range: string): string {
  return range === "" ? "(unversioned)" : range;
}

/** `"^9 wanted by @base/data-grid, @kit/callout; ^10 wanted by @other/y"`. */
function describe(wantersByRange: ReadonlyMap<string, CanonicalId[]>): string {
  return [...wantersByRange.entries()]
    .map(([range, wanters]) => `${show(range)} wanted by ${wanters.join(", ")}`)
    .join("; ");
}

/**
 * Fold every claim into one `PlannedDependency` per package name.
 *
 * Claims are sorted by `(name, spec, itemId)` before folding. That sort is not
 * cosmetic: when two ranges overlap but neither is a subset of the other, the
 * result is their conjunction, and `"^9.1 <9.5"` versus `"<9.5 ^9.1"` would
 * otherwise alternate with loader completion order and break the byte-identity
 * assertion.
 */
export function unionDependencies(claims: readonly DependencyClaim[]): DependencyUnion {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, { claim: DependencyClaim; parsed: NpmSpec }[]>();

  const parsed = claims
    .map((claim) => ({ claim, parsed: parseNpmSpec(claim.spec) }))
    .sort(
      (a, b) =>
        byCodeUnit(a.parsed.name, b.parsed.name) ||
        byCodeUnit(a.parsed.range, b.parsed.range) ||
        byCodeUnit(a.claim.itemId, b.claim.itemId),
    );

  for (const entry of parsed) {
    const list = byName.get(entry.parsed.name);
    if (list) list.push(entry);
    else byName.set(entry.parsed.name, [entry]);
  }

  const dependencies: PlannedDependency[] = [];

  for (const [name, entries] of [...byName.entries()].sort((a, b) => byCodeUnit(a[0], b[0]))) {
    const wantedBy = [...new Set(entries.map((e) => e.claim.itemId))].sort(byCodeUnit);
    // A package is a devDependency only if EVERY item that wants it says so.
    // One production consumer is enough to make it a production dependency.
    const dev = entries.every((e) => e.claim.dev);

    const wantersByRange = new Map<string, CanonicalId[]>();
    for (const entry of entries) {
      const list = wantersByRange.get(entry.parsed.range);
      if (list) {
        if (!list.includes(entry.claim.itemId)) list.push(entry.claim.itemId);
      } else wantersByRange.set(entry.parsed.range, [entry.claim.itemId]);
    }

    const declared = [...wantersByRange.keys()];
    const valid: string[] = [];
    const malformed: string[] = [];
    for (const range of declared) {
      let ok = false;
      try {
        ok = validRange(range) !== null;
      } catch {
        ok = false;
      }
      if (ok) valid.push(range);
      else malformed.push(range);
    }

    if (malformed.length > 0) {
      diagnostics.push(
        diag(
          "mantine-malformed-metadata",
          `${name}: ${malformed.map(show).join(", ")} ${malformed.length === 1 ? "is not a valid npm range and was" : "are not valid npm ranges and were"} ignored. Declared as ${describe(wantersByRange)}.`,
          { items: wantedBy },
        ),
      );
    }

    dependencies.push({
      name,
      range: reconcile(name, valid, wantersByRange, wantedBy, diagnostics),
      dev,
      wantedBy,
    });
  }

  return { dependencies, diagnostics };
}

/**
 * Reduce the valid declared ranges for one package to the range we will install.
 *
 * On a conflict it returns `valid[0]` — first in the sorted order, so the choice
 * is arbitrary but reproducible. It is deliberately not "the narrower" or "the
 * one closest to the root": D10's point is that disjoint ranges have no correct
 * winner, so the diagnostic is the real output and `plan.ok` is already false
 * unless the user forces past it.
 */
function reconcile(
  name: string,
  valid: readonly string[],
  wantersByRange: ReadonlyMap<string, CanonicalId[]>,
  wantedBy: readonly CanonicalId[],
  diagnostics: Diagnostic[],
): string {
  const first = valid[0];
  if (first === undefined) return "";
  if (valid.length === 1) return first;

  try {
    for (let i = 0; i < valid.length; i += 1) {
      for (let j = i + 1; j < valid.length; j += 1) {
        const a = valid[i] as string;
        const b = valid[j] as string;
        if (intersects(a, b, SEMVER_OPTIONS)) continue;
        diagnostics.push(
          diag(
            "dependency-range-conflict",
            `${name}: ${describe(wantersByRange)}. ${show(a)} and ${show(b)} have no version in common, so no single install can satisfy both.`,
            { items: [...wantedBy] },
          ),
        );
        return first;
      }
    }

    let acc = first;
    for (const range of valid.slice(1)) {
      if (subset(range, acc, SEMVER_OPTIONS)) {
        acc = range;
      } else if (!subset(acc, range, SEMVER_OPTIONS)) {
        // Overlapping but incomparable — `^9.1` and `<9.5`. D10 does not name
        // this case. Keeping `acc` would silently drop the other constraint, so
        // we install their conjunction instead; a space-separated range is npm's
        // own AND syntax and `validRange` proves the result before we adopt it.
        const joined = `${acc} ${range}`;
        if (validRange(joined) !== null) acc = joined;
      }
    }

    diagnostics.push(
      diag(
        "dependency-range-narrowed",
        `${name}: ${describe(wantersByRange)}. Installing ${show(acc)}.`,
        { items: [...wantedBy] },
      ),
    );
    return acc;
  } catch (error) {
    // Unreachable while `validRange` guards every input above, which is exactly
    // why it is caught rather than asserted: D10's whole point is that a bad
    // range must never surface as an exception in the middle of a plan.
    diagnostics.push(
      diag(
        "mantine-malformed-metadata",
        `${name}: could not reconcile ${describe(wantersByRange)} (${error instanceof Error ? error.message : String(error)}). Installing ${show(first)}.`,
        { items: [...wantedBy] },
      ),
    );
    return first;
  }
}
