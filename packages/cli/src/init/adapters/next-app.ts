import { join } from "node:path";

import {
  type ImportDeclaration,
  type JsxElement,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  Node,
  Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

import { initSourceUnsupported } from "../diagnostics";
import type { InitAdapter, InitAdapterInput, InitAdapterResult } from "../types";

const MANTINE_CORE = "@mantine/core";
const MANTINE_STYLES = "@mantine/core/styles.css";

interface TextPatch {
  start: number;
  end: number;
  text: string;
}

interface RuntimeBinding {
  exported: string;
  local: string;
  missing: boolean;
}

type JsxTag = JsxElement | JsxSelfClosingElement;

export const nextAppAdapter: InitAdapter = {
  id: "next-app",
  plan(input) {
    const destination = join(input.project.layout.sourceRoot, "app", "layout.tsx");
    const source = input.project.files.get(destination);

    if (source === undefined) {
      return unsupported(
        destination,
        "the App Router layout file is absent from the project snapshot.",
      );
    }

    try {
      return transformLayout(input, destination, source);
    } catch {
      return unsupported(
        destination,
        "the App Router layout has an unsupported dynamic source shape.",
      );
    }
  },
};

function transformLayout(
  input: InitAdapterInput,
  destination: string,
  source: string,
): InitAdapterResult {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(destination, source);
  const rootFunctions = file.getFunctions().filter((candidate) => candidate.isDefaultExport());

  if (rootFunctions.length !== 1) {
    return unsupported(
      destination,
      "expected one directly exported default layout function with a static JSX document.",
    );
  }

  const rootFunction = rootFunctions[0]!;
  const htmlElements = rootFunction
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter((candidate) => tagName(candidate) === "html");

  if (htmlElements.length !== 1) {
    return unsupported(
      destination,
      "expected one static <html> document root in the default layout.",
    );
  }

  const html = htmlElements[0]!;
  const directDocumentChildren = html.getJsxChildren().filter(isJsxTag);
  const bodies = directDocumentChildren.filter((candidate) => tagName(candidate) === "body");
  const heads = directDocumentChildren.filter((candidate) => tagName(candidate) === "head");

  if (bodies.length !== 1 || !Node.isJsxElement(bodies[0])) {
    return unsupported(destination, "expected one non-self-closing <body> directly inside <html>.");
  }
  if (heads.length > 1) {
    return unsupported(destination, "found more than one <head> directly inside <html>.");
  }

  const body = bodies[0];
  const coreImports = file
    .getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === MANTINE_CORE);
  const provider = runtimeBinding(file, coreImports, "MantineProvider", "ManteenProvider");
  const colorSchemeScript = runtimeBinding(
    file,
    coreImports,
    "ColorSchemeScript",
    "ManteenColorSchemeScript",
  );
  const htmlProps = runtimeBinding(file, coreImports, "mantineHtmlProps", "manteenDocumentProps");
  const theme = themeBinding(file, input.project.layout.themeImport);

  const unboundMantineShape = unboundMantineAnchor(file, {
    provider,
    colorSchemeScript,
    htmlProps,
  });
  if (unboundMantineShape) {
    return unsupported(destination, unboundMantineShape);
  }

  const childExpressions = body
    .getDescendantsOfKind(SyntaxKind.JsxExpression)
    .filter((candidate) => candidate.getExpression()?.getText() === "children");
  if (childExpressions.length !== 1) {
    return unsupported(destination, "expected one static {children} expression inside <body>.");
  }

  const children = childExpressions[0]!;
  const providerElements = rootFunction
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter((candidate) => tagName(candidate) === provider.local);
  const containingProvider = providerElements.find((candidate) =>
    isDescendantOf(children, candidate),
  );

  if (providerElements.length > (containingProvider ? 1 : 0)) {
    return unsupported(
      destination,
      "found a MantineProvider that does not uniquely contain the layout children.",
    );
  }

  const head = heads[0];
  const scriptTags = rootFunction
    .getDescendants()
    .filter(isJsxTag)
    .filter((candidate) => tagName(candidate) === colorSchemeScript.local);
  const scriptInHead =
    head === undefined
      ? undefined
      : scriptTags.find((candidate) => head === candidate || isDescendantOf(candidate, head));

  if (scriptTags.length > (scriptInHead ? 1 : 0)) {
    return unsupported(destination, "found ColorSchemeScript outside the document <head>.");
  }

  const patches: TextPatch[] = [];
  const htmlOpening = html.getOpeningElement();
  if (!hasSpread(htmlOpening, htmlProps.local)) {
    patches.push(insertBeforeTagClose(htmlOpening, ` {...${htmlProps.local}}`));
  }

  if (!scriptInHead) {
    patches.push(addColorSchemeScript(body, head, colorSchemeScript.local));
  }

  if (containingProvider) {
    const opening = containingProvider.getOpeningElement();
    if (!opening.getAttribute("theme")) {
      patches.push(insertBeforeTagClose(opening, ` theme={${theme.local}}`));
    }
  } else {
    patches.push({
      start: children.getStart(),
      end: children.getEnd(),
      text: `<${provider.local} theme={${theme.local}}>{children}</${provider.local}>`,
    });
  }

  const missingCoreBindings = [provider, colorSchemeScript, htmlProps].filter(
    (binding) => binding.missing,
  );
  const imports = newImports(file, input, missingCoreBindings, theme);
  if (imports) patches.push(imports);

  if (patches.length === 0) return emptyResult();

  for (const patch of patches.sort((left, right) => right.start - left.start)) {
    file.replaceText([patch.start, patch.end], patch.text);
  }

  return {
    files: [{ kind: "entry", destination, content: file.getFullText() }],
    instructions: [],
    diagnostics: [],
  };
}

function runtimeBinding(
  file: SourceFile,
  imports: readonly ImportDeclaration[],
  exported: string,
  collisionFallback: string,
): RuntimeBinding {
  for (const declaration of imports) {
    if (declaration.isTypeOnly()) continue;
    const specifier = declaration
      .getNamedImports()
      .find((candidate) => !candidate.isTypeOnly() && candidate.getName() === exported);
    if (specifier) {
      return {
        exported,
        local: specifier.getAliasNode()?.getText() ?? exported,
        missing: false,
      };
    }
  }

  return {
    exported,
    local: uniqueLocal(file, exported, collisionFallback),
    missing: true,
  };
}

function themeBinding(file: SourceFile, moduleSpecifier: string): RuntimeBinding {
  const imports = file
    .getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);
  return runtimeBinding(file, imports, "theme", "manteenTheme");
}

function uniqueLocal(file: SourceFile, preferred: string, fallback: string): string {
  const identifiers = new Set(
    file.getDescendantsOfKind(SyntaxKind.Identifier).map((identifier) => identifier.getText()),
  );
  if (!identifiers.has(preferred)) return preferred;
  if (!identifiers.has(fallback)) return fallback;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${fallback}${suffix}`;
    if (!identifiers.has(candidate)) return candidate;
  }
}

function unboundMantineAnchor(
  file: SourceFile,
  bindings: {
    provider: RuntimeBinding;
    colorSchemeScript: RuntimeBinding;
    htmlProps: RuntimeBinding;
  },
): string | null {
  const tags = file.getDescendants().filter(isJsxTag).map(tagName);
  if (bindings.provider.missing && tags.includes("MantineProvider")) {
    return "MantineProvider is used without a value import from @mantine/core.";
  }
  if (bindings.colorSchemeScript.missing && tags.includes("ColorSchemeScript")) {
    return "ColorSchemeScript is used without a value import from @mantine/core.";
  }
  if (
    bindings.htmlProps.missing &&
    file
      .getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute)
      .some((attribute) => attribute.getExpression().getText() === "mantineHtmlProps")
  ) {
    return "mantineHtmlProps is spread without a value import from @mantine/core.";
  }
  return null;
}

function newImports(
  file: SourceFile,
  input: InitAdapterInput,
  missingCore: readonly RuntimeBinding[],
  theme: RuntimeBinding,
): TextPatch | null {
  const imports: string[] = [];
  const quote = importQuote(file);

  if (!file.getImportDeclaration(MANTINE_STYLES)) {
    imports.push(`import ${quote}${MANTINE_STYLES}${quote};`);
  }

  if (missingCore.length > 0) {
    const specifiers = missingCore.map((binding) =>
      binding.local === binding.exported
        ? binding.exported
        : `${binding.exported} as ${binding.local}`,
    );
    imports.push(`import { ${specifiers.join(", ")} } from ${quote}${MANTINE_CORE}${quote};`);
  }

  if (theme.missing) {
    const specifier = theme.local === theme.exported ? "theme" : `theme as ${theme.local}`;
    imports.push(
      `import { ${specifier} } from ${quote}${input.project.layout.themeImport}${quote};`,
    );
  }

  if (imports.length === 0) return null;

  const declarations = file.getImportDeclarations();
  const lastImport = declarations.at(-1);
  if (lastImport) {
    return {
      start: lastImport.getEnd(),
      end: lastImport.getEnd(),
      text: `\n${imports.join("\n")}`,
    };
  }

  const statements = file.getStatements();
  let position = 0;
  for (const statement of statements) {
    if (!Node.isExpressionStatement(statement)) break;
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) break;
    position = statement.getEnd();
  }

  const prefix = position === 0 ? "" : "\n";
  return { start: position, end: position, text: `${prefix}${imports.join("\n")}\n` };
}

function addColorSchemeScript(
  body: JsxElement,
  head: JsxTag | undefined,
  localName: string,
): TextPatch {
  if (head === undefined) {
    const indent = lineIndent(body);
    const childIndent = `${indent}  `;
    return {
      start: body.getStart(),
      end: body.getStart(),
      text: `<head>\n${childIndent}<${localName} />\n${indent}</head>\n${indent}`,
    };
  }

  if (Node.isJsxSelfClosingElement(head)) {
    return {
      start: head.getStart(),
      end: head.getEnd(),
      text: `<head><${localName} /></head>`,
    };
  }

  const closing = head.getClosingElement();
  const indent = lineIndent(closing);
  const isMultiline = head.getText().includes("\n");
  return {
    start: closing.getStart(),
    end: closing.getStart(),
    text: isMultiline ? `  <${localName} />\n${indent}` : `<${localName} />`,
  };
}

function hasSpread(opening: JsxOpeningElement, expression: string): boolean {
  return opening
    .getAttributes()
    .some(
      (attribute) =>
        Node.isJsxSpreadAttribute(attribute) && attribute.getExpression().getText() === expression,
    );
}

function insertBeforeTagClose(opening: JsxOpeningElement, text: string): TextPatch {
  return { start: opening.getEnd() - 1, end: opening.getEnd() - 1, text };
}

function tagName(node: JsxTag): string {
  return Node.isJsxElement(node)
    ? node.getOpeningElement().getTagNameNode().getText()
    : node.getTagNameNode().getText();
}

function isJsxTag(node: Node): node is JsxTag {
  return Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node);
}

function isDescendantOf(node: Node, ancestor: Node): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    if (parent === ancestor) return true;
  }
  return false;
}

function lineIndent(node: Node): string {
  const source = node.getSourceFile().getFullText();
  const lineStart = source.lastIndexOf("\n", node.getStart()) + 1;
  const prefix = source.slice(lineStart, node.getStart());
  return /^\s*$/.test(prefix) ? prefix : "";
}

function importQuote(file: SourceFile): '"' | "'" {
  const declaration = file.getImportDeclarations()[0];
  return declaration?.getModuleSpecifier().getText().startsWith("'") ? "'" : '"';
}

function unsupported(destination: string, detail: string): InitAdapterResult {
  return {
    files: [],
    instructions: [],
    diagnostics: [initSourceUnsupported(destination, detail)],
  };
}

function emptyResult(): InitAdapterResult {
  return { files: [], instructions: [], diagnostics: [] };
}
