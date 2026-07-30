/**
 * Vite's entry-point adapter.
 *
 * Pure by contract: the source comes from InitProjectSnapshot and ts-morph uses
 * its in-memory filesystem. Shared config, aliases, theme creation and
 * dependencies belong to the integrator, not this adapter.
 */
import { join } from "node:path";

import {
  type ArrowFunction,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  type JsxAttribute,
  type JsxElement,
  type JsxFragment,
  type JsxOpeningLikeElement,
  type JsxSelfClosingElement,
  Node,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

import { initSourceUnsupported } from "../diagnostics";
import { ensureManagedStyleImports, managedStylesImport } from "../styles";
import type { InitAdapter, InitAdapterInput, InitAdapterResult } from "../types";

const MANTINE_CORE = "@mantine/core";

type ComponentFunction = FunctionDeclaration | FunctionExpression | ArrowFunction;
type JsxRoot = JsxElement | JsxSelfClosingElement | JsxFragment;

interface TransformTarget {
  expression: Expression;
  root: JsxRoot;
}

/** The frozen adapter value consumed by init's shared planner. */
export const viteAdapter: InitAdapter = {
  id: "vite",
  plan: planViteEntry,
};

export function planViteEntry(input: InitAdapterInput): InitAdapterResult {
  const entryPath = join(input.project.layout.sourceRoot, "App.tsx");
  const content = input.project.files.get(entryPath);

  if (content === undefined) {
    return refused(entryPath, "App.tsx is absent from the finite project snapshot.");
  }

  try {
    return transformEntry(input, entryPath, content);
  } catch {
    // A parser/manipulation exception is an expected unsafe-source refusal at
    // this boundary. Do not echo exception text: it may contain project source.
    return refused(entryPath, "the TypeScript syntax tree could not be transformed safely.");
  }
}

function transformEntry(
  input: InitAdapterInput,
  entryPath: string,
  content: string,
): InitAdapterResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      quoteKind: preferredQuote(content),
    },
  });
  const sourceFile = project.createSourceFile(entryPath, content);
  const target = findTransformTarget(sourceFile);

  if (typeof target === "string") return refused(entryPath, target);

  const existingProviderTag = importedProviderTag(sourceFile);
  const rootOpening = openingElement(target.root);
  const rootTag = rootOpening?.getTagNameNode().getText() ?? null;
  const rootIsProvider = existingProviderTag !== null && rootTag === existingProviderTag;

  if (
    existingProviderTag === null &&
    rootTag !== null &&
    (rootTag === "MantineProvider" || rootTag.endsWith(".MantineProvider"))
  ) {
    return refused(
      entryPath,
      "the returned MantineProvider is not backed by a value import from @mantine/core.",
    );
  }

  if (!rootIsProvider && containsProvider(target.root, existingProviderTag)) {
    return refused(
      entryPath,
      "MantineProvider is present below the returned root, so full-tree provider coverage cannot be proven.",
    );
  }

  const identifiers = new Set(
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );
  const providerTag = existingProviderTag ?? uniqueLocalName("MantineProvider", identifiers);
  identifiers.add(providerTag);

  const existingThemeLocal = importedNamedLocal(
    sourceFile,
    input.project.layout.themeImport,
    "theme",
  );
  const themeLocal = existingThemeLocal ?? uniqueLocalName("theme", identifiers);

  if (rootIsProvider && rootOpening !== null) {
    const themeAttribute = findJsxAttribute(rootOpening, "theme");

    if (themeAttribute !== undefined) {
      if (
        existingThemeLocal === null ||
        themeAttribute.getInitializer()?.getText() !== `{${existingThemeLocal}}`
      ) {
        return refused(
          entryPath,
          "MantineProvider already has a theme prop that is not the statically imported @/lib/theme export.",
        );
      }
    }
  }

  // All refusal checks precede mutation, even though this project is in-memory.
  ensureManagedStyleImports(
    sourceFile,
    managedStylesImport(entryPath, input.project.layout.stylesPath),
  );
  ensureProviderImport(sourceFile, providerTag, existingProviderTag);
  ensureThemeImport(sourceFile, input.project.layout.themeImport, themeLocal, existingThemeLocal);

  if (rootIsProvider && rootOpening !== null) {
    if (
      !rootOpening
        .getAttributes()
        .some(
          (attribute) =>
            Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === "theme",
        )
    ) {
      rootOpening.insertAttribute(0, { name: "theme", initializer: `{${themeLocal}}` });
    }
  } else {
    const originalRoot = target.root.getText();
    target.expression.replaceWithText(
      `<${providerTag} theme={${themeLocal}}>\n${originalRoot}\n</${providerTag}>`,
    );
  }

  return {
    files: [{ kind: "entry", destination: entryPath, content: sourceFile.getFullText() }],
    instructions: [],
    diagnostics: [],
  };
}

function findTransformTarget(sourceFile: SourceFile): TransformTarget | string {
  const defaultFunctions = sourceFile.getFunctions().filter((fn) => fn.hasDefaultKeyword());
  const exportAssignments = sourceFile
    .getExportAssignments()
    .filter((assignment) => !assignment.isExportEquals());

  if (defaultFunctions.length + exportAssignments.length !== 1) {
    return "App.tsx must have exactly one statically resolvable default component export.";
  }

  let component: ComponentFunction | undefined = defaultFunctions[0];
  if (component === undefined) {
    const exported = exportAssignments[0]?.getExpression();
    if (exported === undefined) {
      return "App.tsx has no statically resolvable default component export.";
    }

    if (Node.isArrowFunction(exported) || Node.isFunctionExpression(exported)) {
      component = exported;
    } else if (Node.isIdentifier(exported)) {
      component = componentDeclaration(sourceFile, exported.getText());
    }
  }

  if (component === undefined) {
    return "the default export is computed rather than a function or static component binding.";
  }

  const expression = returnedExpression(component);
  if (typeof expression === "string") return expression;

  let root: Expression = expression;
  while (Node.isParenthesizedExpression(root)) root = root.getExpression();

  if (
    !Node.isJsxElement(root) &&
    !Node.isJsxSelfClosingElement(root) &&
    !Node.isJsxFragment(root)
  ) {
    return "the component does not return one statically identifiable JSX root.";
  }

  return { expression: root, root };
}

function componentDeclaration(sourceFile: SourceFile, name: string): ComponentFunction | undefined {
  const functions = sourceFile.getFunctions().filter((fn) => fn.getName() === name && fn.getBody());
  if (functions.length === 1) return functions[0];

  const declaration = sourceFile.getVariableDeclaration(name);
  const initializer = declaration?.getInitializer();
  if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    return initializer;
  return undefined;
}

function returnedExpression(component: ComponentFunction): Expression | string {
  if (Node.isArrowFunction(component) && !Node.isBlock(component.getBody())) {
    return component.getBody() as Expression;
  }

  const body = component.getBody();
  if (body === undefined || !Node.isBlock(body)) {
    return "the default component has no static function body.";
  }

  const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((statement) => {
    const closestFunction = statement.getFirstAncestor(isFunctionBoundary);
    return closestFunction === component;
  });

  if (returns.length !== 1) {
    return "the default component must have exactly one statically identifiable return statement.";
  }

  return returns[0]?.getExpression() ?? "the default component return has no expression.";
}

function isFunctionBoundary(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  );
}

function importedProviderTag(sourceFile: SourceFile): string | null {
  const named = importedNamedLocal(sourceFile, MANTINE_CORE, "MantineProvider");
  if (named !== null) return named;

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly() || declaration.getModuleSpecifierValue() !== MANTINE_CORE)
      continue;
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined) return `${namespace.getText()}.MantineProvider`;
  }
  return null;
}

function importedNamedLocal(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  exportedName: string,
): string | null {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly() || declaration.getModuleSpecifierValue() !== moduleSpecifier) {
      continue;
    }
    const specifier = declaration
      .getNamedImports()
      .find((entry) => !entry.isTypeOnly() && entry.getName() === exportedName);
    if (specifier !== undefined) {
      return specifier.getAliasNode()?.getText() ?? specifier.getName();
    }
  }
  return null;
}

function containsProvider(root: JsxRoot, importedTag: string | null): boolean {
  const openingTags = root
    .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
    .map((element) => element.getTagNameNode().getText());
  const selfClosingTags = root
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .map((element) => element.getTagNameNode().getText());
  return [...openingTags, ...selfClosingTags].some(
    (tag) => tag === importedTag || tag === "MantineProvider" || tag.endsWith(".MantineProvider"),
  );
}

function openingElement(root: JsxRoot): JsxOpeningLikeElement | null {
  if (Node.isJsxElement(root)) return root.getOpeningElement();
  if (Node.isJsxSelfClosingElement(root)) return root;
  return null;
}

function findJsxAttribute(opening: JsxOpeningLikeElement, name: string): JsxAttribute | undefined {
  for (const attribute of opening.getAttributes()) {
    if (Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === name) {
      return attribute;
    }
  }
  return undefined;
}

function ensureProviderImport(
  sourceFile: SourceFile,
  localName: string,
  existingLocalName: string | null,
): void {
  if (existingLocalName !== null) return;

  const declaration = sourceFile
    .getImportDeclarations()
    .find((entry) => !entry.isTypeOnly() && entry.getModuleSpecifierValue() === MANTINE_CORE);
  const structure = {
    name: "MantineProvider",
    ...(localName === "MantineProvider" ? {} : { alias: localName }),
  };

  if (declaration === undefined || declaration.getNamespaceImport() !== undefined) {
    sourceFile.addImportDeclaration({ moduleSpecifier: MANTINE_CORE, namedImports: [structure] });
  } else {
    declaration.addNamedImport(structure);
  }
}

function ensureThemeImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  localName: string,
  existingLocalName: string | null,
): void {
  if (existingLocalName !== null) return;

  const declaration = sourceFile
    .getImportDeclarations()
    .find((entry) => !entry.isTypeOnly() && entry.getModuleSpecifierValue() === moduleSpecifier);
  const structure = {
    name: "theme",
    ...(localName === "theme" ? {} : { alias: localName }),
  };

  if (declaration === undefined || declaration.getNamespaceImport() !== undefined) {
    sourceFile.addImportDeclaration({ moduleSpecifier, namedImports: [structure] });
  } else {
    declaration.addNamedImport(structure);
  }
}

function uniqueLocalName(preferred: string, identifiers: ReadonlySet<string>): string {
  if (!identifiers.has(preferred)) return preferred;
  const base = `manteen${preferred[0]?.toUpperCase()}${preferred.slice(1)}`;
  if (!identifiers.has(base)) return base;

  let suffix = 2;
  while (identifiers.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function preferredQuote(content: string): QuoteKind {
  const firstImport =
    content.match(/\bfrom\s+(['"])/)?.[1] ?? content.match(/^\s*import\s+(['"])/m)?.[1];
  return firstImport === "'" ? QuoteKind.Single : QuoteKind.Double;
}

function refused(entryPath: string, detail: string): InitAdapterResult {
  return {
    files: [],
    instructions: [],
    diagnostics: [initSourceUnsupported(entryPath, detail)],
  };
}
