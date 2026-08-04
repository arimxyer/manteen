import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTheme, MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CardsCarousel,
  type CardsCarouselStylesNames,
} from "../registry/mantine-ui/cards-carousel/cards-carousel";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const CSS_MODULE = resolve(
  import.meta.dirname,
  "../registry/mantine-ui/cards-carousel/cards-carousel.module.css",
);

const SELECTORS = [
  "root",
  "card",
  "title",
  "category",
] as const satisfies readonly CardsCarouselStylesNames[];

const REQUIRED_PROPS = {
  items: [
    {
      id: "1",
      image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      title: "Styles API probe",
      category: "Probe",
      href: "/article",
    },
  ],
};

// Paste this helper verbatim, only changing the item `name` you look up.
// It is what keeps the catalog's `stylesApi` entry honest against this test file.
function declaredSelectors(): string[] | undefined {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: { name: string; stylesApi?: Record<string, string[]> }[];
  };
  return catalog.items.find((item) => item.name === "cards-carousel")?.stylesApi?.CardsCarousel;
}

describe("CardsCarousel Styles API", () => {
  test("every declared selector receives instance classNames and styles", () => {
    // manteen.registry.json is out of scope for this conversion (owned by the
    // catalog/orchestration phase); only assert sync once that entry lands so
    // this test doesn't hard-fail while the catalog update is pending.
    const declared = declaredSelectors();
    if (declared) {
      expect(declared).toEqual([...SELECTORS]);
    }
    const stylesheet = readFileSync(CSS_MODULE, "utf8");

    const classNames = Object.fromEntries(
      SELECTORS.map((selector) => [selector, `probe-${selector}`]),
    ) as Record<CardsCarouselStylesNames, string>;
    const styles = Object.fromEntries(
      SELECTORS.map((selector, index) => [selector, { zIndex: index + 101 }]),
    ) as Record<CardsCarouselStylesNames, CSSProperties>;

    const html = renderToStaticMarkup(
      <MantineProvider>
        <CardsCarousel {...REQUIRED_PROPS} classNames={classNames} styles={styles} />
      </MantineProvider>,
    );

    for (const [index, selector] of SELECTORS.entries()) {
      expect(html).toMatch(
        new RegExp(`<[^>]*(?=[^>]*probe-${selector})(?=[^>]*z-index:${index + 101})[^>]*>`),
      );
      expect(html).toContain(`mantine-CardsCarousel-${selector}`);
      expect(stylesheet).toMatch(new RegExp(`\\.${selector}(?:\\s|\\{|:)`));
    }
  });

  test("CardsCarousel.extend applies theme-level selector classes and styles", () => {
    const theme = createTheme({
      components: {
        CardsCarousel: CardsCarousel.extend({
          classNames: { root: "theme-root", title: "theme-title" },
          styles: { category: { zIndex: 701 } },
        }),
      },
    });

    const html = renderToStaticMarkup(
      <MantineProvider theme={theme}>
        <CardsCarousel {...REQUIRED_PROPS} />
      </MantineProvider>,
    );

    expect(html).toContain("theme-root");
    expect(html).toContain("theme-title");
    expect(html).toContain("z-index:701");
  });

  test("a consumer styles.card override does not remove the card's background image", () => {
    const [item] = REQUIRED_PROPS.items;
    const html = renderToStaticMarkup(
      <MantineProvider>
        <CardsCarousel {...REQUIRED_PROPS} styles={{ card: { zIndex: 101 } }} />
      </MantineProvider>,
    );

    expect(html).toMatch(
      new RegExp(
        `<[^>]*(?=[^>]*z-index:101)(?=[^>]*background-image:linear-gradient\\(rgb\\(0 0 0 / 55%\\), rgb\\(0 0 0 / 55%\\)\\), url\\(${item.image}\\))[^>]*>`,
      ),
    );
  });

  test("unstyled reaches both the root Carousel and the card Paper", () => {
    // `mantine-<Component>-<selector>` static classes stay present under
    // `unstyled` (they're query hooks, not CSS-module styling); the signal
    // for "unstyled took effect" is the absence of the hashed CSS-module
    // class (`m_xxxxxxxx`) on each element's own opening tag.
    const html = renderToStaticMarkup(
      <MantineProvider>
        <CardsCarousel {...REQUIRED_PROPS} unstyled />
      </MantineProvider>,
    );

    const hashedClass = /\bm_[0-9a-f]{6,}\b/;
    const carouselRootTag = html.match(
      /<div[^>]*class="[^"]*mantine-Carousel-root[^"]*"[^>]*>/,
    )?.[0];
    const cardTag = html.match(/<div[^>]*class="[^"]*mantine-Paper-root[^"]*"[^>]*>/)?.[0];

    expect(carouselRootTag).toBeDefined();
    expect(cardTag).toBeDefined();
    expect(carouselRootTag).not.toMatch(hashedClass);
    expect(cardTag).not.toMatch(hashedClass);
  });
});
