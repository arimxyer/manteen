import type { MantineItem } from "./build-registry";

export const SCAFFOLD_TEMPLATES = [
  "component-basic",
  "component-styles-api",
  "component-polymorphic",
] as const;

export type ScaffoldTemplate = (typeof SCAFFOLD_TEMPLATES)[number];

export interface ScaffoldTemplateFile {
  path: string;
  content: string;
}

export interface RenderedScaffoldTemplate {
  files: ScaffoldTemplateFile[];
  catalogInsertion: MantineItem;
  authorProfileMapping: {
    item: string;
    component: string;
    evidence: string;
  } | null;
  requiredPackages: {
    runtime: string[];
    development: string[];
  };
}

function componentName(itemName: string): string {
  return itemName
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join("");
}

function title(itemName: string): string {
  return itemName
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function basicSource(name: string, displayName: string): string {
  return `import { Paper, type PaperProps, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface ${name}Props extends PaperProps {
  label?: ReactNode;
}

export function ${name}({ label = "${displayName}", ...others }: ${name}Props) {
  return (
    <Paper withBorder p="md" {...others}>
      <Text>{label}</Text>
    </Paper>
  );
}
`;
}

function stylesApiSource(name: string, itemName: string): string {
  return `import {
  type BoxProps,
  type Factory,
  factory,
  Paper,
  type StylesApiProps,
  Text,
  useProps,
  useStyles,
} from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./${itemName}.module.css";

export type ${name}StylesNames = "root" | "label";

export interface ${name}Props extends BoxProps, StylesApiProps<${name}Factory> {
  label?: ReactNode;
}

export type ${name}Factory = Factory<{
  props: ${name}Props;
  ref: HTMLDivElement;
  stylesNames: ${name}StylesNames;
}>;

export const ${name} = factory<${name}Factory>((_props) => {
  const props = useProps("${name}", null, _props);
  const {
    attributes,
    className,
    classNames,
    label = "${splitComponentName(name)}",
    ref,
    style,
    styles,
    unstyled,
    vars,
    ...others
  } = props;
  const getStyles = useStyles<${name}Factory>({
    name: "${name}",
    classes,
    props,
    attributes,
    className,
    classNames,
    style,
    styles,
    unstyled,
    vars,
  });

  return (
    <Paper ref={ref} withBorder p="md" unstyled={unstyled} {...getStyles("root")} {...others}>
      <Text {...getStyles("label")}>{label}</Text>
    </Paper>
  );
});

${name}.classes = classes;
${name}.displayName = "${name}";

export namespace ${name} {
  export type Props = ${name}Props;
  export type StylesNames = ${name}StylesNames;
  export type Factory = ${name}Factory;
}
`;
}

function stylesApiCss(): string {
  return `.root {
  background: var(--mantine-color-body);
}

.label {
  color: var(--mantine-color-text);
  font-weight: 600;
}
`;
}

function usageSource(name: string, itemName: string, polymorphic: boolean): string {
  if (polymorphic) {
    return `import { ${name} } from "./${itemName}";

export function ${name}Usage() {
  return (
    <${name} component="a" href="/examples/${itemName}">
      Open ${splitComponentName(name)} example
    </${name}>
  );
}
`;
  }
  return `import { ${name} } from "./${itemName}";

export function ${name}Usage() {
  return <${name} label="A source-owned ${splitComponentName(name)}" />;
}
`;
}

function stylesApiTest(name: string, itemName: string): string {
  return `import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ${name}, type ${name}StylesNames } from "../src/${itemName}/${itemName}";

const SELECTORS = ["root", "label"] as const satisfies readonly ${name}StylesNames[];

describe("${name} Styles API", () => {
  test("instance classNames and styles reach every public selector", () => {
    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, \`probe-\${selector}\`]),
    ) as Record<${name}StylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<${name}StylesNames, CSSProperties>;
    const html = renderToStaticMarkup(
      <MantineProvider>
        <${name} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      expect(html).toMatch(
        new RegExp(\`<[^>]*(?=[^>]*probe-\${selector})(?=[^>]*z-index:\${index + 101})[^>]*>\`),
      );
      expect(html).toContain(\`mantine-${name}-\${selector}\`);
    }
  });

  test(".extend applies theme-level classNames and styles", () => {
    const theme = createTheme({
      components: {
        ${name}: ${name}.extend({
          classNames: { root: "theme-root" },
          styles: { label: { zIndex: 701 } },
        }),
      },
    });
    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <${name} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("z-index:701");
  });
});
`;
}

function polymorphicSource(name: string, displayName: string): string {
  return `import {
  Box,
  type BoxProps,
  type PolymorphicFactory,
  polymorphicFactory,
} from "@mantine/core";
import type { ReactNode } from "react";

export interface ${name}Props extends BoxProps {
  children?: ReactNode;
}

export type ${name}Factory = PolymorphicFactory<{
  props: ${name}Props;
  defaultComponent: "div";
  defaultRef: HTMLDivElement;
}>;

export const ${name} = polymorphicFactory<${name}Factory>(
  ({ children = "${displayName}", ref, ...others }) => (
    <Box ref={ref} {...others}>
      {children}
    </Box>
  ),
);

${name}.displayName = "${name}";

export namespace ${name} {
  export type Props = ${name}Props;
  export type Factory = ${name}Factory;
}
`;
}

function splitComponentName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function renderScaffoldTemplate(
  template: ScaffoldTemplate,
  itemName: string,
): RenderedScaffoldTemplate {
  const name = componentName(itemName);
  const displayName = title(itemName);
  const directory = `src/${itemName}`;
  const componentPath = `${directory}/${itemName}.tsx`;
  const usagePath = `${directory}/${itemName}.usage.tsx`;
  const runtime = ["@mantine/core@^9.5.0"];
  const baseDevelopment = ["@types/react@^19.2.0", "react@^19.2.0", "typescript@^5.9.0"];

  if (template === "component-basic") {
    return {
      files: [{ path: componentPath, content: basicSource(name, displayName) }],
      catalogInsertion: {
        name: itemName,
        kind: "component",
        title: displayName,
        description: `Source-owned ${displayName} component.`,
        mantine: ">=9.5.0 <10",
        provider: true,
        npm: runtime,
        files: [{ path: componentPath, as: "component" }],
      },
      authorProfileMapping: null,
      requiredPackages: { runtime, development: baseDevelopment },
    };
  }

  if (template === "component-styles-api") {
    const stylePath = `${directory}/${itemName}.module.css`;
    const evidencePath = `test/${itemName}-styles-api.test.tsx`;
    return {
      files: [
        { path: componentPath, content: stylesApiSource(name, itemName) },
        { path: stylePath, content: stylesApiCss() },
        { path: usagePath, content: usageSource(name, itemName, false) },
        { path: evidencePath, content: stylesApiTest(name, itemName) },
      ],
      catalogInsertion: {
        name: itemName,
        kind: "component",
        title: displayName,
        description: `${displayName} component with an authored Mantine Styles API.`,
        mantine: ">=9.5.0 <10",
        provider: true,
        npm: runtime,
        files: [
          { path: componentPath, as: "component" },
          { path: stylePath, as: "style", target: `@ui/${itemName}.module.css` },
        ],
        stylesApi: { [name]: ["root", "label"] },
        usage: usagePath,
      },
      authorProfileMapping: { item: itemName, component: name, evidence: evidencePath },
      requiredPackages: {
        runtime,
        development: [
          ...baseDevelopment,
          "@types/react-dom@^19.2.0",
          "react-dom@^19.2.0",
          "vitest@^3.2.4",
        ],
      },
    };
  }

  if (template === "component-polymorphic") {
    return {
      files: [
        { path: componentPath, content: polymorphicSource(name, displayName) },
        { path: usagePath, content: usageSource(name, itemName, true) },
      ],
      catalogInsertion: {
        name: itemName,
        kind: "component",
        title: displayName,
        description: `Opt-in polymorphic ${displayName} component.`,
        mantine: ">=9.5.0 <10",
        provider: true,
        npm: runtime,
        files: [{ path: componentPath, as: "component" }],
        usage: usagePath,
      },
      authorProfileMapping: null,
      requiredPackages: { runtime, development: baseDevelopment },
    };
  }

  throw new Error(`Unknown scaffold template: ${String(template)}`);
}
