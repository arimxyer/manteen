import { Node, Project, SyntaxKind } from "ts-morph";

const MANTINE_CORE = "@mantine/core";

export interface ThemeFragmentImportFailure {
  code: "theme-fragment-import-source" | "theme-fragment-import-form";
  item: string;
  path: string;
  source: string;
  bindings: string[];
  message: string;
}

export class ThemeFragmentImportError extends Error {
  readonly failures: ThemeFragmentImportFailure[];

  constructor(failures: ThemeFragmentImportFailure[]) {
    super(
      `Theme fragment import validation failed:\n${failures
        .map((failure) => `  ${failure.item} (${failure.path}): ${failure.message}`)
        .join("\n")}`,
    );
    this.name = "ThemeFragmentImportError";
    this.failures = failures;
  }
}

/**
 * Theme fragments are merged as object syntax, not installed as modules. The
 * consumer can reconstruct the direct `createTheme(...)` wrapper and component
 * imports used as direct entries under `components`; every other import would
 * leave a copied initializer referring to an identifier the consumer file does
 * not define.
 */
export function inspectThemeFragmentImports(
  source: string,
  item: string,
  path: string,
): ThemeFragmentImportFailure[] {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const file = project.createSourceFile("theme-fragment.ts", source, { overwrite: true });
  const failures: ThemeFragmentImportFailure[] = [];

  for (const declaration of file.getImportDeclarations()) {
    const module = declaration.getModuleSpecifierValue();
    const bindings = [
      ...(declaration.getDefaultImport()?.getText()
        ? [declaration.getDefaultImport()!.getText()]
        : []),
      ...(declaration.getNamespaceImport()?.getText()
        ? [declaration.getNamespaceImport()!.getText()]
        : []),
      ...declaration.getNamedImports().map((named) => named.getText()),
    ];
    if (module !== MANTINE_CORE) {
      failures.push({
        code: "theme-fragment-import-source",
        item,
        path,
        source: module,
        bindings,
        message: `imports ${bindings.join(", ") || "for side effects"} from ${JSON.stringify(module)}, but merged theme fragments can import only unaliased named bindings from ${MANTINE_CORE}. Move custom component defaults into the installed component or expose a consumer-owned theme edit.`,
      });
      continue;
    }

    const unsupported = [
      ...(declaration.getDefaultImport() ? [declaration.getDefaultImport()!.getText()] : []),
      ...(declaration.getNamespaceImport() ? [declaration.getNamespaceImport()!.getText()] : []),
      ...declaration
        .getNamedImports()
        .filter(
          (named) =>
            named.isTypeOnly() ||
            (named.getAliasNode() !== undefined &&
              named.getAliasNode()?.getText() !== named.getName()),
        )
        .map((named) => named.getText()),
    ];
    if (declaration.isTypeOnly())
      unsupported.push(...declaration.getNamedImports().map((named) => named.getText()));
    if (unsupported.length > 0) {
      failures.push({
        code: "theme-fragment-import-form",
        item,
        path,
        source: module,
        bindings: [...new Set(unsupported)].sort(),
        message: `uses unsupported import bindings (${[...new Set(unsupported)].sort().join(", ")}); merged theme fragments support only unaliased runtime named imports from ${MANTINE_CORE}.`,
      });
    }

    const unreconstructable = declaration
      .getNamedImports()
      .filter((named) => !unsupported.includes(named.getText()))
      .filter((named) => {
        const nameNode = named.getNameNode();
        if (!Node.isIdentifier(nameNode)) return true;
        const references = nameNode
          .findReferencesAsNodes()
          .filter(
            (reference) =>
              reference.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) === undefined,
          );
        return references.some((reference) => {
          const parent = reference.getParent();
          if (named.getName() === "createTheme") {
            return !(Node.isCallExpression(parent) && parent.getExpression() === reference);
          }
          return !(
            Node.isPropertyAccessExpression(parent) &&
            parent.getExpression() === reference &&
            parent.getName() === "extend" &&
            isDirectThemeComponentExtend(parent)
          );
        });
      })
      .map((named) => named.getName());
    if (unreconstructable.length > 0) {
      unreconstructable.sort();
      failures.push({
        code: "theme-fragment-import-form",
        item,
        path,
        source: module,
        bindings: unreconstructable,
        message: `uses ${unreconstructable.join(", ")} outside the mergeable createTheme(...) or components.Component.extend(...) boundary; the consumer merger cannot reconstruct those identifiers.`,
      });
    }
  }

  return failures;
}

function isDirectThemeComponentExtend(access: Node): boolean {
  const extendCall = access.getParent();
  if (!Node.isCallExpression(extendCall)) return false;
  const componentEntry = extendCall.getParent();
  if (!Node.isPropertyAssignment(componentEntry)) return false;
  const componentsObject = componentEntry.getParent();
  if (!Node.isObjectLiteralExpression(componentsObject)) return false;
  const componentsProperty = componentsObject.getParent();
  if (
    !Node.isPropertyAssignment(componentsProperty) ||
    componentsProperty.getName() !== "components"
  ) {
    return false;
  }
  const themeObject = componentsProperty.getParent();
  if (!Node.isObjectLiteralExpression(themeObject)) return false;
  const createThemeCall = themeObject.getParent();
  return (
    Node.isCallExpression(createThemeCall) &&
    createThemeCall.getExpression().getText() === "createTheme"
  );
}
