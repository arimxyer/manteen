import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FloatingLabelInput,
  type FloatingLabelInputStylesNames,
} from "../registry/mantine-ui/floating-label-input/floating-label-input";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/floating-label-input/floating-label-input.module.css",
);
const SELECTORS = [
  "root",
  "label",
  "required",
  "input",
  "error",
] as const satisfies readonly FloatingLabelInputStylesNames[];

// `error` only renders while the `error` prop is truthy — give the fixture a
// real error so every declared selector actually mounts.
const REQUIRED_PROPS = {
  error: "Styles API probe error",
};

function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "floating-label-input")?.stylesApi
    ?.FloatingLabelInput;
}

describe("FloatingLabelInput Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    expect(declaredSelectors()).toEqual([...SELECTORS]);
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<FloatingLabelInputStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<FloatingLabelInputStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <FloatingLabelInput {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      expect(html).toContain(`mantine-FloatingLabelInput-${selector}`);
      // `error` is deliberately a hook-only selector: Mantine's own default
      // error-text styling already applies, so the module has no local
      // `.error` rule (see the component's stylesApiDecision in the catalog
      // manifest). Every other selector still has to correspond to a real
      // class in the module, same as every other styles-api test in this repo.
      if (selector !== "error") {
        expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
      }
    }
  });

  test("FloatingLabelInput.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        FloatingLabelInput: FloatingLabelInput.extend({
          classNames: { root: "theme-root", required: "theme-required" },
          styles: { label: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <FloatingLabelInput {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-required");
    expect(html).toContain("z-index:701");
  });
});
