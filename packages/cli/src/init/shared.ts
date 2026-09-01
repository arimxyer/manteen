/** Pure W6 planners for files shared by every framework adapter. */
import { dirname, join, relative, sep } from "node:path";

import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  ScriptKind,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  HOUSE_REGISTRY_INDEX_URL,
  HOUSE_REGISTRY_ITEM_URL,
  houseRegistrySource,
} from "../config/defaults";
import type { Diagnostic } from "../plan/types";
import { type InitConfigIssue, initConfigConflict, initConfigIssue } from "./diagnostics";
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

type ConfigCompatibility =
  | { ok: true; content: string | null }
  | { ok: false; issue: InitConfigIssue };

function serializedJson(parsed: Record<string, unknown>, source: string): string {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const trailingLineEnding = source.endsWith("\r\n") ? "\r\n" : source.endsWith("\n") ? "\n" : "";
  const indent = /\r?\n([ \t]+)"/.exec(source)?.[1] ?? (source.includes("\n") ? 2 : 0);
  const json = JSON.stringify(parsed, null, indent);
  return `${lineEnding === "\n" ? json : json.replaceAll("\n", lineEnding)}${trailingLineEnding}`;
}

function compatibleConfig(source: string, expected: Record<string, unknown>): ConfigCompatibility {
  const parsed = jsonObject(source);
  if (parsed === null) {
    return {
      ok: false,
      issue: {
        kind: "invalid-shape",
        field: "configuration",
        detail: "the existing file is not a JSON object",
      },
    };
  }

  const registries = parsed.registries;
  if (registries === undefined) {
    return {
      ok: false,
      issue: {
        kind: "missing-field",
        field: "`registries`",
        detail: "init will not create the registry map inside an existing config without review.",
        patch: { registries: expected.registries },
      },
    };
  }
  if (typeof registries !== "object" || registries === null || Array.isArray(registries)) {
    return {
      ok: false,
      issue: {
        kind: "invalid-shape",
        field: "`registries`",
        detail: "the value is not an object",
      },
    };
  }

  const registryMap = registries as Record<string, unknown>;
  const house = registryMap["@house"];
  let migrateConfig = false;
  if (house === undefined) {
    registryMap["@house"] = houseRegistrySource();
    migrateConfig = true;
  } else if (house === HOUSE_REGISTRY_ITEM_URL) {
    registryMap["@house"] = houseRegistrySource();
    migrateConfig = true;
  } else if (typeof house === "object" && house !== null && !Array.isArray(house)) {
    const sourceObject = house as Record<string, unknown>;
    if (sourceObject.url !== HOUSE_REGISTRY_ITEM_URL) {
      return {
        ok: false,
        issue: {
          kind: "conflicting-field",
          field: "`registries.@house.url`",
          detail: `expected ${JSON.stringify(HOUSE_REGISTRY_ITEM_URL)}`,
        },
      };
    }
    if (sourceObject.index === undefined) {
      sourceObject.index = HOUSE_REGISTRY_INDEX_URL;
      migrateConfig = true;
    } else if (sourceObject.index !== HOUSE_REGISTRY_INDEX_URL) {
      return {
        ok: false,
        issue: {
          kind: "conflicting-field",
          field: "`registries.@house.index`",
          detail: `expected ${JSON.stringify(HOUSE_REGISTRY_INDEX_URL)}`,
        },
      };
    }
  } else {
    return {
      ok: false,
      issue: {
        kind: "conflicting-field",
        field: "`registries.@house`",
        detail: "the value is neither the legacy item URL nor a registry source object",
      },
    };
  }

  if (parsed.aliases === undefined) {
    return {
      ok: false,
      issue: {
        kind: "missing-field",
        field: "`aliases`",
        detail: "aliases select the destinations for future registry source and need review.",
        patch: { aliases: expected.aliases },
      },
    };
  }
  if (JSON.stringify(parsed.aliases) !== JSON.stringify(expected.aliases)) {
    return {
      ok: false,
      issue: {
        kind: "conflicting-field",
        field: "`aliases`",
        detail: "the value differs from the detected project layout",
      },
    };
  }

  if (parsed.theme === undefined) {
    parsed.theme = expected.theme;
    migrateConfig = true;
  } else if (parsed.theme !== expected.theme) {
    return {
      ok: false,
      issue: {
        kind: "conflicting-field",
        field: "`theme`",
        detail: "the value differs from the detected project layout",
      },
    };
  }

  if (parsed.styles === undefined) {
    parsed.styles = expected.styles;
    migrateConfig = true;
  } else if (parsed.styles !== expected.styles) {
    return {
      ok: false,
      issue: {
        kind: "conflicting-field",
        field: "`styles`",
        detail: "the value differs from the detected project layout",
      },
    };
  }

  const expectedTsconfig = expected.tsconfig;
  const authoredTsconfig = parsed.tsconfig ?? "tsconfig.json";
  if (authoredTsconfig !== expectedTsconfig) {
    if (parsed.tsconfig === undefined) {
      return {
        ok: false,
        issue: {
          kind: "missing-field",
          field: "`tsconfig`",
          detail: "the detected application config is not the default tsconfig.json.",
          patch: { tsconfig: expectedTsconfig },
        },
      };
    }
    return {
      ok: false,
      issue: {
        kind: "conflicting-field",
        field: "`tsconfig`",
        detail: "the value differs from the detected application config",
      },
    };
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
        diagnostics: [initConfigIssue(destination, compatible.issue)],
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

function nodeUrlBinding(file: SourceFile, imported: string, local: string): boolean {
  return file
    .getImportDeclarations()
    .some(
      (declaration) =>
        !declaration.isTypeOnly() &&
        declaration.getModuleSpecifierValue() === "node:url" &&
        declaration
          .getNamedImports()
          .some(
            (named) =>
              !named.isTypeOnly() &&
              named.getName() === imported &&
              (named.getAliasNode()?.getText() ?? named.getName()) === local,
          ),
    );
}

function existingNodeUrlBinding(file: SourceFile, imported: string): string | null {
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.isTypeOnly() || declaration.getModuleSpecifierValue() !== "node:url") continue;
    const binding = declaration
      .getNamedImports()
      .find((named) => !named.isTypeOnly() && named.getName() === imported);
    if (binding) return binding.getAliasNode()?.getText() ?? binding.getName();
  }
  return null;
}

function portableViteAlias(
  file: SourceFile,
  assignment: PropertyAssignment,
  target: string,
): boolean {
  const initializer = assignment.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) return false;
  const fileUrlCallee = initializer.getExpression();
  if (!Node.isIdentifier(fileUrlCallee)) return false;
  const [urlArgument] = initializer.getArguments();
  if (!urlArgument || !Node.isNewExpression(urlArgument)) return false;
  const urlCallee = urlArgument.getExpression();
  if (!Node.isIdentifier(urlCallee)) return false;
  const [pathArgument, baseArgument] = urlArgument.getArguments();
  if (
    !pathArgument ||
    (!Node.isStringLiteral(pathArgument) && !Node.isNoSubstitutionTemplateLiteral(pathArgument)) ||
    pathArgument.getLiteralText() !== target ||
    baseArgument?.getText() !== "import.meta.url"
  ) {
    return false;
  }
  return (
    nodeUrlBinding(file, "fileURLToPath", fileUrlCallee.getText()) &&
    nodeUrlBinding(file, "URL", urlCallee.getText())
  );
}

function unusedIdentifier(file: SourceFile, preferred: string): string {
  const used = new Set(
    file.getDescendantsOfKind(SyntaxKind.Identifier).map((identifier) => identifier.getText()),
  );
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}${suffix}`)) suffix += 1;
  return `${preferred}${suffix}`;
}

function viteAliasTarget(project: InitProjectSnapshot, destination: string): string {
  const target = posixRelative(dirname(destination), project.layout.sourceRoot);
  return target === "" ? "." : target.startsWith(".") ? target : `./${target}`;
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

  let aliasAssignment = property(resolveConfig, "alias");
  if (aliasAssignment === null) {
    resolveConfig.addPropertyAssignment({ name: "alias", initializer: "{}" });
    aliasAssignment = property(resolveConfig, "alias");
  }
  const aliases = aliasAssignment ? objectInitializer(aliasAssignment) : null;
  if (aliases === null) {
    return {
      files: [],
      instructions: [],
      diagnostics: [initConfigConflict(destination, "resolve.alias is not a static object")],
    };
  }

  const target = viteAliasTarget(project, destination);
  const existingAlias = property(aliases, "@");
  if (existingAlias !== null) {
    if (!portableViteAlias(file, existingAlias, target)) {
      return {
        files: [],
        instructions: [],
        diagnostics: [
          initConfigConflict(
            destination,
            `resolve.alias["@"] must resolve to ${JSON.stringify(target)} from import.meta.url`,
          ),
        ],
      };
    }
  } else {
    const existingFileUrlName = existingNodeUrlBinding(file, "fileURLToPath");
    const existingUrlName = existingNodeUrlBinding(file, "URL");
    const fileUrlName = existingFileUrlName ?? unusedIdentifier(file, "fileURLToPath");
    const urlName = existingUrlName ?? unusedIdentifier(file, "URL");
    const namedImports = [
      ...(existingFileUrlName === null
        ? [
            {
              name: "fileURLToPath",
              ...(fileUrlName === "fileURLToPath" ? {} : { alias: fileUrlName }),
            },
          ]
        : []),
      ...(existingUrlName === null
        ? [{ name: "URL", ...(urlName === "URL" ? {} : { alias: urlName }) }]
        : []),
    ];
    if (namedImports.length > 0) {
      file.addImportDeclaration({ moduleSpecifier: "node:url", namedImports });
    }
    aliases.addPropertyAssignment({
      name: '"@"',
      initializer: `${fileUrlName}(new ${urlName}(${JSON.stringify(target)}, import.meta.url))`,
    });
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
