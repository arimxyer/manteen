/**
 * Syntax-only summary of an inlined Mantine theme fragment.
 *
 * This module deliberately uses only ts-morph's parser and syntax tree. It does
 * not import the source, resolve identifiers, ask for types, or inspect callback
 * bodies. Unknown structure remains visible through the nearest `dynamic`
 * marker instead of being guessed.
 */
import {
  type CallExpression,
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  Project,
  SyntaxKind,
} from "ts-morph";

export const THEME_CHANNELS = ["defaultProps", "classNames", "styles", "vars"] as const;

export type ThemeChannelName = (typeof THEME_CHANNELS)[number];

export interface ThemeSummaryChannel {
  name: ThemeChannelName;
  dynamic: boolean;
}

export interface ThemeSummaryComponent {
  name: string;
  channels: ThemeSummaryChannel[];
  dynamic: boolean;
}

export interface ThemeSummary {
  keys: string[];
  components: {
    items: ThemeSummaryComponent[];
    dynamic: boolean;
  };
  dynamic: boolean;
}

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function emptySummary(): ThemeSummary {
  return {
    keys: [],
    components: { items: [], dynamic: true },
    dynamic: true,
  };
}

/**
 * Derive the stable display summary for one theme fragment.
 *
 * Failure is intentionally data, never an exception: registry compilation must
 * remain compatible with fragments the summarizer cannot understand.
 */
export function summarizeThemeFragment(source: string): ThemeSummary {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    });
    const sourceFile = project.createSourceFile("theme-summary.ts", source, { overwrite: true });

    // Syntactic diagnostics only. Semantic/type diagnostics would violate the
    // contract by asking TypeScript to evaluate names outside this source.
    if (project.getProgram().getSyntacticDiagnostics(sourceFile).length > 0) return emptySummary();

    const roots = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(isDirectCreateThemeCall);
    if (roots.length !== 1) return emptySummary();

    const args = roots[0]?.getArguments() ?? [];
    if (args.length !== 1 || !Node.isObjectLiteralExpression(args[0])) return emptySummary();

    return summarizeRoot(args[0]);
  } catch {
    return emptySummary();
  }
}

function isDirectCreateThemeCall(call: CallExpression): boolean {
  const expression = call.getExpression();
  return Node.isIdentifier(expression) && expression.getText() === "createTheme";
}

function summarizeRoot(root: ObjectLiteralExpression): ThemeSummary {
  const keys = new Set<string>();
  let dynamic = false;
  let components = { items: [] as ThemeSummaryComponent[], dynamic: false };

  for (const property of root.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      dynamic = true;
      continue;
    }

    const name = literalPropertyName(property);
    if (name === null) {
      dynamic = true;
      continue;
    }
    keys.add(name);

    if (name !== "components") continue;
    if (!Node.isPropertyAssignment(property)) {
      components = { items: [], dynamic: true };
      continue;
    }

    const initializer = property.getInitializer();
    components = Node.isObjectLiteralExpression(initializer)
      ? summarizeComponents(initializer)
      : { items: [], dynamic: true };
  }

  return {
    keys: [...keys].sort(compareCodeUnits),
    components,
    dynamic,
  };
}

function summarizeComponents(map: ObjectLiteralExpression): ThemeSummary["components"] {
  const items = new Map<string, ThemeSummaryComponent>();
  let dynamic = false;

  for (const property of map.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      dynamic = true;
      continue;
    }

    const name = literalPropertyName(property);
    if (name === null) {
      dynamic = true;
      continue;
    }

    const initializer = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
    items.set(name, summarizeComponent(name, initializer));
  }

  return {
    items: [...items.values()].sort((left, right) => compareCodeUnits(left.name, right.name)),
    dynamic,
  };
}

function summarizeComponent(name: string, initializer: Node | undefined): ThemeSummaryComponent {
  if (Node.isObjectLiteralExpression(initializer))
    return summarizeComponentObject(name, initializer);

  if (Node.isCallExpression(initializer) && isDirectExtendCall(initializer)) {
    const args = initializer.getArguments();
    if (args.length === 1 && Node.isObjectLiteralExpression(args[0])) {
      return summarizeComponentObject(name, args[0]);
    }
  }

  return { name, channels: [], dynamic: true };
}

function isDirectExtendCall(call: CallExpression): boolean {
  const expression = call.getExpression();
  return (
    Node.isPropertyAccessExpression(expression) &&
    expression.getName() === "extend" &&
    Node.isIdentifier(expression.getExpression())
  );
}

function summarizeComponentObject(
  name: string,
  config: ObjectLiteralExpression,
): ThemeSummaryComponent {
  const channels = new Map<ThemeChannelName, ThemeSummaryChannel>();
  let dynamic = false;

  for (const property of config.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      dynamic = true;
      continue;
    }

    const propertyName = literalPropertyName(property);
    if (propertyName === null) {
      dynamic = true;
      continue;
    }
    if (!isThemeChannel(propertyName)) continue;

    const initializer = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
    channels.set(propertyName, {
      name: propertyName,
      dynamic: !isFullyLiteralObject(initializer),
    });
  }

  return {
    name,
    channels: THEME_CHANNELS.flatMap((channel) => {
      const found = channels.get(channel);
      return found === undefined ? [] : [found];
    }),
    dynamic,
  };
}

function isThemeChannel(name: string): name is ThemeChannelName {
  return (THEME_CHANNELS as readonly string[]).includes(name);
}

/** A channel is static only when its entire value is literal syntax. */
function isFullyLiteralObject(value: Node | undefined): boolean {
  return Node.isObjectLiteralExpression(value) && value.getProperties().every(isLiteralProperty);
}

function isLiteralProperty(property: ObjectLiteralElementLike): boolean {
  if (!Node.isPropertyAssignment(property) || literalPropertyName(property) === null) return false;
  return isLiteralValue(property.getInitializer());
}

function isLiteralValue(value: Node | undefined): boolean {
  if (value === undefined) return false;
  if (
    Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value) ||
    Node.isNumericLiteral(value) ||
    Node.isBigIntLiteral(value)
  ) {
    return true;
  }

  const kind = value.getKind();
  if (
    kind === SyntaxKind.TrueKeyword ||
    kind === SyntaxKind.FalseKeyword ||
    kind === SyntaxKind.NullKeyword
  ) {
    return true;
  }

  if (Node.isPrefixUnaryExpression(value)) {
    const operand = value.getOperand();
    const operator = value.getOperatorToken();
    return (
      Node.isNumericLiteral(operand) &&
      (operator === SyntaxKind.PlusToken || operator === SyntaxKind.MinusToken)
    );
  }

  if (Node.isArrayLiteralExpression(value)) {
    return value
      .getElements()
      .every((element) => !Node.isSpreadElement(element) && isLiteralValue(element));
  }

  return Node.isObjectLiteralExpression(value) && value.getProperties().every(isLiteralProperty);
}

/**
 * Runtime property-key spelling for the only names this contract recognizes.
 * Computed names remain dynamic even when their expression happens to be a
 * literal, because accepting them would make "computed" look fully static.
 */
function literalPropertyName(property: ObjectLiteralElementLike): string | null {
  if (Node.isShorthandPropertyAssignment(property)) return property.getName();

  if (
    !Node.isPropertyAssignment(property) &&
    !Node.isMethodDeclaration(property) &&
    !Node.isGetAccessorDeclaration(property) &&
    !Node.isSetAccessorDeclaration(property)
  ) {
    return null;
  }

  const name = property.getNameNode();
  if (Node.isIdentifier(name)) return name.getText();
  if (Node.isStringLiteral(name)) return name.getLiteralText();
  if (Node.isNumericLiteral(name)) return String(name.getLiteralValue());
  return null;
}
