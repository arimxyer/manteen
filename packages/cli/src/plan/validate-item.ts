/**
 * Wire-item validation: the kit's interchange validator, plus our own schema for
 * `meta.mantine`.
 *
 * Two validators are needed because the interchange schema declares `meta` as
 * `additionalProperties: true`. `{ requires: 12345 }` therefore passes the kit's
 * validator untouched — and `requires` is the safety mechanism that keeps a
 * v9-only component off a v8 install. Every Mantine-specific behaviour reads
 * `meta.mantine`, so it gets a schema of its own (D20).
 *
 * The two halves fail in opposite directions, on purpose:
 *
 *   requires                      fails CLOSED — a blocking `meta-invalid-requires`
 *   provider/stylesApi/themeFragment  fail OPEN — `meta-degraded`, field dropped
 *   unknown keys                  ignored, so a newer kit does not break an older CLI
 *
 * NOT a pure module: it reads its schema off disk, exactly as the kit's
 * `createWireValidator()` does. It is deliberately absent from the pure set the
 * `node:fs` lint rule guards (`resolve.ts`, `graph.ts`, `deps.ts`,
 * `theme-fold.ts`, `gates/*`) — but the read happens inside the factory, so
 * importing this module still does no I/O.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv, { type ValidateFunction } from "ajv";
import { createWireValidator } from "manteen-kit";

import { parseNpmSpec } from "./deps";
import { diag } from "./diagnostics";
import type { CanonicalId, Diagnostic } from "./types";

const META_SCHEMA_FILE = "manteen-item-meta.schema.json";

/**
 * FLAT dist (entries one level below the package root) is what makes
 * `../schema` correct in the published layout. This module's SOURCE sits two
 * levels down, at `src/plan/`, so the same expression resolves to `src/schema`
 * when `bun test` runs the sources directly. Both are tried, dist first — the
 * shipped path must not depend on a fallback.
 *
 * Always `import.meta.dirname`, never Bun's shorter spelling of it — that one is
 * `undefined` under Node, which is what runs this once published, and this is
 * the one line in the file that would pass under `bun test` either way.
 * `scripts/guard-runtime-apis.mjs` is the thing that keeps it honest, which is
 * also why this paragraph does not quote the offending identifier: the guard
 * matches source text, including text inside comments.
 */
const SCHEMA_CANDIDATES = ["../schema", "../../schema"] as const;

/** D22: refused at the ITEM level only. The file-level `type` enum omits
 *  `registry:font` entirely, so a font branch in the target resolver would be
 *  unreachable. A font item carries no installable files — only `font` metadata
 *  a Next.js pipeline consumes — so there is nothing for manteen to write. */
const REFUSED_ITEM_TYPES = new Set(["registry:font"]);

const META_KEYS = ["requires", "provider", "stylesApi", "themeFragment"] as const;
type MetaKey = (typeof META_KEYS)[number];

/** A wire file that has cleared validation: `content` is present and non-empty. */
export interface WireFile {
  path: string;
  type: string;
  target?: string;
  content: string;
}

export interface MantineMeta {
  /** Verbatim from the wire. Whether it is a *valid* semver range is a separate
   *  question answered downstream (`semver.validRange` -> a
   *  `mantine-malformed-metadata` warning), because an author's typo must not
   *  become an unclearable blocker. */
  requires?: string;
  provider?: string;
  stylesApi?: Record<string, string[]>;
  themeFragment?: { path: string; content: string };
}

export interface ValidatedItem {
  name: string;
  wireType: string;
  files: WireFile[];
  dependencies: string[];
  devDependencies: string[];
  registryDependencies: string[];
  cssImports: string[];
  meta: MantineMeta;
}

export interface ValidateContext {
  id: CanonicalId;
  /** The name the reference asked for, or `null` for a `url:` reference, which
   *  names no item and therefore cannot mismatch one. */
  expectedName: string | null;
  /** `${VAR}` left literal. The only URL that may appear in a message. */
  redactedUrl: string;
}

/**
 * `ok` answers one question and it is narrower than "were there errors":
 * *can a usable item view be built from this document at all?*
 *
 * Only two things say no — the document is not a registry item (wire schema),
 * and it is a `registry:font`, which carries no installable files. Everything
 * else rides the `ok: true` arm WITH its error diagnostics attached, including
 * the two blocking ones this module owns:
 *
 *   meta-invalid-requires   the offending key is dropped and the item is intact;
 *                           phase 2's done-when asserts "no `requires` on the
 *                           PlanItem", which presupposes there is one
 *   file-no-content         the file is dropped from `files`; the rest installs
 *
 * Nothing is written either way — both codes are non-forceable errors, so the
 * gate aggregator sets `plan.ok` to false and `apply()` returns before phase 2.
 * Refusing to return the item would only stop the walk from reaching that item's
 * dependencies, and reporting one problem per run is the behaviour the resolver
 * is built to avoid.
 */
export type ItemValidation =
  | { ok: true; item: ValidatedItem; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export type ItemValidator = (doc: unknown, context: ValidateContext) => ItemValidation;

/**
 * Compile both validators once.
 *
 * Every error this factory's validator emits is non-forceable, so callers can
 * read `ok` directly rather than re-deriving it against `--force`.
 */
export function createItemValidator(): ItemValidator {
  const validateWire = createWireValidator();
  const validateMeta = compileMetaSchema();

  return (doc, context) => {
    const diagnostics: Diagnostic[] = [];

    const wireErrors = validateWire(doc);
    if (wireErrors) {
      diagnostics.push(
        diag(
          "wire-invalid",
          `${context.id} is not a valid registry item (${context.redactedUrl}): ${summarise(wireErrors)}`,
          { items: [context.id] },
        ),
      );
      return { ok: false, diagnostics };
    }

    // Justified by the validation above: the interchange schema requires `name`
    // and `type`, constrains `type` to its enum, and types every optional field
    // this shape reads.
    const wire = doc as WireDoc;

    if (REFUSED_ITEM_TYPES.has(wire.type)) {
      diagnostics.push(
        diag(
          "target-refused-type",
          `${context.id} is a ${wire.type} item. manteen installs component files; a font item carries only metadata for a framework font pipeline.`,
          { items: [context.id] },
        ),
      );
      return { ok: false, diagnostics };
    }

    const mismatch = nameMismatch(context.expectedName, wire.name);
    if (mismatch) {
      diagnostics.push(
        diag(
          "name-mismatch",
          `${context.id} resolved to an item named "${wire.name}" (${context.redactedUrl}). Installing it under the requested name.`,
          { items: [context.id] },
        ),
      );
    }

    const files: WireFile[] = [];
    for (const file of wire.files ?? []) {
      if (typeof file.content !== "string" || file.content === "") {
        // No second channel exists to fetch the bytes from, so continuing would
        // mean writing an empty file over the user's component (D20).
        diagnostics.push(
          diag(
            "file-no-content",
            `${context.id} ships "${file.path}" with no content, so there is nothing to install at that path.`,
            { items: [context.id], path: file.path },
          ),
        );
        continue;
      }
      files.push({
        path: file.path,
        type: file.type,
        ...(file.target === undefined ? {} : { target: file.target }),
        content: file.content,
      });
    }

    const meta = readMeta(wire.meta, validateMeta, context, diagnostics);
    const cssImports = readCssImports(wire.css, wire.dependencies ?? [], context, diagnostics);

    // No `diagnostics.some(error)` check here — see `ItemValidation`. An error
    // collected above has already dropped the field or file it was about, so
    // what is returned is exactly the installable remainder, and the run is
    // refused by severity rather than by withholding the item.
    return {
      ok: true,
      item: {
        name: wire.name,
        wireType: wire.type,
        files,
        dependencies: wire.dependencies ?? [],
        devDependencies: wire.devDependencies ?? [],
        registryDependencies: wire.registryDependencies ?? [],
        cssImports,
        meta,
      },
      diagnostics,
    };
  };
}

interface WireDoc {
  name: string;
  type: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  css?: unknown;
  files?: { path: string; type: string; target?: string; content?: unknown }[];
  meta?: unknown;
}

/**
 * D26-D27: deliberately narrower than shadcn's full CSS object. The exact key
 * emitted by the kit is the executable contract; everything else refuses
 * instead of being partially interpreted or silently discarded.
 */
function readCssImports(
  rawCss: unknown,
  dependencies: readonly string[],
  context: ValidateContext,
  diagnostics: Diagnostic[],
): string[] {
  if (rawCss === undefined) return [];
  if (!isPlainObject(rawCss)) {
    diagnostics.push(
      diag(
        "css-unsupported",
        `${context.id} has a css value outside Manteen's import-only contract. Declare package styles as keys shaped exactly like @import "package/styles.css" with an empty object value.`,
        { items: [context.id] },
      ),
    );
    return [];
  }

  const runtimePackages = new Set(dependencies.map((spec) => parseNpmSpec(spec).name));
  const imports: string[] = [];

  for (const [rule, value] of Object.entries(rawCss)) {
    const match = /^@import "([^"]+)"$/.exec(rule);
    const source = match?.[1];
    if (source === undefined || !isPlainObject(value) || Object.keys(value).length > 0) {
      diagnostics.push(
        diag(
          "css-unsupported",
          `${context.id} declares unsupported CSS rule ${JSON.stringify(rule)}. Manteen accepts only exact package imports with empty object values.`,
          { items: [context.id] },
        ),
      );
      continue;
    }

    const packageName = packageNameForStyleImport(source);
    if (packageName === null) {
      diagnostics.push(
        diag(
          "css-unsupported",
          `${context.id} declares ${JSON.stringify(source)}, which is not a bare package stylesheet import. Relative paths, URLs, media imports and other CSS forms are not supported.`,
          { items: [context.id] },
        ),
      );
      continue;
    }

    if (!runtimePackages.has(packageName)) {
      diagnostics.push(
        diag(
          "css-dependency-missing",
          `${context.id} imports ${JSON.stringify(source)} from ${packageName}, but that package is not declared in the item's runtime dependencies.`,
          { items: [context.id] },
        ),
      );
      continue;
    }

    imports.push(source);
  }

  return imports;
}

function packageNameForStyleImport(source: string): string | null {
  if (
    source === "" ||
    source.startsWith(".") ||
    source.startsWith("/") ||
    source.includes(":") ||
    source.includes("\\") ||
    /\s/.test(source)
  ) {
    return null;
  }

  const segments = source.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
    return null;
  if (source.startsWith("@")) {
    if (segments.length < 2 || !isPackageSegment(segments[0]!.slice(1))) return null;
    if (!isPackageSegment(segments[1]!)) return null;
    return `${segments[0]}/${segments[1]}`;
  }

  if (!isPackageSegment(segments[0]!)) return null;
  return segments[0]!;
}

function isPackageSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9._~-]*$/.test(value);
}

function compileMetaSchema(): ValidateFunction {
  const ajv = new Ajv({ strict: false, allErrors: true });
  // No `delete schema.$schema` here, unlike the kit's `loadSchema`. That
  // workaround exists because the VENDORED wire schema declares the https://
  // draft-07 id, which ajv does not register. We author this one, so it declares
  // the http:// form and compiles as-is (D24). Copying the delete would ship a
  // misleading comment in the module whose job is keeping the gotcha findable.
  return ajv.compile(readSchema());
}

function readSchema(): Record<string, unknown> {
  let lastError: unknown;
  for (const candidate of SCHEMA_CANDIDATES) {
    try {
      const path = resolve(import.meta.dirname, candidate, META_SCHEMA_FILE);
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${META_SCHEMA_FILE} is missing from the manteen package (looked in ${SCHEMA_CANDIDATES.join(" and ")} relative to ${import.meta.dirname}): ${String(lastError)}`,
  );
}

/**
 * Read `meta.mantine`, keeping every key the schema accepted and dropping the
 * ones it did not.
 *
 * Per-key granularity is the whole point, and it comes from ajv's
 * `instancePath`: an error at `/requires` blocks, one at `/stylesApi/Root`
 * degrades just `stylesApi`. Validating the object as a whole and refusing on
 * any error would make a cosmetic `stylesApi` typo fatal; validating nothing
 * would let `requires: 12345` through.
 */
function readMeta(
  rawMeta: unknown,
  validateMeta: ValidateFunction,
  context: ValidateContext,
  diagnostics: Diagnostic[],
): MantineMeta {
  if (!isPlainObject(rawMeta)) return {};

  const mantine = rawMeta.mantine;
  if (mantine === undefined) return {};

  if (!isPlainObject(mantine)) {
    diagnostics.push(
      diag(
        "meta-degraded",
        `${context.id} has a meta.mantine that is not an object; every Mantine-specific field was ignored.`,
        { items: [context.id] },
      ),
    );
    return {};
  }

  if (validateMeta(mantine)) return pick(mantine, new Set());

  const byKey = new Map<string, string[]>();
  for (const error of validateMeta.errors ?? []) {
    const key = unescapePointer(error.instancePath.split("/")[1] ?? "");
    const message = `${error.instancePath || "/"} ${error.message ?? "is invalid"}`;
    byKey.set(key, [...(byKey.get(key) ?? []), message]);
  }

  // An error at the root means the object itself is unusable — nothing under it
  // can be trusted, so every key goes.
  if (byKey.has("")) {
    diagnostics.push(
      diag(
        "meta-degraded",
        `${context.id} has an unusable meta.mantine (${summarise(byKey.get("") ?? [])}); every Mantine-specific field was ignored.`,
        { items: [context.id] },
      ),
    );
    return {};
  }

  for (const [key, messages] of byKey) {
    if (key === "requires") {
      diagnostics.push(
        diag(
          "meta-invalid-requires",
          `${context.id} declares a malformed meta.mantine.requires (${summarise(messages)}). That field is the Mantine version guard, so it is refused rather than ignored.`,
          { items: [context.id] },
        ),
      );
      continue;
    }
    diagnostics.push(
      diag(
        "meta-degraded",
        `${context.id} has a malformed meta.mantine.${key} (${summarise(messages)}); the field was dropped.`,
        { items: [context.id] },
      ),
    );
  }

  return pick(mantine, new Set(byKey.keys()));
}

/**
 * Keep the accepted keys.
 *
 * Written out per key rather than looped, because this is where
 * schema-validated values re-enter the type system and each cast should be
 * readable next to the schema rule that earned it. `rejected` never holds an
 * unknown key: the schema is open, so an unknown key cannot produce an error to
 * be rejected by.
 */
function pick(mantine: Record<string, unknown>, rejected: Set<string>): MantineMeta {
  const meta: MantineMeta = {};
  const keep = (key: MetaKey) => mantine[key] !== undefined && !rejected.has(key);

  if (keep("requires")) meta.requires = mantine.requires as string;
  if (keep("provider")) meta.provider = mantine.provider as string;
  if (keep("stylesApi")) meta.stylesApi = mantine.stylesApi as Record<string, string[]>;
  if (keep("themeFragment")) {
    meta.themeFragment = mantine.themeFragment as { path: string; content: string };
  }

  return meta;
}

/**
 * A multi-segment name (D23) may be served by a registry whose item `name` is
 * just the last segment, so both spellings count as a match. The check still
 * catches the case it exists for: asking for one item and being handed another.
 */
function nameMismatch(expected: string | null, actual: string): boolean {
  if (expected === null || expected === actual) return false;
  return expected.slice(expected.lastIndexOf("/") + 1) !== actual;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON Pointer escapes, so a key containing `/` or `~` partitions correctly.
 *  None of our four keys need it; a hand-written registry's does not have to
 *  be one of our four. */
function unescapePointer(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

const MAX_REPORTED = 5;

function summarise(messages: string[]): string {
  const head = messages.slice(0, MAX_REPORTED).join("; ");
  const rest = messages.length - MAX_REPORTED;
  return rest > 0 ? `${head}; +${rest} more` : head;
}
