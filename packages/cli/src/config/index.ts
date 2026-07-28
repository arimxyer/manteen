/**
 * The config stage's public surface.
 *
 * `src/index.ts` re-exports from here, and every other stage imports from here
 * rather than reaching into a file — the split between `load.ts` (impure) and
 * the four pure modules is an internal arrangement, and a caller that depends on
 * it makes the arrangement unchangeable.
 *
 * A failed load exits **2**, not 1. `loadConfig` returns a result union rather
 * than throwing so the caller decides that; `formatConfigErrors` renders it.
 */
export {
  ALIAS_PROBE,
  ALIAS_WIRE_TYPE,
  REFUSED_FILE_TYPES,
  TARGET_REQUIRED_FILE_TYPES,
  WIRE_TYPE_ALIAS,
  aliasProbe,
  assertInsideRoot,
  createAliasResolver,
  isInsideRoot,
  matchesPathsPattern,
  unbackedAliases,
} from "./aliases";

export { envReferences, expandEnv, expandEnvAll, type Expansion } from "./env";

export { CONFIG_FILENAME, loadConfig, loadEnv } from "./load";

export {
  NAME_PLACEHOLDER,
  URL_ID_PREFIX,
  bareNameOf,
  buildItemUrl,
  normalizeRegistry,
  splitItemId,
  type ItemUrl,
  type SplitId,
} from "./registries";

export {
  ALIAS_KEYS,
  type AliasBacking,
  type AliasKey,
  type ConfigError,
  type ConfigLoadResult,
  type LoadedConfig,
  type MantineConfig,
  type Registry,
  type RegistrySource,
  type RegistrySourceObject,
} from "./types";

export {
  checkSemantics,
  createConfigValidator,
  formatConfigErrors,
  pointer,
  type ConfigValidator,
} from "./validate";
