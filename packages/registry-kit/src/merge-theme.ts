import { Node, type ObjectLiteralExpression, Project, type SourceFile, SyntaxKind } from "ts-morph";

export interface MergeConflict {
  /** Dotted path into the theme object, e.g. `components.Button.defaultProps.radius`. */
  path: string;
  base: string;
  incoming: string;
  reason: string;
}

export interface MergeResult {
  text: string;
  /** Paths that were newly introduced by the incoming fragment. */
  added: string[];
  /** Paths where both sides had a value and one had to win. */
  conflicts: MergeConflict[];
  /** Named imports added to the `@mantine/core` import declaration. */
  importsAdded: string[];
  changed: boolean;
}

export interface MergeOptions {
  /**
   * Which side wins when both define the same leaf value.
   *
   * `base` (default) preserves local customization — the right policy when a
   * component item contributes theme defaults to a project the user already
   * tuned. `incoming` is for applying a theme preset on purpose.
   */
  prefer?: "base" | "incoming";
}

const MANTINE_CORE = "@mantine/core";

/**
 * Merge a Mantine theme fragment into an existing theme file.
 *
 * Both inputs are ordinary TypeScript modules containing a `createTheme({...})`
 * call, so a fragment is a valid standalone theme when no base exists yet.
 *
 * The merge is structural, not textual: `components` entries compose via their
 * `.extend()` argument objects instead of overwriting each other, and untouched
 * parts of the base file keep their original formatting and comments.
 */
export function mergeThemeSource(
  baseText: string,
  incomingText: string,
  options: MergeOptions = {},
): MergeResult {
  const prefer = options.prefer ?? "base";
  const project = new Project({ useInMemoryFileSystem: true });

  const baseFile = project.createSourceFile("base.ts", baseText);
  const incomingFile = project.createSourceFile("incoming.ts", incomingText);

  const baseTheme = findThemeObject(baseFile, "base");
  const incomingTheme = findThemeObject(incomingFile, "incoming");

  const ctx: MergeContext = { added: [], conflicts: [], prefer, mutations: 0 };
  mergeObject(baseTheme, incomingTheme, [], ctx);

  const importsAdded = syncMantineImports(baseFile, incomingFile, baseTheme);

  if (ctx.mutations > 0 || importsAdded.length > 0) {
    // Inserted nodes carry the incoming file's indentation, so reindent using
    // the base file's own width rather than the formatter's default.
    baseFile.formatText({
      indentSize: detectIndent(baseText),
      convertTabsToSpaces: !baseText.includes("\n\t"),
    });
    if (usesTrailingCommas(baseText)) restoreTrailingCommas(baseFile);
  }

  return {
    text: baseFile.getFullText(),
    added: ctx.added,
    conflicts: ctx.conflicts,
    importsAdded,
    changed: ctx.mutations > 0 || importsAdded.length > 0,
  };
}

interface MergeContext {
  added: string[];
  conflicts: MergeConflict[];
  prefer: "base" | "incoming";
  mutations: number;
}

function findThemeObject(file: SourceFile, label: string): ObjectLiteralExpression {
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((candidate) => candidate.getExpression().getText() === "createTheme");

  if (!call) {
    throw new Error(`No \`createTheme(...)\` call found in the ${label} theme.`);
  }

  const arg = call.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) {
    throw new Error(
      `\`createTheme()\` in the ${label} theme must be called with an object literal.`,
    );
  }

  return arg;
}

function propertyName(node: Node): string | null {
  if (!Node.isPropertyAssignment(node)) return null;
  const nameNode = node.getNameNode();
  if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
    return nameNode.getLiteralValue();
  }
  return nameNode.getText();
}

function findProperty(object: ObjectLiteralExpression, name: string) {
  return object.getProperties().find((property) => propertyName(property) === name);
}

/**
 * Recursive structural merge. Only properties missing from `base` are written,
 * so repeated runs converge — the second run finds everything already present.
 */
function mergeObject(
  base: ObjectLiteralExpression,
  incoming: ObjectLiteralExpression,
  path: string[],
  ctx: MergeContext,
): void {
  const inComponents = path.length === 1 && path[0] === "components";

  for (const incomingProperty of incoming.getProperties()) {
    const name = propertyName(incomingProperty);

    if (name === null) {
      ctx.conflicts.push({
        path: [...path, incomingProperty.getText().slice(0, 24)].join("."),
        base: "—",
        incoming: incomingProperty.getText(),
        reason: "unsupported property kind (spread, shorthand or method)",
      });
      continue;
    }

    if (!Node.isPropertyAssignment(incomingProperty)) continue;

    const here = [...path, name].join(".");
    const incomingInitializer = incomingProperty.getInitializer();
    if (!incomingInitializer) continue;

    const baseProperty = findProperty(base, name);

    if (!baseProperty) {
      base.addPropertyAssignment({
        name: incomingProperty.getNameNode().getText(),
        initializer: incomingInitializer.getText(),
      });
      ctx.added.push(here);
      ctx.mutations += 1;
      continue;
    }

    if (!Node.isPropertyAssignment(baseProperty)) continue;
    const baseInitializer = baseProperty.getInitializer();
    if (!baseInitializer) continue;

    if (inComponents) {
      mergeComponentEntry(baseProperty, incomingProperty, here, ctx);
      continue;
    }

    if (
      Node.isObjectLiteralExpression(baseInitializer) &&
      Node.isObjectLiteralExpression(incomingInitializer)
    ) {
      mergeObject(baseInitializer, incomingInitializer, [...path, name], ctx);
      continue;
    }

    // Two leaves. Identical values are a no-op, which is what makes re-running safe.
    if (normalize(baseInitializer.getText()) === normalize(incomingInitializer.getText())) {
      continue;
    }

    if (ctx.prefer === "incoming") {
      baseProperty.setInitializer(incomingInitializer.getText());
      ctx.mutations += 1;
    }

    ctx.conflicts.push({
      path: here,
      base: baseInitializer.getText(),
      incoming: incomingInitializer.getText(),
      reason:
        ctx.prefer === "incoming"
          ? "both sides set this value; incoming applied"
          : "both sides set this value; existing kept",
    });
  }
}

/**
 * Merge one `components` entry — `Button: Button.extend({ ... })`.
 *
 * The `.extend()` argument objects are merged so `defaultProps` from two
 * sources compose. Anything that isn't the `X.extend({...})` shape (a bare
 * identifier, a spread, a function) is reported rather than guessed at.
 */
function mergeComponentEntry(
  baseProperty: Node,
  incomingProperty: Node,
  path: string,
  ctx: MergeContext,
): void {
  if (!Node.isPropertyAssignment(baseProperty) || !Node.isPropertyAssignment(incomingProperty)) {
    return;
  }

  const baseExtend = extendArgument(baseProperty.getInitializer());
  const incomingExtend = extendArgument(incomingProperty.getInitializer());

  if (!baseExtend || !incomingExtend) {
    ctx.conflicts.push({
      path,
      base: truncate(baseProperty.getInitializer()?.getText() ?? "—"),
      incoming: truncate(incomingProperty.getInitializer()?.getText() ?? "—"),
      reason: "not a `Component.extend({...})` call; cannot merge structurally",
    });
    return;
  }

  mergeExtendObject(baseExtend, incomingExtend, path, ctx);
}

function mergeExtendObject(
  base: ObjectLiteralExpression,
  incoming: ObjectLiteralExpression,
  path: string,
  ctx: MergeContext,
): void {
  for (const incomingProperty of incoming.getProperties()) {
    const name = propertyName(incomingProperty);
    if (name === null || !Node.isPropertyAssignment(incomingProperty)) continue;

    const here = `${path}.${name}`;
    const incomingInitializer = incomingProperty.getInitializer();
    if (!incomingInitializer) continue;

    const baseProperty = findProperty(base, name);

    if (!baseProperty) {
      base.addPropertyAssignment({
        name: incomingProperty.getNameNode().getText(),
        initializer: incomingInitializer.getText(),
      });
      ctx.added.push(here);
      ctx.mutations += 1;
      continue;
    }

    if (!Node.isPropertyAssignment(baseProperty)) continue;
    const baseInitializer = baseProperty.getInitializer();
    if (!baseInitializer) continue;

    if (
      Node.isObjectLiteralExpression(baseInitializer) &&
      Node.isObjectLiteralExpression(incomingInitializer)
    ) {
      // defaultProps / vars / a plain classNames object.
      mergeObject(baseInitializer, incomingInitializer, [here], ctx);
      continue;
    }

    if (normalize(baseInitializer.getText()) === normalize(incomingInitializer.getText())) {
      continue;
    }

    // `classNames` / `styles` / `vars` given as callbacks cannot be composed
    // without changing runtime semantics, so they are surfaced, never guessed.
    const callbackSide =
      isCallback(baseInitializer) || isCallback(incomingInitializer)
        ? "callback form cannot be merged automatically"
        : "both sides set this value";

    if (
      ctx.prefer === "incoming" &&
      !isCallback(baseInitializer) &&
      !isCallback(incomingInitializer)
    ) {
      baseProperty.setInitializer(incomingInitializer.getText());
      ctx.mutations += 1;
    }

    ctx.conflicts.push({
      path: here,
      base: truncate(baseInitializer.getText()),
      incoming: truncate(incomingInitializer.getText()),
      reason: `${callbackSide}; ${ctx.prefer === "incoming" && !isCallback(baseInitializer) && !isCallback(incomingInitializer) ? "incoming applied" : "existing kept"}`,
    });
  }
}

function extendArgument(node: Node | undefined): ObjectLiteralExpression | null {
  if (!node || !Node.isCallExpression(node)) return null;

  const expression = node.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return null;
  if (expression.getName() !== "extend") return null;

  const arg = node.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : null;
}

/** `Button.extend(...)` -> `Button`. Used to know which imports to add. */
function extendTarget(node: Node | undefined): string | null {
  if (!node || !Node.isCallExpression(node)) return null;
  const expression = node.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return null;
  const target = expression.getExpression();
  return Node.isIdentifier(target) ? target.getText() : null;
}

function isCallback(node: Node): boolean {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").replace(/['"]/g, '"').trim();
}

function truncate(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Add any `@mantine/core` named imports the merged theme now references.
 *
 * Only identifiers the incoming file imported from `@mantine/core` are
 * considered, so this cannot invent imports for unrelated symbols.
 */
function syncMantineImports(
  baseFile: SourceFile,
  incomingFile: SourceFile,
  mergedTheme: ObjectLiteralExpression,
): string[] {
  const componentsProperty = findProperty(mergedTheme, "components");
  const referenced = new Set<string>();

  if (componentsProperty && Node.isPropertyAssignment(componentsProperty)) {
    const initializer = componentsProperty.getInitializer();
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      for (const entry of initializer.getProperties()) {
        if (!Node.isPropertyAssignment(entry)) continue;
        const target = extendTarget(entry.getInitializer());
        if (target) referenced.add(target);
      }
    }
  }

  const incomingImport = findMantineImport(incomingFile);
  const availableFromIncoming = new Set(
    incomingImport?.getNamedImports().map((named) => named.getName()) ?? [],
  );

  let baseImport = findMantineImport(baseFile);
  if (!baseImport) {
    baseImport = baseFile.addImportDeclaration({ moduleSpecifier: MANTINE_CORE });
  }

  const existing = baseImport.getNamedImports().map((named) => named.getName());
  const compare = pickImportComparator(existing);
  const toAdd = [...referenced]
    .filter((name) => !existing.includes(name) && availableFromIncoming.has(name))
    .sort(compare ?? caseSensitive);

  for (const name of toAdd) {
    const current = baseImport.getNamedImports().map((named) => named.getName());
    const index = compare
      ? current.findIndex((existingName) => compare(existingName, name) > 0)
      : -1;

    if (index === -1) {
      baseImport.addNamedImport(name);
    } else {
      baseImport.insertNamedImport(index, name);
    }
  }

  return toAdd;
}

function findMantineImport(file: SourceFile) {
  return file
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === MANTINE_CORE);
}

const caseSensitive = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const caseInsensitive = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

/**
 * Infer the file's own import-ordering convention instead of imposing one.
 *
 * `{ Button, Card, createTheme }` is ASCII-sorted; `{ Button, createTheme, Card }`
 * is case-insensitively sorted. Guessing wrong scatters new names through an
 * otherwise tidy list, so an unrecognized order means "append and leave it alone".
 */
function pickImportComparator(names: string[]): ((a: string, b: string) => number) | null {
  const sortedBy = (compare: (a: string, b: string) => number) =>
    names.every((name, index) => index === 0 || compare(names[index - 1]!, name) <= 0);

  if (sortedBy(caseSensitive)) return caseSensitive;
  if (sortedBy(caseInsensitive)) return caseInsensitive;
  return null;
}

/**
 * Match the base file's indentation so a merge produces a minimal diff.
 *
 * Block-comment continuation lines (` * ...`) are skipped — counting them
 * reports an indent of 1 for any file with a JSDoc header.
 */
function detectIndent(text: string): number {
  const widths = text
    .split("\n")
    .map((line) => /^( +)([^ *])/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]!.length);

  return widths.length > 0 ? Math.min(...widths) : 2;
}

function usesTrailingCommas(text: string): boolean {
  return /,\s*\n\s*[}\]]/.test(text);
}

/**
 * The TypeScript formatter never introduces trailing commas, so a newly
 * appended last property would break the file's existing style.
 */
function restoreTrailingCommas(file: SourceFile): void {
  const positions: number[] = [];

  for (const object of file.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const properties = object.getProperties();
    if (properties.length === 0) continue;
    if (!object.getText().includes("\n")) continue;

    const last = properties[properties.length - 1]!;
    const tail = file.getFullText().slice(last.getEnd(), object.getEnd());
    if (tail.includes(",")) continue;

    positions.push(last.getEnd());
  }

  // Insert back-to-front: every insertion shifts the offsets after it.
  for (const position of positions.sort((a, b) => b - a)) {
    file.insertText(position, ",");
  }
}
