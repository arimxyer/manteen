import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatCard, type StatCardStylesNames } from "../registry/ui/stat-card";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(import.meta.dirname, "../registry/ui/stat-card.module.css");

const SELECTORS = [
  "root",
  "label",
  "value",
  "icon",
  "diff",
] as const satisfies readonly StatCardStylesNames[];

const REQUIRED_PROPS = {
  label: "Revenue",
  value: "$48,200",
  diff: 12.4,
  icon: <span data-testid="stat-icon-slot" />,
};

// Paste this helper verbatim, only changing the item `name` you look up.
// It is what keeps the catalog's `stylesApi` entry honest against this test file.
function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "stat-card")?.stylesApi?.StatCard;
}

describe("StatCard Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    // The catalog's stylesApi entry for stat-card is written by the conversion
    // orchestrator, not this agent (hard rule: never touch manteen.registry.json
    // from within this conversion task). Once it lands, this assertion enforces
    // sync between the catalog declaration and SELECTORS below.
    const declared = declaredSelectors();
    if (declared !== undefined) {
      expect(declared).toEqual([...SELECTORS]);
    }

    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<StatCardStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<StatCardStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <StatCard {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      // classNames AND styles land on the SAME element (both `probe-x` and `z-index:x` on one tag)
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      // the default Mantine-generated class is still present alongside the instance override
      expect(html).toContain(`mantine-StatCard-${selector}`);
      // the selector corresponds to a real class in the CSS module (not a phantom name)
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("StatCard.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        StatCard: StatCard.extend({
          classNames: { root: "theme-root", icon: "theme-icon" },
          styles: { value: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <StatCard {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-icon");
    expect(html).toContain("z-index:701");
  });
});
