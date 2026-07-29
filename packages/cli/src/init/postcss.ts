/** Pure PostCSS create-or-patch planner over `InitProjectSnapshot.files`. */
import { join } from "node:path";

import {
  type Expression,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  ScriptKind,
  SyntaxKind,
} from "ts-morph";

import type { Diagnostic } from "../plan/types";
import { initConfigConflict, initPostcssUnsupported } from "./diagnostics";
import type {
  InitFrameworkSet,
  InitInstruction,
  InitProjectSnapshot,
  InitProposedFile,
} from "./types";

export const MANTINE_BREAKPOINTS = {
  "mantine-breakpoint-xs": "36em",
  "mantine-breakpoint-sm": "48em",
  "mantine-breakpoint-md": "62em",
  "mantine-breakpoint-lg": "75em",
  "mantine-breakpoint-xl": "88em",
} as const;

export const MANTINE_POSTCSS_SNIPPET = `"postcss-preset-mantine": {},
"postcss-simple-vars": {
  variables: {
    "mantine-breakpoint-xs": "36em",
    "mantine-breakpoint-sm": "48em",
    "mantine-breakpoint-md": "62em",
    "mantine-breakpoint-lg": "75em",
    "mantine-breakpoint-xl": "88em",
  },
}`;

const NEW_CONFIG = `module.exports = {
  plugins: {
    ${MANTINE_POSTCSS_SNIPPET.split("\n").join("\n    ")},
  },
};
`;

const GENERIC_CANDIDATES = [
  "package.json",
  ".postcssrc",
  ".postcssrc.json",
  ".postcssrc.yaml",
  ".postcssrc.yml",
  ".postcssrc.ts",
  ".postcssrc.cts",
  ".postcssrc.mts",
  ".postcssrc.js",
  ".postcssrc.cjs",
  ".postcssrc.mjs",
  "postcss.config.ts",
  "postcss.config.cts",
  "postcss.config.mts",
  "postcss.config.js",
  "postcss.config.cjs",
  "postcss.config.mjs",
] as const;

// Verified against Next 16.2.12's findConfigPath. The differing mjs/cjs order
// is the reason this list is not shared with postcss-load-config's.
const NEXT_CANDIDATES = [
  "package.json",
  ".postcssrc.json",
  "postcss.config.json",
  ".postcssrc.js",
  "postcss.config.js",
  "postcss.config.mjs",
  "postcss.config.cjs",
] as const;

export interface InitPostcssResult {
  files: InitProposedFile[];
  instructions: InitInstruction[];
  diagnostics: Diagnostic[];
}

interface LocatedConfig {
  path: string;
  relative: string;
  source: string;
  kind: "package-json" | "json" | "module" | "unsupported";
}

function isNext(framework: InitFrameworkSet): boolean {
  return (
    framework.kind === "next-app" ||
    framework.kind === "next-pages" ||
    framework.kind === "next-hybrid"
  );
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

function locate(project: InitProjectSnapshot, framework: InitFrameworkSet): LocatedConfig | null {
  const candidates = isNext(framework) ? NEXT_CANDIDATES : GENERIC_CANDIDATES;

  for (const relative of candidates) {
    const path = join(project.layout.root, relative);
    const source = project.files.get(path);
    if (source === undefined) continue;

    if (relative === "package.json") {
      const parsed = jsonObject(source);
      if (parsed === null || !("postcss" in parsed)) continue;
      return { path, relative, source, kind: "package-json" };
    }
    if (relative.endsWith(".json") || relative === ".postcssrc") {
      return { path, relative, source, kind: "json" };
    }
    if (relative.endsWith(".yaml") || relative.endsWith(".yml")) {
      return { path, relative, source, kind: "unsupported" };
    }
    return { path, relative, source, kind: "module" };
  }
  return null;
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

function unwrap(expression: Expression): Expression {
  let current = expression;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function resolveObject(
  sourceFile: ReturnType<Project["createSourceFile"]>,
): ObjectLiteralExpression | null {
  const exported = sourceFile
    .getExportAssignments()
    .find((assignment) => !assignment.isExportEquals());
  let expression: Expression | undefined = exported?.getExpression();

  if (expression === undefined) {
    const binary = sourceFile
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .find(
        (candidate) =>
          candidate.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
          candidate.getLeft().getText() === "module.exports",
      );
    expression = binary?.getRight();
  }
  if (expression === undefined) return null;

  const candidate = unwrap(expression);
  if (Node.isObjectLiteralExpression(candidate)) return candidate;
  if (!Node.isIdentifier(candidate)) return null;

  const declaration = sourceFile.getVariableDeclaration(candidate.getText());
  if (!declaration || !Node.isVariableDeclaration(declaration)) return null;
  const initializer = declaration.getInitializer();
  if (!initializer) return null;
  const resolved = unwrap(initializer);
  return Node.isObjectLiteralExpression(resolved) ? resolved : null;
}

type PatchResult =
  | { ok: true; changed: boolean }
  | { ok: false; kind: "conflict" | "unsupported"; detail: string };

function patchPluginObject(plugins: ObjectLiteralExpression): PatchResult {
  if (property(plugins, "@tailwindcss/postcss") !== null) return { ok: true, changed: false };

  let changed = false;
  if (property(plugins, "postcss-preset-mantine") === null) {
    plugins.addPropertyAssignment({ name: '"postcss-preset-mantine"', initializer: "{}" });
    changed = true;
  }

  const simple = property(plugins, "postcss-simple-vars");
  if (simple === null) {
    plugins.addPropertyAssignment({
      name: '"postcss-simple-vars"',
      initializer: `{ variables: ${JSON.stringify(MANTINE_BREAKPOINTS, null, 2)} }`,
    });
    return { ok: true, changed: true };
  }

  const simpleOptions = objectInitializer(simple);
  if (simpleOptions === null) {
    return {
      ok: false,
      kind: "conflict",
      detail: "postcss-simple-vars already has non-object options",
    };
  }
  const variables = property(simpleOptions, "variables");
  if (variables === null) {
    simpleOptions.addPropertyAssignment({
      name: "variables",
      initializer: JSON.stringify(MANTINE_BREAKPOINTS, null, 2),
    });
    return { ok: true, changed: true };
  }

  const values = objectInitializer(variables);
  if (values === null) {
    return {
      ok: false,
      kind: "conflict",
      detail: "postcss-simple-vars.variables is not an object",
    };
  }
  for (const [name, expected] of Object.entries(MANTINE_BREAKPOINTS)) {
    const existing = property(values, name);
    if (existing === null) {
      values.addPropertyAssignment({
        name: JSON.stringify(name),
        initializer: JSON.stringify(expected),
      });
      changed = true;
      continue;
    }
    const initializer = existing.getInitializer();
    const actual =
      initializer &&
      (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer))
        ? initializer.getLiteralText()
        : null;
    if (actual !== expected) {
      return {
        ok: false,
        kind: "conflict",
        detail: `${name} is already ${initializer?.getText() ?? "missing"}, expected ${JSON.stringify(expected)}`,
      };
    }
  }
  return { ok: true, changed };
}

function pluginsObject(
  config: ObjectLiteralExpression,
): ObjectLiteralExpression | { ok: false; kind: "unsupported"; detail: string } {
  const plugins = property(config, "plugins");
  if (plugins === null) {
    config.addPropertyAssignment({ name: "plugins", initializer: "{}" });
    const added = property(config, "plugins");
    const object = added ? objectInitializer(added) : null;
    if (object !== null) return object;
    return { ok: false, kind: "unsupported", detail: "could not materialize a plugins object" };
  }
  const object = objectInitializer(plugins);
  return (
    object ?? {
      ok: false,
      kind: "unsupported",
      detail: "plugins is not a static object literal",
    }
  );
}

function hasTailwindJson(config: Record<string, unknown>): boolean {
  const plugins = config.plugins;
  return (
    typeof plugins === "object" &&
    plugins !== null &&
    !Array.isArray(plugins) &&
    "@tailwindcss/postcss" in plugins
  );
}

function patchJson(
  located: LocatedConfig,
):
  | { kind: "patched"; content: string | null }
  | { kind: "manual" }
  | { kind: "failed"; diagnostic: Diagnostic } {
  const root = jsonObject(located.source);
  if (root === null) {
    return {
      kind: "failed",
      diagnostic: initPostcssUnsupported(located.path, "the file is not a JSON object."),
    };
  }
  const config = located.kind === "package-json" ? root.postcss : root;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return {
      kind: "failed",
      diagnostic: initPostcssUnsupported(located.path, "the PostCSS value is not an object."),
    };
  }
  const object = config as Record<string, unknown>;
  if (hasTailwindJson(object)) return { kind: "manual" };

  let plugins = object.plugins;
  if (plugins === undefined) {
    plugins = {};
    object.plugins = plugins;
  }
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) {
    return {
      kind: "failed",
      diagnostic: initPostcssUnsupported(located.path, "plugins is not a static object."),
    };
  }
  const pluginObject = plugins as Record<string, unknown>;
  pluginObject["postcss-preset-mantine"] ??= {};

  const simple = pluginObject["postcss-simple-vars"];
  if (simple === undefined)
    pluginObject["postcss-simple-vars"] = { variables: { ...MANTINE_BREAKPOINTS } };
  else if (typeof simple !== "object" || simple === null || Array.isArray(simple)) {
    return {
      kind: "failed",
      diagnostic: initConfigConflict(located.path, "postcss-simple-vars has non-object options."),
    };
  } else {
    const options = simple as Record<string, unknown>;
    const variables = options.variables;
    if (variables === undefined) options.variables = { ...MANTINE_BREAKPOINTS };
    else if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
      return {
        kind: "failed",
        diagnostic: initConfigConflict(
          located.path,
          "postcss-simple-vars.variables is not an object.",
        ),
      };
    } else {
      const values = variables as Record<string, unknown>;
      for (const [name, expected] of Object.entries(MANTINE_BREAKPOINTS)) {
        if (values[name] !== undefined && values[name] !== expected) {
          return {
            kind: "failed",
            diagnostic: initConfigConflict(
              located.path,
              `${name} is already ${JSON.stringify(values[name])}, expected ${JSON.stringify(expected)}.`,
            ),
          };
        }
        values[name] = expected;
      }
    }
  }

  const indent = /^([ \t]+)"/m.exec(located.source)?.[1] ?? "  ";
  const content = `${JSON.stringify(root, null, indent)}\n`;
  return { kind: "patched", content: content === located.source ? null : content };
}

function patchModule(
  located: LocatedConfig,
):
  | { kind: "patched"; content: string | null }
  | { kind: "manual" }
  | { kind: "failed"; diagnostic: Diagnostic } {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const scriptKind = located.relative.endsWith(".ts") ? ScriptKind.TS : ScriptKind.JS;
  const sourceFile = project.createSourceFile(located.relative, located.source, {
    overwrite: true,
    scriptKind,
  });
  const config = resolveObject(sourceFile);
  if (config === null) {
    if (located.source.includes("@tailwindcss/postcss")) return { kind: "manual" };
    return {
      kind: "failed",
      diagnostic: initPostcssUnsupported(
        located.path,
        "the exported configuration is not a static object literal.",
      ),
    };
  }
  const plugins = pluginsObject(config);
  if ("ok" in plugins) {
    return {
      kind: "failed",
      diagnostic: initPostcssUnsupported(located.path, plugins.detail),
    };
  }
  if (property(plugins, "@tailwindcss/postcss") !== null) return { kind: "manual" };

  const patched = patchPluginObject(plugins);
  if (!patched.ok) {
    return {
      kind: "failed",
      diagnostic:
        patched.kind === "conflict"
          ? initConfigConflict(located.path, patched.detail)
          : initPostcssUnsupported(located.path, patched.detail),
    };
  }
  const content = sourceFile.getFullText();
  return { kind: "patched", content: content === located.source ? null : content };
}

function manual(path: string): InitPostcssResult {
  return {
    files: [],
    diagnostics: [],
    instructions: [
      {
        code: "tailwind-postcss",
        required: true,
        path,
        message:
          "The active config uses @tailwindcss/postcss. It was left byte-identical; place the Mantine block explicitly in the pipeline.",
        snippet: MANTINE_POSTCSS_SNIPPET,
      },
    ],
  };
}

export function planPostcss(
  project: InitProjectSnapshot,
  framework: InitFrameworkSet,
): InitPostcssResult {
  const located = locate(project, framework);
  if (located === null) {
    return {
      files: [
        {
          kind: "postcss",
          destination: join(project.layout.root, "postcss.config.cjs"),
          content: NEW_CONFIG,
        },
      ],
      instructions: [],
      diagnostics: [],
    };
  }
  if (located.kind === "unsupported") {
    return {
      files: [],
      instructions: [],
      diagnostics: [
        initPostcssUnsupported(
          located.path,
          `${located.relative} is not a statically patchable format.`,
        ),
      ],
    };
  }

  const patched = located.kind === "module" ? patchModule(located) : patchJson(located);
  if (patched.kind === "manual") return manual(located.path);
  if (patched.kind === "failed") {
    return { files: [], instructions: [], diagnostics: [patched.diagnostic] };
  }
  return {
    files:
      patched.content === null
        ? []
        : [{ kind: "postcss", destination: located.path, content: patched.content }],
    instructions: [],
    diagnostics: [],
  };
}
