/**
 * Read `manteen.json`, prove it, and hand back everything downstream needs.
 *
 * IMPURE — one of the four modules allowed to be (§1). Every filesystem touch of
 * the config stage lives here: the config file, the schema document, the
 * tsconfig, and the directory probes that choose among a `paths` key's
 * substitutions. `env.ts`, `validate.ts`, `registries.ts` and `aliases.ts` stay
 * pure because this module hands them what they need.
 *
 * Two things it does NOT do:
 *
 *  - It does not expand `${VAR}`. Expansion is lazy, so `@private` with an unset
 *    `REGISTRY_TOKEN` loads fine and the failure appears as a `missing-env`
 *    diagnostic at the moment a request would go out.
 *  - It does not walk upward looking for a config. `<cwd>/manteen.json` or
 *    nothing: a tool that writes into your source tree should not find its
 *    instructions three directories above where you ran it.
 *
 * `components.json` is `existsSync`-probed and never read. manteen does not wrap
 * shadcn and its aliases are not shadcn's.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createPathsMatcher, parseTsconfig, type TsConfigResult } from "get-tsconfig";

import {
  ALIAS_WIRE_TYPE,
  aliasProbe,
  createAliasResolver,
  isInsideRoot,
  matchesPathsPattern,
  unbackedAliases,
} from "./aliases";
import { normalizeRegistry } from "./registries";
import {
  ALIAS_KEYS,
  type AliasBacking,
  type AliasKey,
  type ConfigError,
  type ConfigLoadResult,
  type LoadedConfig,
  type MantineConfig,
  type Registry,
} from "./types";
import { checkSemantics, createConfigValidator, pointer, type ConfigValidator } from "./validate";

export const CONFIG_FILENAME = "manteen.json";

/**
 * Removed by phase 5, which is when it stops being true.
 *
 * A named constant rather than an inline string so that removal is one edit and
 * cannot leave a stale copy behind in a second message.
 */
const NO_INIT_YET = "There is no `manteen init` yet; write the file by hand for now.";

/** Printed when the config is missing. Kept as a value so it is provably valid JSON. */
const MINIMAL_CONFIG: MantineConfig = {
  $schema: "./node_modules/manteen/schema/manteen.schema.json",
  registries: { "@house": "https://example.com/r/{name}.json" },
  aliases: {
    components: "@/components",
    ui: "@/components/ui",
    hooks: "@/hooks",
    lib: "@/lib",
  },
  theme: "src/lib/theme.ts",
};

/**
 * Schema path, resolved against the bundle directory.
 *
 * `import.meta.dirname`, never the Bun-only shorthand that drops the `name` —
 * that one is `undefined` under Node, which is what runs the published package,
 * and this exact line is the one that shipped as a bug once already.
 * (`scripts/guard-runtime-apis.mjs` scans comments too, which is why the wrong
 * spelling is described here rather than written out.)
 *
 * The `..` is correct only because dist is FLAT: `dist/index.mjs` and
 * `dist/cli.mjs` sit one level below the package root, so `../schema` is the
 * package's `schema/`.
 */
const SCHEMA_PATH = resolve(import.meta.dirname, "../schema/manteen.schema.json");

let validator: ConfigValidator | undefined;

function configValidator(): ConfigValidator {
  validator ??= createConfigValidator(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object);
  return validator;
}

function fail(errors: ConfigError[]): ConfigLoadResult {
  return { ok: false, errors };
}

/** A problem with the file as a whole. `pointer: ""` is what makes it render unframed. */
function whole(message: string, hint: string): ConfigError {
  return { pointer: "", message, hint };
}

/**
 * Environment for `${VAR}` expansion, with `.env` files folded in.
 *
 * IMPURE and deliberately separate from `loadConfig`: the returned map holds
 * secrets, and `LoadedConfig` gets printed by `manteen config` and embedded in
 * diagnostics. `plan/index.ts` calls this and passes the result to
 * `ResolvePorts.env`; nothing stores it.
 *
 * Precedence is `process.env` > `.env.local` > `.env`.
 *
 * Probed against Node 26: `process.loadEnvFile` does NOT overwrite a key already
 * present in `process.env`, so FIRST LOAD WINS and `.env.local` has to be loaded
 * first. The `preexisting` snapshot then re-asserts the `process.env` half of the
 * precedence from our side, so the rule holds even on a Node whose overwrite
 * behaviour differs from the one probed.
 *
 * The `existsSync` is a guard on the FILE, never on the API. §5a raised
 * `engines.node` past 20.12 specifically so `process.loadEnvFile` could be called
 * unguarded, and wrapping it in a try/catch reintroduces exactly the silent
 * failure that decision removed — Bun does not implement it (verified, 1.3.14),
 * so a swallowed TypeError would make every `.env` in the `bun test` tier
 * disappear without a word. Absence is the common case and is handled; anything
 * else — an unreadable file, a runtime without the API — throws.
 *
 * Downstream must read the returned map and not `process.env`, which this call
 * has mutated.
 */
export function loadEnv(root: string): Record<string, string | undefined> {
  const preexisting = { ...process.env };

  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (existsSync(path)) process.loadEnvFile(path);
  }

  return { ...process.env, ...preexisting };
}

export function loadConfig(cwd: string = process.cwd()): ConfigLoadResult {
  const root = resolve(cwd);
  const configPath = resolve(root, CONFIG_FILENAME);

  if (!existsSync(configPath)) return fail([missingConfig(root)]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    return fail([
      whole(
        `${configPath} is not valid JSON.`,
        `${error instanceof Error ? error.message : String(error)}\n\nmanteen.json is plain JSON — no comments, no trailing commas.`,
      ),
    ]);
  }

  const schemaErrors = configValidator()(parsed);
  if (schemaErrors) return fail(schemaErrors);

  const raw = parsed as MantineConfig;

  const semanticErrors = checkSemantics(raw);
  if (semanticErrors.length > 0) return fail(semanticErrors);

  // No `basename()`: `"tsconfig": "tsconfig.app.json"` names a FILE, and a
  // project with several tsconfigs is exactly the case where guessing which one
  // holds the `paths` produces a wrong answer quietly.
  const tsconfigPath = resolve(root, raw.tsconfig ?? "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return fail([
      {
        pointer: pointer("tsconfig"),
        message: `${tsconfigPath} does not exist`,
        hint:
          raw.tsconfig === undefined
            ? "manteen looks for ./tsconfig.json next to manteen.json. Set `tsconfig` if yours is elsewhere or named differently."
            : "`tsconfig` names the file, not its directory, and is resolved against manteen.json.",
      },
    ]);
  }

  let tsconfig: TsConfigResult;
  let matcherIsUsable: boolean;
  try {
    tsconfig = { path: tsconfigPath, config: parseTsconfig(tsconfigPath) };
    // Built here and thrown away purely to surface its throws — at most one `*`
    // per key, and no non-relative substitution when `baseUrl` is unset — as a
    // config error rather than an exception three phases later. After this,
    // `matchesPathsPattern` only ever sees keys already proven parseable.
    matcherIsUsable = createPathsMatcher(tsconfig) !== null;
  } catch (error) {
    return fail([
      {
        pointer: pointer("tsconfig"),
        // "used", not "read": `createPathsMatcher` throws here too, for a key
        // with two `*`s or a non-relative substitution without `baseUrl`, and
        // neither of those is a read failure.
        message: `${tsconfigPath} could not be used`,
        hint: error instanceof Error ? error.message : String(error),
      },
    ]);
  }

  const paths = tsconfig.config.compilerOptions?.paths ?? {};

  if (!matcherIsUsable) {
    return fail([
      {
        pointer: pointer("tsconfig"),
        message: `${tsconfigPath} declares neither \`paths\` nor \`baseUrl\``,
        hint:
          "Every alias has to be backed by a `paths` key. manteen writes files verbatim, so the\n" +
          "import specifiers inside them have to resolve in your project — add, for example:\n" +
          '  "paths": { "@/*": ["./src/*"] }',
      },
    ]);
  }

  const unbacked = unbackedAliases(raw.aliases, paths);
  if (unbacked.length > 0) {
    return fail(unbacked.map((key) => unbackedAlias(key, raw.aliases[key], tsconfigPath, paths)));
  }

  if (raw.theme !== undefined) {
    const themeError = outsideRoot("theme", raw.theme, root);
    if (themeError) return fail([themeError]);
  }

  const target = createAliasResolver(tsconfig, raw.aliases, root, existsSync);

  const registries = new Map<string, Registry>();
  for (const [namespace, source] of Object.entries(raw.registries)) {
    registries.set(namespace, normalizeRegistry(namespace, source));
  }

  const aliasBacking = {} as Record<AliasKey, AliasBacking>;
  for (const key of ALIAS_KEYS) {
    const placed = target(
      { path: "example.tsx", type: ALIAS_WIRE_TYPE[key] },
      { id: `<${key}>`, namespace: null },
    );
    aliasBacking[key] = {
      // Non-null by construction: `unbackedAliases` just proved every alias has
      // a matching key, using this same call.
      key: matchesPathsPattern(aliasProbe(raw.aliases[key]), paths) ?? "",
      sample: "destination" in placed ? placed.destination : "",
    };
  }

  const config: LoadedConfig = {
    configPath,
    root,
    raw,
    registries,
    aliases: raw.aliases,
    aliasBacking,
    themeDestination: raw.theme === undefined ? null : resolve(root, raw.theme),
    tsconfigPath,
    tsconfig,
    resolutions: new Map(Object.entries(raw.resolutions ?? {})),
    target,
  };

  return { ok: true, config };
}

function outsideRoot(field: string, value: string, root: string): ConfigError | null {
  const resolved = resolve(root, value);
  if (isInsideRoot(resolved, root)) return null;

  return {
    pointer: pointer(field),
    message: `"${value}" resolves to ${resolved}, which is outside ${root}`,
    hint: "manteen only writes inside the directory holding manteen.json.",
  };
}

function unbackedAlias(
  key: AliasKey,
  alias: string,
  tsconfigPath: string,
  paths: Record<string, string[]>,
): ConfigError {
  const declared = Object.keys(paths);

  return {
    pointer: pointer("aliases", key),
    message: `no \`paths\` key in ${tsconfigPath} backs "${alias}"`,
    hint:
      (declared.length === 0
        ? `${tsconfigPath} declares no \`paths\` keys.`
        : `${tsconfigPath} declares:\n${declared.map((entry) => `  "${entry}"`).join("\n")}`) +
      `\n\nAdd a key matching "${alias}/*", or point aliases.${key} at a prefix one of these already covers.` +
      "\nAn alias is an import prefix, not a directory: files ship verbatim, so their imports have to resolve.",
  };
}

function missingConfig(root: string): ConfigError {
  const lines = [
    `manteen reads its configuration from ${CONFIG_FILENAME} in the directory you run it in.`,
    "Create one there:",
    "",
    JSON.stringify(MINIMAL_CONFIG, null, 2),
    "",
    "Each alias must be backed by a `paths` key in your tsconfig — manteen writes files",
    "verbatim, so the import specifiers inside them have to resolve in your project.",
    "",
    NO_INIT_YET,
  ];

  // Probed, never read. Its presence means the project uses shadcn, and saying
  // so beats letting the user assume manteen picked its aliases up from there.
  if (existsSync(resolve(root, "components.json"))) {
    lines.push(
      "Found components.json here — manteen does not read it; its aliases are shadcn's, not manteen's.",
    );
  }

  return whole(`No ${CONFIG_FILENAME} in ${root}.`, lines.join("\n"));
}
