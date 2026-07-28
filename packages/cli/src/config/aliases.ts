/**
 * Where a file goes — and, before that, whether an alias can place one at all.
 *
 * PURE: `exists` is injected. This module is the correctness centre of the
 * install path, and the trap it exists to avoid is D1:
 *
 *   `createPathsMatcher` NEVER returns `[]` when `baseUrl` is set.
 *
 * Read the matcher's own source (get-tsconfig 4.14, `createPathsMatcher`) and
 * the last line of the returned closure is `return baseUrl ? [join(baseUrl,
 * specifier)] : []`. So a project with `baseUrl: "."` and an alias of `@/nope`
 * gets back `["<root>/@/nope/empty-state"]` — a real, containment-passing
 * absolute path inside a literal directory named `@`. Files land there, imports
 * do not resolve, and nothing anywhere reports a problem.
 *
 * The only sound test for "this alias is backed" is therefore whether a `paths`
 * KEY pattern-matches the specifier, which is what `matchesPathsPattern` answers.
 * `createPathsMatcher` is used solely to compute the destination once a key is
 * known to match.
 */
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

import { createPathsMatcher, type TsConfigResult } from "get-tsconfig";

import type { DiagnosticCode, TargetResolver } from "../plan/types";
import { ALIAS_KEYS, type AliasKey } from "./types";

/** File-level wire type -> the alias its files are placed under. */
export const WIRE_TYPE_ALIAS: Record<string, AliasKey> = {
  "registry:ui": "ui",
  "registry:hook": "hooks",
  "registry:lib": "lib",
  "registry:component": "components",
  "registry:block": "components",
};

/**
 * The wire type a file placed under each alias has.
 *
 * The reverse of `WIRE_TYPE_ALIAS`, which is many-to-one — `components` takes
 * both `registry:component` and `registry:block`, and this picks the one that
 * names the alias. Exists so a caller wanting "what would land under `ui`?" can
 * ask the real resolver instead of reimplementing its matching.
 */
export const ALIAS_WIRE_TYPE: Record<AliasKey, string> = {
  components: "registry:component",
  ui: "registry:ui",
  hooks: "registry:hook",
  lib: "registry:lib",
};

/**
 * File-level types manteen refuses outright (D22).
 *
 * `registry:font` is absent on purpose: the wire schema's FILE-level enum has 11
 * entries and does not include it (only the ITEM-level enum does), so a font
 * branch here is unreachable and its test would have to bypass validation to
 * construct an input for it.
 */
export const REFUSED_FILE_TYPES: readonly string[] = [
  "registry:style",
  "registry:base",
  "registry:theme",
  "registry:item",
];

/**
 * Types that carry no alias and are placeable only with an explicit `target`.
 *
 * A page or a loose project file has no import-prefix convention to derive a
 * location from — guessing one puts a route in the wrong router.
 */
export const TARGET_REQUIRED_FILE_TYPES: readonly string[] = ["registry:page", "registry:file"];

/**
 * `target` placeholders the interchange format defines, mapped to our aliases.
 *
 * These are the wire format's own spelling (see the `target` description in the
 * vendored item schema) and are independent of the project's import prefix,
 * which is exactly why they route through `aliases` rather than being treated as
 * paths.
 */
const TARGET_PLACEHOLDER: Record<string, AliasKey> = {
  "@components/": "components",
  "@ui/": "ui",
  "@hooks/": "hooks",
  "@lib/": "lib",
};

/**
 * Segment appended to an alias to test whether it is backed.
 *
 * An alias is a PREFIX; a `paths` key like `@/components/ui/*` has prefix
 * `@/components/ui/`, and `"@/components/ui"` does not start with that. Testing
 * the bare alias would report every specific-pattern tsconfig as unbacked. So we
 * probe the shape a real specifier has (D2 resolves per file), and probe and
 * real specifier then live in the same domain: a key with a suffix such as
 * `@/lib/*.css` is unreachable from both, consistently.
 */
export const ALIAS_PROBE = "__manteen_probe__";

/** Matches `createPathsMatcher`'s own early return for a relative specifier. */
const RELATIVE_SPECIFIER = /^\.{1,2}(\/|$)/;

/**
 * The winning tsconfig `paths` key for a specifier, or null when none matches.
 *
 * TypeScript's rule, in TypeScript's order: at most one `*` per key; an exact
 * (starless) key beats every wildcard; among wildcards the longest static prefix
 * wins.
 *
 * Mirrors get-tsconfig's matcher rather than the compiler where the two differ:
 * TS additionally requires `specifier.length >= prefix.length + suffix.length`,
 * which get-tsconfig omits. The divergence is reachable only for a key whose
 * prefix and suffix overlap in the specifier (`@/a*a` against `@/a`), and
 * agreeing with the function that actually computes the destination matters more
 * than agreeing with the compiler — a disagreement here is the D1 bug wearing a
 * different hat.
 *
 * A key with more than one `*` is SKIPPED, not thrown on: `createPathsMatcher`
 * throws on it, `load.ts` runs that constructor first and converts the throw
 * into a config error, and this function is called directly by tests that should
 * not have to construct a valid tsconfig to ask a question about pattern
 * matching.
 */
export function matchesPathsPattern(
  specifier: string,
  paths: Record<string, string[]>,
): string | null {
  if (RELATIVE_SPECIFIER.test(specifier)) return null;

  let bestKey: string | null = null;
  let bestPrefixLength = -1;

  for (const key of Object.keys(paths)) {
    const star = key.indexOf("*");

    if (star === -1) {
      if (key === specifier) return key;
      continue;
    }

    if (key.indexOf("*", star + 1) !== -1) continue;

    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);

    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      prefix.length > bestPrefixLength
    ) {
      bestPrefixLength = prefix.length;
      bestKey = key;
    }
  }

  return bestKey;
}

/** Whether an absolute destination is strictly inside root. */
export function isInsideRoot(destination: string, root: string): boolean {
  const rel = relative(root, destination);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Throwing form, for apply's preflight.
 *
 * The resolver returns a refusal instead of throwing, because a refusal during
 * planning is a diagnostic the user gets to see alongside every other one. By
 * preflight the plan has already been reported and a containment violation means
 * something moved underneath us, so a throw is the correct shape.
 */
export function assertInsideRoot(destination: string, root: string): void {
  if (!isInsideRoot(destination, root)) {
    throw new Error(`${destination} is outside the project root ${root}`);
  }
}

function refuse(code: DiagnosticCode, detail: string): { refused: DiagnosticCode; detail: string } {
  return { refused: code, detail };
}

/**
 * Build the `TargetResolver` port.
 *
 * `exists` chooses among a `paths` key's substitutions the way TypeScript does —
 * it tries them in order and takes the first that resolves. Nothing resolves for
 * a file we are about to create, so we probe each candidate's PARENT DIRECTORY
 * and fall back to the first substitution when none exists. Probing the parent
 * rather than the file itself is what keeps a destination stable between the
 * first run and the second: a file-existence probe would make run 2 pick a
 * different directory than run 1 precisely because run 1 succeeded.
 *
 * Throws when the tsconfig has neither `paths` nor `baseUrl`. `load.ts` refuses
 * that configuration before ever getting here, so reaching it means a caller
 * built a resolver from a tsconfig nobody checked.
 */
export function createAliasResolver(
  tsconfig: TsConfigResult,
  aliases: Record<AliasKey, string>,
  root: string,
  exists: (path: string) => boolean,
): TargetResolver {
  const matcher = createPathsMatcher(tsconfig);
  if (!matcher) {
    throw new Error(
      `${tsconfig.path} declares neither \`paths\` nor \`baseUrl\`, so no alias can be resolved; ` +
        "loadConfig() refuses this before building a resolver",
    );
  }

  const paths = tsconfig.config.compilerOptions?.paths ?? {};

  /**
   * D2: match on the extensionless specifier, then re-append the extension.
   *
   * `under` is what goes after the alias. For a plain file that is its BASENAME,
   * not `files[].path` — the source path is the author's repo layout
   * (`registry/ui/empty-state.tsx`) and reproducing it under the alias would put
   * a `registry/` directory inside the consumer's `src/components/ui/`. For an
   * explicit `target` it is the remainder verbatim, because there the author was
   * describing the consumer's tree rather than their own.
   */
  const placeUnderAlias = (
    alias: AliasKey,
    under: string,
  ): { destination: string } | { refused: DiagnosticCode; detail: string } => {
    const extension = extname(under);
    const stem = under.slice(0, under.length - extension.length);
    const specifier = `${aliases[alias]}/${stem}`;

    const key = matchesPathsPattern(specifier, paths);
    if (key === null) {
      // Unreachable when load.ts proved the alias backed — the probe and this
      // specifier share a prefix and a (normally empty) suffix. Refusing is
      // still the only safe answer: falling through to `matcher()` here is
      // exactly the D1 trap, since with `baseUrl` set it would hand back a
      // containment-passing path inside a literal `@` directory.
      return refuse(
        "target-refused-type",
        `no \`${tsconfig.path}\` paths key backs "${specifier}"`,
      );
    }

    const candidates = matcher(specifier);
    const chosen = candidates.find((candidate) => exists(dirname(candidate))) ?? candidates[0];
    if (chosen === undefined) {
      return refuse(
        "target-refused-type",
        `paths key "${key}" has no substitution for "${specifier}"`,
      );
    }

    return { destination: resolve(chosen + extension) };
  };

  return (file, item) => {
    if (REFUSED_FILE_TYPES.includes(file.type)) {
      return refuse(
        "target-refused-type",
        `${item.id} ships ${file.path} as ${file.type}, which manteen does not place`,
      );
    }

    if (file.target !== undefined && file.target !== "") {
      const placeholder = Object.keys(TARGET_PLACEHOLDER).find((prefix) =>
        file.target?.startsWith(prefix),
      );

      if (placeholder !== undefined) {
        const alias = TARGET_PLACEHOLDER[placeholder];
        if (alias === undefined) return refuse("target-refused-type", `unknown target placeholder ${placeholder}`);
        return contain(placeUnderAlias(alias, file.target.slice(placeholder.length)), root, item.id);
      }

      // `~/` is the interchange format's spelling of "the project root".
      const target = file.target.startsWith("~/") ? file.target.slice(2) : file.target;
      return contain({ destination: resolve(root, target) }, root, item.id);
    }

    const alias = WIRE_TYPE_ALIAS[file.type];
    if (alias === undefined) {
      const needsTarget = TARGET_REQUIRED_FILE_TYPES.includes(file.type);
      return refuse(
        "target-refused-type",
        needsTarget
          ? `${item.id} ships ${file.path} as ${file.type}, which manteen places only when the item declares an explicit \`target\``
          : `${item.id} ships ${file.path} as ${file.type}, which manteen has no alias for`,
      );
    }

    return contain(placeUnderAlias(alias, basename(file.path)), root, item.id);
  };
}

function contain(
  result: { destination: string } | { refused: DiagnosticCode; detail: string },
  root: string,
  itemId: string,
): { destination: string } | { refused: DiagnosticCode; detail: string } {
  if ("refused" in result) return result;
  if (isInsideRoot(result.destination, root)) return result;

  return refuse(
    "target-escapes-root",
    `${itemId} resolves to ${result.destination}, which is outside ${root}`,
  );
}

/**
 * The specifier used to test whether one alias is backed.
 *
 * Exported so `manteen config` and the load-time check ask the identical
 * question — two spellings of "is this alias backed" is how one of them ends up
 * lenient.
 */
export function aliasProbe(alias: string): string {
  return `${alias}/${ALIAS_PROBE}`;
}

/** Aliases with no backing `paths` key, in `ALIAS_KEYS` order. */
export function unbackedAliases(
  aliases: Record<AliasKey, string>,
  paths: Record<string, string[]>,
): AliasKey[] {
  return ALIAS_KEYS.filter((key) => matchesPathsPattern(aliasProbe(aliases[key]), paths) === null);
}
