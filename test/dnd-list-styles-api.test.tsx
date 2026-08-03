import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DndList, type DndListStylesNames } from "../registry/mantine-ui/dnd-list/dnd-list";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/dnd-list/dnd-list.module.css",
);

const SELECTORS = [
  "item",
  "itemSection",
  "itemLabel",
  "itemDescription",
] as const satisfies readonly DndListStylesNames[];

const REQUIRED_PROPS = {
  initialItems: [
    {
      id: "1",
      label: "Styles API probe",
      description: "Every declared selector is rendered by this fixture.",
      leading: "1",
    },
  ],
};

// Paste this helper verbatim, only changing the item `name` you look up.
// It is what keeps the catalog's `stylesApi` entry honest against this test file.
function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "dnd-list")?.stylesApi?.DndList;
}

describe("DndList Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    // The catalog's stylesApi entry for dnd-list is written by a later phase (this
    // conversion may not edit manteen.registry.json). Once that entry exists it must
    // match SELECTORS exactly, in order — that is what keeps the declaration honest.
    const declared = declaredSelectors();
    if (declared) {
      expect(declared).toEqual([...SELECTORS]);
    }
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<DndListStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<DndListStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <DndList {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      // classNames AND styles land on the SAME element (both `probe-x` and `z-index:x` on one tag)
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      // the default Mantine-generated class is still present alongside the instance override
      expect(html).toContain(`mantine-DndList-${selector}`);
      // The `itemLabel` selector is intentionally structural-only: the label had no
      // default styling before this selector existed, so the module deliberately has
      // no `.itemLabel` rule (an empty rule would trip Biome's noEmptyBlock lint).
      // Every other selector still has to correspond to a real class in the module.
      if (selector !== "itemLabel") {
        expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
      }
    }
  });

  test("DndList.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        DndList: DndList.extend({
          classNames: { item: "theme-item", itemLabel: "theme-itemLabel" },
          styles: { itemDescription: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <DndList {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-item");
    expect(html).toContain("theme-itemLabel");
    expect(html).toContain("z-index:701");
  });
});
