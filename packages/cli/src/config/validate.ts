/**
 * Schema validation, the cross-field checks JSON Schema cannot express, and the
 * rendering of both.
 *
 * PURE — including the ajv part. The schema document arrives as a parameter
 * rather than being read from `schema/` here, which is what keeps the one
 * filesystem touch of the whole config stage inside `load.ts`.
 *
 * D24: our schema declares the `http://` draft-07 dialect id, which ajv 8
 * registers. Only the kit's VENDORED WIRE schema uses the `https://` form and
 * therefore needs `delete schema.$schema`. Copying that workaround into a schema
 * we author ourselves would ship a comment that misdescribes its own file.
 */
import Ajv from "ajv";

import { bareNameOf } from "./registries";
import { ALIAS_KEYS, type ConfigError, type MantineConfig } from "./types";

export type ConfigValidator = (document: unknown) => ConfigError[] | null;

/** JSON Pointer escaping, for keys that may contain `/` (a multi-segment item name). */
export function pointer(...segments: string[]): string {
  return segments.map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

/** `/aliases/components` -> `aliases.components`, which is how the field is spoken about. */
function display(jsonPointer: string): string {
  if (jsonPointer === "") return "manteen.json";
  return jsonPointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
}

export function createConfigValidator(schema: object): ConfigValidator {
  // Same options as the kit's: `allErrors` so two bad aliases are reported
  // together rather than one per run, `strict: false` because the vocabulary
  // includes `description` on keywords ajv's strict mode complains about.
  const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);

  return (document) => {
    if (validate(document)) return null;

    const errors = validate.errors ?? [];
    // A failing `oneOf` reports the wrapper AND every branch. The branch errors
    // say what is actually wrong ("must match pattern \\{name\\}"); the wrapper
    // says only "must match exactly one schema in oneOf", which helps nobody.
    const paths = new Set(errors.filter((error) => error.keyword !== "oneOf").map((e) => e.instancePath));

    return errors
      .filter((error) => error.keyword !== "oneOf" || !paths.has(error.instancePath))
      .map((error) => {
        const params = error.params as Record<string, unknown>;
        const at =
          error.keyword === "propertyNames" && typeof params.propertyName === "string"
            ? pointer(...error.instancePath.split("/").slice(1), params.propertyName)
            : error.instancePath;

        return {
          pointer: at,
          message: error.message ?? "is invalid",
          hint: hintFor(error.keyword, params),
        } satisfies ConfigError;
      });
  };
}

function hintFor(keyword: string, params: Record<string, unknown>): string | undefined {
  if (keyword === "pattern" && params.pattern === "\\{name\\}") {
    return "a registry URL is a template for ONE item and must contain the literal {name} — for example https://example.com/r/{name}.json";
  }
  if (keyword === "pattern" && params.pattern === "^@[a-z0-9-]+$") {
    return "a namespace looks like @house: lowercase letters, digits and hyphens";
  }
  if (keyword === "pattern" && params.pattern === "^@[a-z0-9-]+/.+$") {
    return "the winner must be fully qualified, as in @house/empty-state";
  }
  if (keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
    return `manteen does not understand \`${params.additionalProperty}\``;
  }
  return undefined;
}

/**
 * The checks the schema cannot make.
 *
 * Deliberately short. Alias backing is NOT checked here — that is `load.ts`'s
 * probe against the tsconfig `paths` keys, and D1's own rejected alternative
 * warns that two detectors for one property is worse than one. What is here is
 * only the shapes that can never be a `paths` key match, so the user gets "this
 * is a filesystem path" rather than the more confusing "this alias is unbacked".
 */
export function checkSemantics(config: MantineConfig): ConfigError[] {
  const errors: ConfigError[] = [];

  for (const key of ALIAS_KEYS) {
    const value = config.aliases[key];
    const problem = aliasShapeProblem(value);
    if (problem !== null) {
      errors.push({
        pointer: pointer("aliases", key),
        message: `"${value}" is a filesystem path, not an import prefix`,
        hint:
          `${problem} manteen writes files verbatim, so the import specifiers inside them — ` +
          "`import { EmptyState } from \"@/components/ui/empty-state\"` — have to resolve in your " +
          "project. Use the prefix your tsconfig `paths` declares.",
      });
    }
  }

  for (const [name, winner] of Object.entries(config.resolutions ?? {})) {
    // A resolution authorizes replacing one same-named item with another. The
    // receipt gate's ownership-transfer guard requires the winner's bare name to
    // equal the key, so a mismatched pair can never authorize anything — it is
    // config that silently does nothing.
    const bare = bareNameOf(winner);
    if (bare !== null && bare !== name) {
      errors.push({
        pointer: pointer("resolutions", name),
        message: `"${winner}" is not named "${name}"`,
        hint: `a resolution picks the winner among items that share a name; write \`"${bare}": "${winner}"\`, or point "${name}" at an item actually called "${name}"`,
      });
    }
  }

  return errors;
}

/** Why a value can never be an import prefix, or null when it might be one. */
function aliasShapeProblem(value: string): string | null {
  if (value.startsWith("./") || value.startsWith("../") || value === "." || value === "..") {
    return "A relative path is never an import prefix.";
  }
  if (value.startsWith("/")) return "An absolute path is never an import prefix.";
  if (value.startsWith("~/")) return "`~/` is a shell convention, not a TypeScript one.";
  if (/^[A-Za-z]:/.test(value)) return "A drive letter is never an import prefix.";
  if (value.includes("\\")) return "Import specifiers use `/`, never `\\`.";
  return null;
}

/**
 * Render config errors for stderr. A config failure exits 2 and the user's next
 * action is always an edit, so every line here is either the location or the fix.
 */
export function formatConfigErrors(errors: ConfigError[], configPath: string): string {
  // A problem with the file AS A WHOLE — absent, unparseable — is not a field
  // and gets no field framing. It is also the only error of its run, because
  // nothing downstream of it can be checked.
  const [only] = errors;
  if (errors.length === 1 && only !== undefined && only.pointer === "") {
    return only.hint === undefined ? only.message : `${only.message}\n\n${only.hint}`;
  }

  const lines = [`${configPath} is not usable:`, ""];

  for (const error of errors) {
    lines.push(`  ${display(error.pointer)}: ${error.message}`);
    if (error.hint !== undefined) {
      for (const line of error.hint.split("\n")) lines.push(`      ${line}`);
    }
  }

  return lines.join("\n");
}
