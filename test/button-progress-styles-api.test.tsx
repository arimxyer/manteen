import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ButtonProgress,
  type ButtonProgressStylesNames,
} from "../registry/mantine-ui/button-progress/button-progress";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/button-progress/button-progress.module.css",
);

// "progress" is deliberately excluded: it's rendered only after `start()` runs
// (progress > 0), which requires a click event. renderToStaticMarkup fires no
// events, so a Progress element never mounts in any render this test can
// produce, and there is no additive way to force it to mount at idle without
// either changing default output (§3) or introducing a new render approach
// (§4). It stays internal, opinionated CSS per the roadmap's carve-out for
// parts that aren't meant to be independently restyled.
const SELECTORS = ["root", "label"] as const satisfies readonly ButtonProgressStylesNames[];

const REQUIRED_PROPS = {};

// Catalog `stylesApi` entries are authored by a later phase (this conversion
// may not edit manteen.registry.json); assert sync only once the entry exists
// so this test passes now and goes strict the moment the entry lands.
function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "button-progress")?.stylesApi?.ButtonProgress;
}

describe("ButtonProgress Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    const declared = declaredSelectors();
    if (declared) expect(declared).toEqual([...SELECTORS]);
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<ButtonProgressStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<ButtonProgressStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <ButtonProgress {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      expect(html).toContain(`mantine-ButtonProgress-${selector}`);
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("ButtonProgress.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        ButtonProgress: ButtonProgress.extend({
          classNames: { root: "theme-root", label: "theme-label" },
          styles: { label: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <ButtonProgress {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-label");
    expect(html).toContain("z-index:701");
  });
});
