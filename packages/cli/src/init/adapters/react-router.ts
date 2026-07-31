import { resolve } from "node:path";

import { Node, Project, QuoteKind, type SourceFile, SyntaxKind } from "ts-morph";

import { initSourceUnsupported } from "../diagnostics";
import { ensureManagedStyleImports, managedStylesImport } from "../styles";
import type { InitAdapter, InitAdapterResult } from "../types";

const MANTINE_CORE = "@mantine/core";
const THEME_MODULE = "@/lib/theme";

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

interface StaticLayout {
  html: import("ts-morph").JsxElement;
  head: import("ts-morph").JsxElement;
  body: import("ts-morph").JsxElement;
  children: import("ts-morph").JsxExpression;
  provider: import("ts-morph").JsxElement | null;
}

export const reactRouterAdapter: InitAdapter = {
  id: "react-router",
  plan(input): InitAdapterResult {
    const rootPath = resolve(input.project.layout.sourceRoot, "root.tsx");
    const source = input.project.files.get(rootPath);

    if (source === undefined) {
      return unsupported(
        rootPath,
        "the framework root module is missing from the project snapshot.",
      );
    }

    const sourceFile = parseSource(rootPath, source);
    const layout = findStaticLayout(sourceFile);
    if (typeof layout === "string") return unsupported(rootPath, layout);

    const appCssImport = sourceFile
      .getImportDeclarations()
      .find((declaration) => declaration.getModuleSpecifierValue() === "./app.css");
    if (!appCssImport) {
      return unsupported(
        rootPath,
        "the static ./app.css side-effect import needed to order Mantine styles is absent.",
      );
    }

    const edits: TextEdit[] = [];

    if (!hasSpreadAttribute(layout.html, "mantineHtmlProps")) {
      const opening = layout.html.getOpeningElement();
      edits.push({
        start: opening.getEnd() - 1,
        end: opening.getEnd() - 1,
        text: " {...mantineHtmlProps}",
      });
    }

    if (!hasJsxTag(layout.head, "ColorSchemeScript")) {
      const anchor = firstMeaningfulChild(layout.head);
      const position = anchor?.getStart() ?? layout.head.getClosingElement().getStart();
      const indentation = indentationAt(source, position);
      edits.push({
        start: position,
        end: position,
        text: `<ColorSchemeScript />${lineEnding(source)}${indentation}`,
      });
    }

    if (layout.provider) {
      const opening = layout.provider.getOpeningElement();
      if (!hasAttribute(opening, "theme")) {
        edits.push({
          start: opening.getEnd() - 1,
          end: opening.getEnd() - 1,
          text: " theme={theme}",
        });
      }
    } else {
      edits.push({
        start: layout.children.getStart(),
        end: layout.children.getEnd(),
        text: `<MantineProvider theme={theme}>${layout.children.getText()}</MantineProvider>`,
      });
    }

    const jsxPatched = applyTextEdits(source, edits);
    const content = ensureImports(
      rootPath,
      jsxPatched,
      managedStylesImport(rootPath, input.project.layout.stylesPath),
    );

    return {
      files: content === source ? [] : [{ kind: "entry", destination: rootPath, content }],
      instructions: [],
      diagnostics: [],
    };
  },
};

function parseSource(path: string, source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: preferredQuote(source),
    },
  });
  return project.createSourceFile(path, source);
}

function preferredQuote(source: string): QuoteKind {
  const firstImport =
    /^import[\s\S]*?from\s+(["'])/m.exec(source) ?? /^import\s+(["'])/m.exec(source);
  return firstImport?.[1] === "'" ? QuoteKind.Single : QuoteKind.Double;
}

function findStaticLayout(sourceFile: SourceFile): StaticLayout | string {
  const declaration = sourceFile.getFunction("Layout");
  const body = declaration?.getBody();
  if (!declaration || !body || !Node.isBlock(body)) {
    return "an implemented top-level Layout function is required.";
  }

  const returns = body.getStatements().filter(Node.isReturnStatement);
  if (returns.length !== 1) {
    return "Layout must have exactly one direct return statement.";
  }

  let expression = returns[0]!.getExpression();
  while (expression && Node.isParenthesizedExpression(expression)) {
    expression = expression.getExpression();
  }
  if (!expression || !Node.isJsxElement(expression) || jsxTag(expression) !== "html") {
    return "Layout must directly return one static <html> document.";
  }

  const head = directJsxChild(expression, "head");
  const pageBody = directJsxChild(expression, "body");
  if (!head || !pageBody) {
    return "the static <html> document must have direct <head> and <body> elements.";
  }

  const providers = pageBody
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter((candidate) => jsxTag(candidate) === "MantineProvider" && containsChildren(candidate));
  if (providers.length > 1) {
    return "more than one MantineProvider owns the Layout children.";
  }

  const provider = providers[0] ?? null;
  const children = provider ? findChildren(provider) : directChildrenExpression(pageBody);
  if (!children) {
    return "Layout children must be a direct <body> child or belong to one static MantineProvider.";
  }

  return { html: expression, head, body: pageBody, children, provider };
}

function directJsxChild(parent: import("ts-morph").JsxElement, tag: string) {
  return parent
    .getJsxChildren()
    .find(
      (child): child is import("ts-morph").JsxElement =>
        Node.isJsxElement(child) && jsxTag(child) === tag,
    );
}

function jsxTag(element: import("ts-morph").JsxElement): string {
  return element.getOpeningElement().getTagNameNode().getText();
}

function containsChildren(element: import("ts-morph").JsxElement): boolean {
  return findChildren(element) !== undefined;
}

function findChildren(element: import("ts-morph").JsxElement) {
  return element
    .getDescendantsOfKind(SyntaxKind.JsxExpression)
    .find((expression) => expression.getExpression()?.getText() === "children");
}

function directChildrenExpression(element: import("ts-morph").JsxElement) {
  return element
    .getJsxChildren()
    .find(
      (child): child is import("ts-morph").JsxExpression =>
        Node.isJsxExpression(child) && child.getExpression()?.getText() === "children",
    );
}

function hasSpreadAttribute(element: import("ts-morph").JsxElement, expression: string): boolean {
  return element
    .getOpeningElement()
    .getAttributes()
    .some(
      (attribute) =>
        Node.isJsxSpreadAttribute(attribute) && attribute.getExpression().getText() === expression,
    );
}

function hasAttribute(opening: import("ts-morph").JsxOpeningElement, name: string): boolean {
  return opening
    .getAttributes()
    .some(
      (attribute) => Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === name,
    );
}

function hasJsxTag(element: import("ts-morph").JsxElement, tag: string): boolean {
  return (
    element
      .getDescendantsOfKind(SyntaxKind.JsxElement)
      .some((candidate) => jsxTag(candidate) === tag) ||
    element
      .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
      .some((candidate) => candidate.getTagNameNode().getText() === tag)
  );
}

function firstMeaningfulChild(element: import("ts-morph").JsxElement) {
  return element
    .getJsxChildren()
    .find((child) => !Node.isJsxText(child) || child.getText().trim().length > 0);
}

function ensureImports(path: string, source: string, managedImport: string): string {
  const sourceFile = parseSource(path, source);
  const imports = sourceFile.getImportDeclarations();

  const coreImport = imports.find(
    (declaration) =>
      declaration.getModuleSpecifierValue() === MANTINE_CORE && !declaration.isTypeOnly(),
  );
  const additions: import("ts-morph").OptionalKind<
    import("ts-morph").ImportDeclarationStructure
  >[] = [];

  if (!coreImport) {
    additions.push({
      moduleSpecifier: MANTINE_CORE,
      namedImports: ["ColorSchemeScript", "MantineProvider", "mantineHtmlProps"],
    });
  } else {
    const imported = new Set(
      coreImport
        .getNamedImports()
        .map((namedImport) => namedImport.getAliasNode()?.getText() ?? namedImport.getName()),
    );
    coreImport.addNamedImports(
      ["ColorSchemeScript", "MantineProvider", "mantineHtmlProps"].filter(
        (name) => !imported.has(name),
      ),
    );
  }

  const themeImport = sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === THEME_MODULE && !declaration.isTypeOnly(),
    );
  if (!themeImport) {
    additions.push({ moduleSpecifier: THEME_MODULE, namedImports: ["theme"] });
  } else if (
    !themeImport
      .getNamedImports()
      .some(
        (namedImport) =>
          (namedImport.getAliasNode()?.getText() ?? namedImport.getName()) === "theme",
      )
  ) {
    themeImport.addNamedImport("theme");
  }

  if (additions.length > 0) {
    const destinationIndex = sourceFile
      .getImportDeclarations()
      .findIndex((declaration) => declaration.getModuleSpecifierValue() === "./app.css");
    sourceFile.insertImportDeclarations(destinationIndex, additions);
  }

  ensureManagedStyleImports(sourceFile, managedImport);

  return sourceFile.getFullText();
}

function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
  }
  return output;
}

function lineEnding(source: string): "\n" | "\r\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function indentationAt(source: string, position: number): string {
  const lineStart = Math.max(source.lastIndexOf("\n", position - 1) + 1, 0);
  return /^[ \t]*/.exec(source.slice(lineStart, position))?.[0] ?? "";
}

function unsupported(path: string, detail: string): InitAdapterResult {
  return {
    files: [],
    instructions: [],
    diagnostics: [initSourceUnsupported(path, detail)],
  };
}
