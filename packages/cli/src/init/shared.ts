/** Pure W6 planners for files shared by every framework adapter. */
import { join, relative, sep } from "node:path";

import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  ScriptKind,
  SyntaxKind,
} from "ts-morph";
import {
  HOUSE_REGISTRY_INDEX_URL,
  HOUSE_REGISTRY_ITEM_URL,
  houseRegistrySource,
} from "../config/defaults";
import type { Diagnostic } from "../plan/types";
import { initConfigConflict } from "./diagnostics";
import { VITE_CONFIG_PATHS } from "./framework-paths";
import { planPostcss } from "./postcss";
import { INIT_STYLES_SOURCE } from "./styles";
import type {
  InitFrameworkSet,
  InitInstruction,
  InitProjectSnapshot,
  InitProposedFile,
} from "./types";
import { INIT_ALIASES } from "./types";

export const INIT_THEME_SOURCE = `import { createTheme } from "@mantine/core";

export const theme = createTheme({});
`;

export interface InitSharedResult {
  files: InitProposedFile[];
  instructions: InitInstruction[];
  diagnostics: Diagnostic[];
}

function posixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

function jsonObject(source: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(source);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function propertyName(property: PropertyAssignment): string {
  const node = property.getNameNode();
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralText()
    : node.getText();
}

function property(object: ObjectLiteralExpression, name: string): PropertyAssignment | null {
  const found = object
    .getProperties()
    .find((candidate) => Node.isPropertyAssignment(candidate) && propertyName(candidate) === name);
  return found && Node.isPropertyAssignment(found) ? found : null;
}

function objectInitializer(assignment: PropertyAssignment): ObjectLiteralExpression | null {
  const initializer = assignment.getInitializer();
  return initializer && Node.isObjectLiteralExpression(initializer) ? initializer : null;
}

function desiredConfig(project: InitProjectSnapshot): Record<string, unknown> {
  return {
    $schema: "./node_modules/manteen/schema/manteen.schema.json",
    registries: { "@house": houseRegistrySource() },
    aliases: INIT_ALIASES,
    theme: posixRelative(project.layout.root, project.layout.themePath),
    styles: posixRelative(project.layout.root, project.layout.stylesPath),
    tsconfig: posixRelative(project.layout.root, project.layout.tsconfigPath),
  };
}

type ConfigCompatibility = { ok: true; content: string | null } | { ok: false; detail: string };

function serializedJson(parsed: Record<string, unknown>, source: string): string {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const trailingLineEnding = source.endsWith("\r\n") ? "\r\n" : source.endsWith("\n") ? "\n" : "";
  const indent = /\r?\n([ \t]+)"/.exec(source)?.[1] ?? (source.includes("\n") ? 2 : 0);
  const json = JSON.stringify(parsed, null, indent);
  return `${lineEnding === "\n" ? json : json.replaceAll("\n", lineEnding)}${trailingLineEnding}`;
}

function compatibleConfig(source: string, expected: Record<string, unknown>): ConfigCompatibility {
  const parsed = jsonObject(source);
  if (parsed === null) return { ok: false, detail: "the existing file is not a JSON object" };

  const registries = parsed.registries;
  if (typeof registries !== "object" || registries === null || Array.isArray(registries)) {
    return { ok: false, detail: "registries is not an object" };
  }
  const registryMap = registries as Record<string, unknown>;
  const house = registryMap["@house"];
  let migrateConfig = false;
  if (house === HOUSE_REGISTRY_ITEM_URL) {
    registryMap["@house"] = houseRegistrySource();
    migrateConfig = true;
  } else if (typeof house === "object" && house !== null && !Array.isArray(house)) {
    const sourceObject = house as Record<string, unknown>;
    if (sourceObject.url !== HOUSE_REGISTRY_ITEM_URL) {
      return {
        ok: false,
        detail: `registries.@house.url is not ${JSON.stringify(HOUSE_REGISTRY_ITEM_URL)}`,
      };
    }
    if (sourceObject.index === undefined) {
      sourceObject.index = HOUSE_REGISTRY_INDEX_URL;
      migrateConfig = true;
    } else if (sourceObject.index !== HOUSE_REGISTRY_INDEX_URL) {
      return {
        ok: false,
        detail: `registries.@house.index is not ${JSON.stringify(HOUSE_REGISTRY_INDEX_URL)}`,
      };
    }
  } else {
    return {
      ok: false,
      detail: "registries.@house is neither the legacy item URL nor a registry source object",
    };
  }

  for (const key of ["aliases", "theme"] as const) {
    if (JSON.stringify(parsed[key]) !== JSON.stringify(expected[key])) {
      return { ok: false, detail: `${key} differs from the detected project layout` };
    }
  }

  if (parsed.styles === undefined) {
    parsed.styles = expected.styles;
    migrateConfig = true;
  } else if (parsed.styles !== expected.styles) {
    return { ok: false, detail: "styles differs from the detected project layout" };
  }

  const expectedTsconfig = expected.tsconfig;
  const authoredTsconfig = parsed.tsconfig ?? "tsconfig.json";
  if (authoredTsconfig !== expectedTsconfig) {
    return { ok: false, detail: "tsconfig differs from the detected application tsconfig" };
  }

  return { ok: true, content: migrateConfig ? serializedJson(parsed, source) : null };
}

function planConfig(project: InitProjectSnapshot): InitSharedResult {
  const destination = project.layout.configPath;
  const existing = project.files.get(destination);
  const expected = desiredConfig(project);

  if (existing === undefined) {
    return {
      files: [
        {
          kind: "manteen-config",
          destination,
          content: `${JSON.stringify(expected, null, 2)}\n`,
        },
      ],
      instructions: [],
      diagnostics: [],
    };
  }

  const compatible = compatibleConfig(existing, expected);
  return compatible.ok
    ? {
        files:
          compatible.content === null
            ? []
            : [{ kind: "manteen-config", destination, content: compatible.content }],
        instructions: [],
        diagnostics: [],
      }
    : {
        files: [],
        instructions: [],
        diagnostics: [initConfigConflict(destination, compatible.detail)],
      };
}

function createSource(path: string, source: string, scriptKind: ScriptKind) {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  return project.createSourceFile(path, source, { overwrite: true, scriptKind });
}

function themeIsMergeable(path: string, source: string): boolean {
  const file = createSource(path, source, ScriptKind.TS);
  const declaration = file.getVariableDeclaration("theme");
  if (declaration === undefined) return false;

  const statement = declaration.getVariableStatement();
  const directlyExported = statement?.isExported() === true;
  const separatelyExported = file
    .getExportDeclarations()
    .some((entry) =>
      entry
        .getNamedExports()
        .some(
          (named) => named.getName() === "theme" || named.getAliasNode()?.getText() === "theme",
        ),
    );
  if (!directlyExported && !separatelyExported) return false;

  const initializer = declaration.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) return false;
  const expression = initializer.getExpression();
  if (!Node.isIdentifier(expression)) return false;

  return file
    .getImportDeclarations()
    .some(
      (entry) =>
        entry.getModuleSpecifierValue() === "@mantine/core" &&
        entry
          .getNamedImports()
          .some(
            (named) =>
              named.getName() === "createTheme" &&
              (named.getAliasNode()?.getText() ?? "createTheme") === expression.getText(),
          ),
    );
}

function planTheme(project: InitProjectSnapshot): InitSharedResult {
  const destination = project.layout.themePath;
  const existing = project.files.get(destination);
  if (existing === undefined) {
    return {
      files: [{ kind: "theme", destination, content: INIT_THEME_SOURCE }],
      instructions: [],
      diagnostics: [],
    };
  }
  if (themeIsMergeable(destination, existing)) {
    return { files: [], instructions: [], diagnostics: [] };
  }
  return {
    files: [],
    instructions: [],
    diagnostics: [
      initConfigConflict(
        destination,
        "the theme must export a named `theme` created by `createTheme` from @mantine/core",
      ),
    ],
  };
}

function planStyles(project: InitProjectSnapshot): InitSharedResult {
  const destination = project.layout.stylesPath;
  const existing = project.files.get(destination);
  const configSource = project.files.get(project.layout.configPath);
  const expectedPath = posixRelative(project.layout.root, destination);
  const parsedConfig = configSource === undefined ? null : jsonObject(configSource);
  const alreadyOwned = parsedConfig?.styles === expectedPath;
  const conflictingConfig =
    parsedConfig !== null && parsedConfig.styles !== undefined && !alreadyOwned;

  // planConfig owns the diagnostic for a conflicting path or malformed file.
  if (conflictingConfig || (configSource !== undefined && parsedConfig === null)) {
    return { files: [], instructions: [], diagnostics: [] };
  }

  if (existing === undefined) {
    return {
      files: [{ kind: "styles", destination, content: INIT_STYLES_SOURCE }],
      instructions: [],
      diagnostics: [],
    };
  }

  // A project that already declares this path has explicitly accepted
  // Manteen ownership; its receipt/planner, not init, validates generated bytes.
  if (alreadyOwned || existing === INIT_STYLES_SOURCE) {
    return { files: [], instructions: [], diagnostics: [] };
  }

  return {
    files: [],
    instructions: [],
    diagnostics: [
      initConfigConflict(
        destination,
        "the detected managed stylesheet path already contains unknown bytes; move them to the host stylesheet before init adopts this path",
      ),
    ],
  };
}

function expectedPathsTarget(project: InitProjectSnapshot): string {
  const source = posixRelative(project.layout.root, project.layout.sourceRoot);
  return source === "" ? "./*" : `./${source}/*`;
}

function staticStringArray(
  assignment: PropertyAssignment,
): { ok: true; values: string[] } | { ok: false } {
  const initializer = assignment.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) return { ok: false };
  const values: string[] = [];
  for (const element of initializer.getElements()) {
    if (!Node.isStringLiteral(element) && !Node.isNoSubstitutionTemplateLiteral(element)) {
      return { ok: false };
    }
    values.push(element.getLiteralText());
  }
  return { ok: true, values };
}

function equivalentPathTarget(actual: string, expected: string): boolean {
  const normalize = (value: string): string => value.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalize(actual) === normalize(expected);
}

function planTsconfig(project: InitProjectSnapshot): InitSharedResult {
  const destination = project.layout.tsconfigPath;
  const source = project.files.get(destination);
  if (source === undefined) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "the detected application tsconfig is absent")],
    };
  }

  const file = createSource(destination, source, ScriptKind.JSON);
  const root = file.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  if (root === undefined) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "the tsconfig root is not a JSON object")],
    };
  }

  let compilerAssignment = property(root, "compilerOptions");
  if (compilerAssignment === null) {
    root.addPropertyAssignment({ name: '"compilerOptions"', initializer: "{}" });
    compilerAssignment = property(root, "compilerOptions");
  }
  const compiler = compilerAssignment ? objectInitializer(compilerAssignment) : null;
  if (compiler === null) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "compilerOptions is not a static object")],
    };
  }

  let pathsAssignment = property(compiler, "paths");
  if (pathsAssignment === null) {
    compiler.addPropertyAssignment({ name: '"paths"', initializer: "{}" });
    pathsAssignment = property(compiler, "paths");
  }
  const paths = pathsAssignment ? objectInitializer(pathsAssignment) : null;
  if (paths === null) {
    return {
      files: [],
      instructions: [],
      diagnostics: [
        initConfigConflict(destination, "compilerOptions.paths is not a static object"),
      ],
    };
  }

  const expected = expectedPathsTarget(project);
  const alias = property(paths, "@/*");
  if (alias === null) {
    paths.addPropertyAssignment({ name: '"@/*"', initializer: `[${JSON.stringify(expected)}]` });
  } else {
    const values = staticStringArray(alias);
    if (
      !values.ok ||
      values.values.length !== 1 ||
      !equivalentPathTarget(values.values[0]!, expected)
    ) {
      return {
        files: [],
        instructions: [],
        diagnostics: [
          initConfigConflict(
            destination,
            `compilerOptions.paths["@/*"] must resolve to ${JSON.stringify(expected)}`,
          ),
        ],
      };
    }
  }

  const content = file.getFullText();
  return {
    files: content === source ? [] : [{ kind: "tsconfig", destination, content }],
    instructions: [],
    diagnostics: [],
  };
}

function configObject(call: CallExpression): ObjectLiteralExpression | null {
  const expression = call.getExpression();
  if (!Node.isIdentifier(expression) || expression.getText() !== "defineConfig") return null;
  const first = call.getArguments()[0];
  return first && Node.isObjectLiteralExpression(first) ? first : null;
}

function planViteConfig(project: InitProjectSnapshot): InitSharedResult {
  const present = VITE_CONFIG_PATHS.map((path) => join(project.layout.root, path)).filter((path) =>
    project.files.has(path),
  );
  const destination = present[0] ?? join(project.layout.root, "vite.config.ts");
  if (present.length > 1) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "multiple Vite configs are present")],
    };
  }
  const source = project.files.get(destination);
  if (source === undefined) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "the active Vite config is absent")],
    };
  }

  const kind = destination.endsWith(".ts") ? ScriptKind.TS : ScriptKind.JS;
  const file = createSource(destination, source, kind);
  const exported = file.getExportAssignments().find((entry) => !entry.isExportEquals());
  const expression = exported?.getExpression();
  const config =
    expression && Node.isCallExpression(expression)
      ? configObject(expression)
      : expression && Node.isObjectLiteralExpression(expression)
        ? expression
        : null;
  if (config === null) {
    return {
      files: [],
      instructions: [],
      diagnostics: [
        initConfigConflict(
          destination,
          "the default Vite configuration is not a static object or defineConfig object",
        ),
      ],
    };
  }

  let resolveAssignment = property(config, "resolve");
  if (resolveAssignment === null) {
    config.addPropertyAssignment({ name: "resolve", initializer: "{}" });
    resolveAssignment = property(config, "resolve");
  }
  const resolveConfig = resolveAssignment ? objectInitializer(resolveAssignment) : null;
  if (resolveConfig === null) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "resolve is not a static object")],
    };
  }

  const tsconfigPaths = property(resolveConfig, "tsconfigPaths");
  if (tsconfigPaths === null) {
    resolveConfig.addPropertyAssignment({ name: "tsconfigPaths", initializer: "true" });
  } else if (tsconfigPaths.getInitializer()?.getKindName() !== "TrueKeyword") {
    return {
      files: [],
      instructions: [],
      diagnostics: [
        initConfigConflict(destination, "resolve.tsconfigPaths is explicitly not true"),
      ],
    };
  }

  const content = file.getFullText();
  return {
    files: content === source ? [] : [{ kind: "framework-config", destination, content }],
    instructions: [],
    diagnostics: [],
  };
}

function manualInstruction(project: InitProjectSnapshot): InitInstruction {
  return {
    code: "manual-framework",
    required: true,
    path: project.layout.sourceRoot,
    message: `Mount MantineProvider with the exported @/lib/theme, import @mantine/core/styles.css, then import ${posixRelative(project.layout.root, project.layout.stylesPath)}, then import your host stylesheet. Add ColorSchemeScript only when this framework renders the document on the server.`,
  };
}

/**
 * Compose shared proposals without hashing or reading disk. A blocking result is
 * still returned in full; `planInit` owns the all-or-nothing zero-mutation rule.
 */
export function planShared(
  project: InitProjectSnapshot,
  framework: InitFrameworkSet,
): InitSharedResult {
  const results = [
    planConfig(project),
    planTheme(project),
    planStyles(project),
    planTsconfig(project),
  ];
  if (framework.kind === "vite" || framework.kind === "react-router") {
    results.push(planViteConfig(project));
  }
  results.push(planPostcss(project, framework));

  return {
    files: results.flatMap((result) => result.files),
    instructions: [
      ...results.flatMap((result) => result.instructions),
      ...(framework.kind === "manual" ? [manualInstruction(project)] : []),
    ],
    diagnostics: results.flatMap((result) => result.diagnostics),
  };
}
