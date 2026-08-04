import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PasswordStrength,
  type PasswordStrengthStylesNames,
} from "../registry/mantine-ui/password-strength/password-strength";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/password-strength/password-strength.module.css",
);
const SELECTORS = [
  "root",
  "input",
  "meter",
  "bar",
  "requirement",
  "requirementLabel",
] as const satisfies readonly PasswordStrengthStylesNames[];

// Selectors whose module has no local rule: root/input are the plain
// wrapper/PasswordInput hooks (no local CSS need — root has no layout of its
// own, input relies on PasswordInput's own default styling) and bar's visual
// treatment (width/color/transitionDuration) is driven entirely by Progress
// props on each instance, not a module rule. meter/requirement/requirementLabel
// do have local spacing rules.
const NO_LOCAL_RULE = new Set<PasswordStrengthStylesNames>(["root", "input", "bar"]);

const REQUIRED_PROPS = {};

function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "password-strength")?.stylesApi
    ?.PasswordStrength;
}

describe("PasswordStrength Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    expect(declaredSelectors()).toEqual([...SELECTORS]);
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<PasswordStrengthStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<PasswordStrengthStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <PasswordStrength {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      // "bar" renders four times (one per Progress segment) — every
      // instance must carry the probe class + style, not just one.
      if (selector === "bar") {
        const matches = [
          ...html.matchAll(
            new RegExp(`<[^>]*(?=[^>]*probe-bar)(?=[^>]*z-index:${index + 101})[^>]*>`, "g"),
          ),
        ];
        expect(matches.length).toBe(4);
      } else {
        expect(html).toMatch(
          new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
        );
      }
      expect(html).toContain(`mantine-PasswordStrength-${selector}`);
      if (!NO_LOCAL_RULE.has(selector)) {
        expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
      }
    }
  });

  test("PasswordStrength.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        PasswordStrength: PasswordStrength.extend({
          classNames: { root: "theme-root", meter: "theme-meter" },
          styles: { requirementLabel: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <PasswordStrength {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-meter");
    expect(html).toContain("z-index:701");
  });
});
