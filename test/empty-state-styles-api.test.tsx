import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EmptyState, type EmptyStateStylesNames } from "../registry/ui/empty-state";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(import.meta.dirname, "../registry/ui/empty-state.module.css");

const SELECTORS = [
  "root",
  "icon",
  "title",
  "description",
  "action",
] as const satisfies readonly EmptyStateStylesNames[];

const REQUIRED_PROPS = {
  title: "Styles API probe",
  description: "Every public selector is rendered by this fixture.",
  action: { label: "Do something", onClick: () => undefined },
};

// Paste this helper verbatim, only changing the item `name` you look up.
// It is what keeps the catalog's `stylesApi` entry honest against this test file.
function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "empty-state")?.stylesApi?.EmptyState;
}

describe("EmptyState Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    // The catalog `stylesApi` entry for empty-state is written in a later, separate
    // phase (this conversion is forbidden from editing manteen.registry.json). Once
    // it exists, this assertion enforces that it matches SELECTORS exactly.
    const declared = declaredSelectors();
    if (declared) {
      expect(declared).toEqual([...SELECTORS]);
    }
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<EmptyStateStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<EmptyStateStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <EmptyState {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      // classNames AND styles land on the SAME element (both `probe-x` and `z-index:x` on one tag)
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      // the default Mantine-generated class is still present alongside the instance override
      expect(html).toContain(`mantine-EmptyState-${selector}`);
      // the selector corresponds to a real class in the CSS module (not a phantom name)
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("EmptyState.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        EmptyState: EmptyState.extend({
          classNames: { root: "theme-root", action: "theme-action" },
          styles: { title: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <EmptyState {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-action");
    expect(html).toContain("z-index:701");
  });
});
