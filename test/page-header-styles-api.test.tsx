import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageHeader, type PageHeaderStylesNames } from "../registry/ui/page-header";

const CSS_MODULE = resolve(import.meta.dirname, "../registry/ui/page-header.module.css");

const SELECTORS = [
  "root",
  "header",
  "titleWrapper",
  "title",
  "description",
  "actions",
  "divider",
] as const satisfies readonly PageHeaderStylesNames[];

const REQUIRED_PROPS = {
  title: "Styles API probe",
  description: "Every public selector is rendered by this fixture.",
  actions: <button type="button">Action</button>,
};

// NOTE: article-card's exemplar test cross-checks SELECTORS against
// manteen.registry.json's `stylesApi.PageHeader` entry here. This task's
// hard rules forbid editing manteen.registry.json (a sibling/central step
// owns catalog edits across concurrently-converted items), so that entry
// does not exist yet and the cross-check is deferred rather than asserted.
// Once the catalog is updated with `"stylesApi": { "PageHeader": [...] }`
// matching SELECTORS below, this cross-check should be added back:
//
//   function declaredSelectors(): string[] | undefined {
//     const catalog = JSON.parse(
//       readFileSync(resolve(import.meta.dirname, "../manteen.registry.json"), "utf8"),
//     ) as { items: { name: string; stylesApi?: Record<string, string[]> }[] };
//     return catalog.items.find((item) => item.name === "page-header")?.stylesApi?.PageHeader;
//   }
//   expect(declaredSelectors()).toEqual([...SELECTORS]);

describe("PageHeader Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<PageHeaderStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<PageHeaderStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <PageHeader {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      // classNames AND styles land on the SAME element (both `probe-x` and `z-index:x` on one tag)
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      // the default Mantine-generated class is still present alongside the instance override
      expect(html).toContain(`mantine-PageHeader-${selector}`);
      // the selector corresponds to a real class in the CSS module (not a phantom name)
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("PageHeader.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        PageHeader: PageHeader.extend({
          classNames: { root: "theme-root", actions: "theme-actions" },
          styles: { title: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <PageHeader {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-actions");
    expect(html).toContain("z-index:701");
  });
});
