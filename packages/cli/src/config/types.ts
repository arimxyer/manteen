/**
 * The configuration contract — what `manteen.json` may say, and what the rest of
 * the CLI receives once it has been read and proven.
 *
 * Two rules bind everything here:
 *
 *  - **Nothing on `LoadedConfig` is env-expanded.** `${REGISTRY_TOKEN}` stays
 *    literal in `Registry.url`, `.headers` and `.params`, and expansion happens
 *    at request time in `plan/registry-source.ts`. A `LoadedConfig` gets printed
 *    by `manteen config` and dumped into diagnostics; a field holding an
 *    expanded token is how a secret reaches a terminal. There is deliberately no
 *    `env` field for the same reason — `loadEnv()` returns that map separately.
 *  - **`resolutions` is a `Map`, never the parsed `Record`.** `record["toString"]`
 *    returns a function on any object literal, so a plain-object lookup would
 *    need an `Object.hasOwn` guard at every call site.
 */
import type { TsConfigResult } from "get-tsconfig";

import type { CanonicalId, TargetResolver } from "../plan/types";

/**
 * The four aliases every consumer must configure.
 *
 * All four are required even for a project installing one component, because
 * the item's dependencies are not known until the graph is walked and a missing
 * alias discovered mid-walk is a refusal the user could have been told about at
 * load.
 */
export type AliasKey = "components" | "ui" | "hooks" | "lib";

/** Iteration order for every alias-shaped report, so output is stable. */
export const ALIAS_KEYS: readonly AliasKey[] = ["components", "ui", "hooks", "lib"];

export interface RegistrySourceObject {
  /** Item URL template. Contains the literal `{name}` (D21). */
  url: string;
  index?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/** The string form supports known refs; the object form adds discovery and request metadata. */
export type RegistrySource = string | RegistrySourceObject;

/** `manteen.json` exactly as authored. Kept on `LoadedConfig` so a reporter can
 *  echo what the user wrote rather than a normalized rewrite of it. */
export interface MantineConfig {
  $schema?: string;
  registries: Record<string, RegistrySource>;
  aliases: Record<AliasKey, string>;
  theme?: string;
  /** Manteen-owned composed package stylesheet, relative to this file. */
  styles?: string;
  tsconfig?: string;
  resolutions?: Record<string, string>;
  /** Project-owned package scripts run after a successful update transaction. */
  verification?: {
    /** Authored order is execution order. Names resolve against root package.json. */
    update: string[];
    /** Ceiling for ONE check. Absent means `DEFAULT_VERIFICATION_TIMEOUT_MS`. */
    timeoutMs?: number;
  };
}

/** A registry in normalized form. Every template field is REDACTED — `${VAR}` literal. */
export interface Registry {
  namespace: string;
  url: string;
  index: string | null;
  headers: Record<string, string>;
  params: Record<string, string>;
}

/**
 * Which tsconfig `paths` key backs one alias, and what a file placed under it
 * would look like.
 *
 * `manteen config` prints both: the key is the thing a user has to edit when the
 * alias is unbacked, and the sample is the only way to see that
 * `"ui": "@/components/ui"` and `"@/components/ui/*": ["./src/ui/*"]` compose
 * into a directory they did not expect.
 */
export interface AliasBacking {
  /** The winning `paths` key, verbatim. */
  key: string;
  /** ABSOLUTE. Where a file named `example.tsx` under this alias would land. */
  sample: string;
}

/**
 * One thing wrong with the configuration.
 *
 * `pointer` is a JSON Pointer into `manteen.json` (`/aliases/ui`), or the empty
 * string for a problem with the file as a whole. `hint` is the remedy — a
 * config error exits 2 and the user's next action is always an edit, so an
 * error without one is an error that wastes their time.
 */
export interface ConfigError {
  pointer: string;
  message: string;
  hint?: string;
}

/**
 * Everything downstream needs, with every check that can be made at load time
 * already made.
 *
 * `plan()` takes this and never re-derives any of it.
 */
export interface LoadedConfig {
  /** ABSOLUTE path to `manteen.json`. */
  configPath: string;
  /** ABSOLUTE project root = `dirname(configPath)`. Every destination is proven inside it. */
  root: string;
  /** Verbatim, unexpanded. */
  raw: MantineConfig;
  /** Namespace -> registry. A `Map` for the inherited-key reason in the module docblock. */
  registries: ReadonlyMap<string, Registry>;
  aliases: Record<AliasKey, string>;
  /** Proven at load: every alias has a backing key, or loading failed. */
  aliasBacking: Record<AliasKey, AliasBacking>;
  /** ABSOLUTE resolved `config.theme`, or null when unset. The file need not exist. */
  themeDestination: string | null;
  /** ABSOLUTE resolved `config.styles`, or null for a pre-global-styles project. */
  stylesDestination: string | null;
  /** ABSOLUTE, existence proven. May be a `jsconfig.json` — see `jsconfigOnly`. */
  tsconfigPath: string;
  tsconfig: TsConfigResult;
  /**
   * True when `tsconfigPath` is a `jsconfig.json`, whether manteen found it
   * itself (no `tsconfig.json` next to `manteen.json`, but a `jsconfig.json`
   * is) or the user's `tsconfig` field points at one directly. Its `paths`
   * back aliases exactly like a real tsconfig's do — that part of loading does
   * not care which language the project is in — but `plan()` refuses any item
   * that ships `.ts`/`.tsx` while this is true (§6): manteen writes files
   * verbatim and never transpiles, so a TypeScript file has nothing to resolve
   * its syntax against without a real tsconfig.
   */
  jsconfigOnly: boolean;
  /** Bare item name -> winning canonical id (D9). */
  resolutions: ReadonlyMap<string, CanonicalId>;
  /**
   * The alias resolver, already built against `tsconfig` and `aliases`.
   *
   * Use this instance rather than calling `createAliasResolver` again: the
   * alias-backing check that let loading succeed ran against exactly this
   * matcher and this `exists` injection, and a second resolver built with a
   * different one can disagree about where a file lands.
   */
  target: TargetResolver;
}

export type ConfigLoadResult =
  | { ok: true; config: LoadedConfig }
  | { ok: false; errors: ConfigError[] };
