import { resolve } from "node:path";

import {
  type ImportDeclaration,
  IndentationText,
  type JsxElement,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type Node as MorphNode,
  NewLineKind,
  Node,
  Project,
  QuoteKind,
  type SourceFile,
  StructureKind,
  SyntaxKind,
} from "ts-morph";

import { initSourceUnsupported } from "../diagnostics";
import { ensureManagedStyleImports, managedStylesImport } from "../styles";
import type { InitAdapter, InitAdapterInput, InitAdapterResult } from "../types";

type JsxNode = JsxElement | JsxSelfClosingElement;

interface TransformResult {
  ok: boolean;
  content?: string;
  detail?: string;
}

function sourceFile(path: string, content: string): SourceFile {
  const singleQuote = /(?:from\s*|import\s*)(['"])/m.exec(content)?.[1] === "'";
  const crlf = content.includes("\r\n");
  const tabIndented = /^(?:\t)+\S/m.test(content);
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: tabIndented ? IndentationText.Tab : IndentationText.TwoSpaces,
      newLineKind: crlf ? NewLineKind.CarriageReturnLineFeed : NewLineKind.LineFeed,
      quoteKind: singleQuote ? QuoteKind.Single : QuoteKind.Double,
    },
  });

  return project.createSourceFile(path, content, { overwrite: true });
}

function importedBinding(
  source: SourceFile,
  moduleSpecifier: string,
  importedName: string,
): string | undefined {
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== moduleSpecifier || declaration.isTypeOnly()) {
      continue;
    }

    const named = declaration
      .getNamedImports()
      .find((specifier) => specifier.getName() === importedName && !specifier.isTypeOnly());
    if (named) return named.getAliasNode()?.getText() ?? named.getName();

    const namespace = declaration.getNamespaceImport();
    if (namespace) return `${namespace.getText()}.${importedName}`;
  }

  return undefined;
}

function importDeclarationForValue(
  source: SourceFile,
  moduleSpecifier: string,
): ImportDeclaration | undefined {
  return source
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === moduleSpecifier &&
        !declaration.isTypeOnly() &&
        !declaration.getNamespaceImport(),
    );
}

function identifierIsDeclared(source: SourceFile, name: string): boolean {
  return source
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((identifier) => identifier.getText() === name);
}

function availableLocalName(source: SourceFile, preferred: string): string {
  if (!identifierIsDeclared(source, preferred)) return preferred;

  const stem = `manteen${preferred[0]?.toUpperCase()}${preferred.slice(1)}`;
  let candidate = stem;
  let suffix = 2;
  while (identifierIsDeclared(source, candidate)) {
    candidate = `${stem}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function ensureNamedImport(
  source: SourceFile,
  moduleSpecifier: string,
  importedName: string,
): string {
  const existing = importedBinding(source, moduleSpecifier, importedName);
  if (existing) return existing;

  const localName = availableLocalName(source, importedName);
  const declaration = importDeclarationForValue(source, moduleSpecifier);
  const structure =
    localName === importedName ? importedName : { name: importedName, alias: localName };

  if (declaration) {
    declaration.addNamedImport(structure);
  } else {
    source.addImportDeclaration({ moduleSpecifier, namedImports: [structure] });
  }
  return localName;
}

function defaultExportRoot(source: SourceFile): MorphNode | undefined {
  const directFunction = source.getFunctions().find((declaration) => declaration.isDefaultExport());
  if (directFunction) return directFunction;

  const directClass = source.getClasses().find((declaration) => declaration.isDefaultExport());
  if (directClass) return directClass;

  const assignment = source.getExportAssignments().find((entry) => !entry.isExportEquals());
  const expression = assignment?.getExpression();
  if (!expression) return undefined;
  if (!Node.isIdentifier(expression)) return expression;

  const name = expression.getText();
  return (
    source.getFunction(name) ??
    source.getClass(name) ??
    source.getVariableDeclaration(name) ??
    undefined
  );
}

function jsxNodes(root: MorphNode): JsxNode[] {
  return [
    ...root.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...root.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
}

function tagName(node: JsxNode): string {
  return Node.isJsxElement(node)
    ? node.getOpeningElement().getTagNameNode().getText()
    : node.getTagNameNode().getText();
}

function openingElement(node: JsxNode): JsxOpeningElement | JsxSelfClosingElement {
  return Node.isJsxElement(node) ? node.getOpeningElement() : node;
}

function findTags(root: MorphNode, names: readonly string[]): JsxNode[] {
  return jsxNodes(root).filter((node) => names.includes(tagName(node)));
}

function enclosingTag(node: MorphNode, names: readonly string[]): JsxElement | undefined {
  return node
    .getAncestors()
    .find(
      (ancestor): ancestor is JsxElement =>
        Node.isJsxElement(ancestor) && names.includes(tagName(ancestor)),
    );
}

function hasAttribute(node: JsxElement | JsxSelfClosingElement, name: string): boolean {
  return openingElement(node).getAttribute(name) !== undefined;
}

function transformApp(
  path: string,
  content: string,
  themeImport: string,
  stylesPath: string,
): TransformResult {
  const source = sourceFile(path, content);
  let root = defaultExportRoot(source);
  if (!root) {
    return { ok: false, detail: "the module has no statically identifiable default component" };
  }

  let components = findTags(root, ["Component"]);
  if (components.length !== 1) {
    return {
      ok: false,
      detail: `the default component must contain exactly one <Component> mount; found ${components.length}`,
    };
  }

  const existingProviderBinding = importedBinding(source, "@mantine/core", "MantineProvider");
  const providerNames = existingProviderBinding
    ? [existingProviderBinding, "MantineProvider"]
    : ["MantineProvider"];
  const existingProvider = enclosingTag(components[0], providerNames);
  const providerAlreadyHasTheme = existingProvider
    ? hasAttribute(existingProvider, "theme")
    : false;

  ensureManagedStyleImports(source, managedStylesImport(path, stylesPath));
  const providerBinding = ensureNamedImport(source, "@mantine/core", "MantineProvider");
  const themeBinding = providerAlreadyHasTheme
    ? undefined
    : ensureNamedImport(source, themeImport, "theme");

  root = defaultExportRoot(source);
  if (!root) return { ok: false, detail: "the default component changed during transformation" };
  components = findTags(root, ["Component"]);
  if (components.length !== 1) {
    return { ok: false, detail: "the <Component> mount changed during transformation" };
  }

  const provider = enclosingTag(components[0], [providerBinding, "MantineProvider"]);
  if (provider) {
    if (!hasAttribute(provider, "theme") && themeBinding) {
      provider
        .getOpeningElement()
        .addAttribute({ name: "theme", initializer: `{${themeBinding}}` });
    }
  } else {
    const componentText = components[0].getText();
    components[0].replaceWithText(
      `<${providerBinding} theme={${themeBinding}}>${componentText}</${providerBinding}>`,
    );
  }

  return { ok: true, content: source.getFullText() };
}

function hasSpreadAttribute(
  node: JsxElement | JsxSelfClosingElement,
  expressions: readonly string[],
): boolean {
  return openingElement(node)
    .getAttributes()
    .some(
      (attribute) =>
        Node.isJsxSpreadAttribute(attribute) &&
        expressions.includes(attribute.getExpression().getText()),
    );
}

function insertHeadChild(head: JsxNode, child: string): void {
  if (Node.isJsxSelfClosingElement(head)) {
    const tag = head.getTagNameNode().getText();
    const attributes = head
      .getAttributes()
      .map((attribute) => attribute.getText())
      .join(" ");
    const opening = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
    head.replaceWithText(`${opening}<${child} /></${tag}>`);
    return;
  }

  const opening = head.getOpeningElement();
  head.getSourceFile().insertText(opening.getEnd(), `<${child} />`);
}

function transformDocument(path: string, content: string): TransformResult {
  const source = sourceFile(path, content);
  let root = defaultExportRoot(source);
  if (!root) {
    return { ok: false, detail: "the module has no statically identifiable default document" };
  }

  const htmlBinding = importedBinding(source, "next/document", "Html");
  const headBinding = importedBinding(source, "next/document", "Head");
  if (!htmlBinding || !headBinding) {
    return {
      ok: false,
      detail: "the default document must import static Html and Head bindings from next/document",
    };
  }

  let htmlNodes = findTags(root, [htmlBinding]);
  let headNodes = findTags(root, [headBinding]);
  if (htmlNodes.length !== 1 || headNodes.length !== 1) {
    return {
      ok: false,
      detail: `the default document must contain exactly one <${htmlBinding}> and one <${headBinding}>; found ${htmlNodes.length} and ${headNodes.length}`,
    };
  }
  if (!headNodes[0].getAncestors().includes(htmlNodes[0])) {
    return { ok: false, detail: `<${headBinding}> is not inside <${htmlBinding}>` };
  }

  const htmlPropsBinding = ensureNamedImport(source, "@mantine/core", "mantineHtmlProps");
  const colorSchemeBinding = ensureNamedImport(source, "@mantine/core", "ColorSchemeScript");

  root = defaultExportRoot(source);
  if (!root) return { ok: false, detail: "the default document changed during transformation" };
  htmlNodes = findTags(root, [htmlBinding]);
  headNodes = findTags(root, [headBinding]);
  if (htmlNodes.length !== 1 || headNodes.length !== 1) {
    return { ok: false, detail: "the document seams changed during transformation" };
  }

  if (!hasSpreadAttribute(htmlNodes[0], [htmlPropsBinding, "mantineHtmlProps"])) {
    openingElement(htmlNodes[0]).addAttribute({
      kind: StructureKind.JsxSpreadAttribute,
      expression: htmlPropsBinding,
    });
  }

  root = defaultExportRoot(source);
  if (!root) return { ok: false, detail: "the default document changed during transformation" };
  headNodes = findTags(root, [headBinding]);
  const scripts = findTags(root, [colorSchemeBinding, "ColorSchemeScript"]);
  if (scripts.length === 0) {
    insertHeadChild(headNodes[0], colorSchemeBinding);
  }

  return { ok: true, content: source.getFullText() };
}

export const nextPagesAdapter: InitAdapter = {
  id: "next-pages",
  plan(input: InitAdapterInput): InitAdapterResult {
    const appPath = resolve(input.project.layout.sourceRoot, "pages/_app.tsx");
    const documentPath = resolve(input.project.layout.sourceRoot, "pages/_document.tsx");
    const appContent = input.project.files.get(appPath);
    const documentContent = input.project.files.get(documentPath);

    if (appContent === undefined || documentContent === undefined) {
      const missingPath = appContent === undefined ? appPath : documentPath;
      return {
        files: [],
        instructions: [],
        diagnostics: [
          initSourceUnsupported(
            missingPath,
            "Next Pages initialization requires both pages/_app.tsx and pages/_document.tsx",
          ),
        ],
      };
    }

    try {
      const app = transformApp(
        appPath,
        appContent,
        input.project.layout.themeImport,
        input.project.layout.stylesPath,
      );
      if (!app.ok) {
        return {
          files: [],
          instructions: [],
          diagnostics: [initSourceUnsupported(appPath, app.detail ?? "the app transform failed")],
        };
      }

      const document = transformDocument(documentPath, documentContent);
      if (!document.ok) {
        return {
          files: [],
          instructions: [],
          diagnostics: [
            initSourceUnsupported(documentPath, document.detail ?? "the document transform failed"),
          ],
        };
      }

      return {
        files: [
          { kind: "entry", destination: appPath, content: app.content ?? appContent },
          {
            kind: "entry",
            destination: documentPath,
            content: document.content ?? documentContent,
          },
        ],
        instructions: [],
        diagnostics: [],
      };
    } catch {
      return {
        files: [],
        instructions: [],
        diagnostics: [
          initSourceUnsupported(
            appPath,
            "the Pages entry pair could not be parsed and transformed as static TSX",
          ),
        ],
      };
    }
  },
};
