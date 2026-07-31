import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ArticleCard,
  type ArticleCardStylesNames,
} from "../registry/mantine-ui/article-card/article-card";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/article-card/article-card.module.css",
);
const SELECTORS = [
  "root",
  "image",
  "rating",
  "title",
  "footer",
  "action",
] as const satisfies readonly ArticleCardStylesNames[];

const REQUIRED_PROPS = {
  image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  title: "Styles API probe",
  description: "Every public selector is rendered by this fixture.",
  authorName: "Manteen",
  rating: "5.0",
  href: "/article",
  onLike: () => undefined,
};

function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "article-card")?.stylesApi?.ArticleCard;
}

describe("ArticleCard Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    expect(declaredSelectors()).toEqual([...SELECTORS]);
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<ArticleCardStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<ArticleCardStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <ArticleCard {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      expect(html).toContain(`mantine-ArticleCard-${selector}`);
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("ArticleCard.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        ArticleCard: ArticleCard.extend({
          classNames: { root: "theme-root", action: "theme-action" },
          styles: { title: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <ArticleCard {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-action");
    expect(html).toContain("z-index:701");
  });
});
