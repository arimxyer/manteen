/**
 * `${VAR}` expansion — the last step before a request goes out, and nowhere else.
 *
 * PURE: the environment arrives as a parameter. Nothing in this module reads
 * `process.env`, which is what lets a test drive expansion without mutating the
 * process and what keeps the redacted/expanded pair honest.
 *
 * The redacted form is not a separate rendering of the expanded one — it is the
 * template itself, untouched. That is why `manteen config` can print a registry
 * whose `Authorization` header is `Bearer ${REGISTRY_TOKEN}` and be structurally
 * incapable of printing the token: nothing ever expanded it.
 */

/**
 * Only the `${NAME}` form, and only a POSIX-shaped name.
 *
 * Deliberately narrow. `${VAR:-default}`, `$VAR` and `%VAR%` are left alone
 * rather than half-understood — a URL template is far more likely to contain a
 * literal `$` than a shell-flavoured default we would then get subtly wrong.
 */
const REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export interface Expansion {
  value: string;
  /** Names referenced but not set, in first-appearance order, deduped. A missing
   *  variable leaves its `${VAR}` in place: the failure surfaces as a
   *  `missing-env` diagnostic naming it, never as a request to a URL with a
   *  hole in it. */
  missing: string[];
}

/** Every variable a template references, in first-appearance order, deduped. */
export function envReferences(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(REFERENCE)) {
    const name = match[1];
    if (name !== undefined) seen.add(name);
  }
  return [...seen];
}

export function expandEnv(template: string, env: Record<string, string | undefined>): Expansion {
  const missing = new Set<string>();

  const value = template.replace(REFERENCE, (literal, name: string) => {
    const resolved = env[name];
    if (resolved === undefined) {
      missing.add(name);
      return literal;
    }
    return resolved;
  });

  return { value, missing: [...missing] };
}

/** `expandEnv` over a header or query-parameter map. Values only — a variable
 *  reference in a header NAME is left literal, because a header whose name came
 *  from the environment is not a thing any registry needs. */
export function expandEnvAll(
  templates: Record<string, string>,
  env: Record<string, string | undefined>,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing = new Set<string>();

  for (const [name, template] of Object.entries(templates)) {
    const expanded = expandEnv(template, env);
    values[name] = expanded.value;
    for (const variable of expanded.missing) missing.add(variable);
  }

  return { values, missing: [...missing] };
}
