import { MantineProvider } from "@mantine/core";
import { type CSSProperties, useState } from "react";

import authenticationFormAdapter from "../playgrounds/authentication-form.playground";
import type { PlaygroundAdapter } from "../playgrounds/contract";
import tableSortAdapter from "../playgrounds/table-sort.playground";
import styles from "./HeroShowcase.module.css";

/**
 * The right-hand column: real registry components, rendered at their NATURAL size and stacked.
 *
 * What distinguishes this from the component collage every other library site has is full size,
 * not miniatures (see notes/home-hero-research). A tidy grid of shrunken cards reads as a
 * catalogue thumbnail sheet; components at the size you would actually use them read as a
 * working app.
 *
 * An earlier pass also claimed the column bled off the right edge of the viewport. It did not —
 * it stopped 82px short at 1440 and overshot by up to 90px between 1025 and 1280, where the
 * clip cut real content. That is now removed; see HeroShowcase.module.css. A real bleed would
 * need panels genuinely wider than the cell, and is an open design decision, not a margin.
 *
 * Only the two adapters used here are imported. Pulling the playground discovery glob into this
 * hydrated island would ship every registry demo and its dependencies in the hero bundle.
 */
const ADAPTERS: Record<string, PlaygroundAdapter> = {
  "table-sort": tableSortAdapter,
  "authentication-form": authenticationFormAdapter,
};

const showcaseTheme = {
  fontFamily: '"Figtree Variable", sans-serif',
  headings: { fontFamily: '"Figtree Variable", sans-serif' },
  primaryColor: "indigo",
} as const;

/** Natural render width per item, in rem. These are the widths each component is designed to sit
 *  at — not a uniform grid cell, because forcing four different components into one width is what
 *  makes a collage look mechanical. */
/* Two, not three. Three made the column ~1100px tall against a ~670px copy column, which left a
   large void under the install line and pushed the fold down for no gain.

   `stats-grid` was the third and is deliberately gone: its `SimpleGrid cols={{ base, xs, md }}`
   resolves against the REAL viewport, not this container, so at desktop it lays out four columns
   inside whatever width it is given — at 34rem that clipped "$48,392" mid-glyph and wrapped
   "Compared to previous period" one word per line. It needs either a much wider slot or a
   container-query rewrite; showing it broken to prove the components are real would prove the
   opposite. */
const PANELS: { name: string; widthRem: number }[] = [
  { name: "table-sort", widthRem: 37.5 },
  { name: "authentication-form", widthRem: 27 },
];

/**
 * A subtree with no hydration cannot react to Starlight's theme toggle, and Mantine stamps
 * `data-mantine-color-scheme` via a client effect that never runs here. So both schemes are
 * rendered at build time, each with the correct attribute baked into its markup, and a plain CSS
 * rule keyed on Starlight's `data-theme` picks the visible one. No script, no observer, no FOUC —
 * the same approach RegistryCardPreview already uses for the catalog minis.
 */
function Panel({ adapter, widthRem }: { adapter: PlaygroundAdapter; widthRem: number }) {
  const [event, setEvent] = useState("");
  const scheme = (value: "dark" | "light") => (
    <div
      key={value}
      className={`${styles.scheme} ${value === "dark" ? styles.schemeDark : styles.schemeLight}`}
      data-mantine-color-scheme={value}
    >
      <MantineProvider
        forceColorScheme={value}
        withCssVariables={false}
        withGlobalClasses={false}
        theme={showcaseTheme}
      >
        {/* Width travels as a custom property rather than an inline `width`, so the responsive
            rule can override it normally. An inline style can only be beaten by `!important`. */}
        <div
          className={styles.panelInner}
          style={{ "--panel-w": `${widthRem}rem` } as CSSProperties}
        >
          {adapter.render(adapter.defaultProps, setEvent, { viewport: "desktop", scheme: value })}
          {event && (
            <p className={styles.event} role="status" aria-live="polite">
              {event}
            </p>
          )}
        </div>
      </MantineProvider>
    </div>
  );

  return (
    <>
      {scheme("dark")}
      {scheme("light")}
    </>
  );
}

/** Emits the shared CSS-variable blocks once per scheme for the whole column, instead of once per
 *  panel — every panel wrapper shares these two class names, so one provider each covers all. */
export function HeroShowcaseStyles() {
  return (
    <>
      <MantineProvider
        forceColorScheme="dark"
        cssVariablesSelector={`.${styles.schemeDark}`}
        theme={showcaseTheme}
      />
      <MantineProvider
        forceColorScheme="light"
        cssVariablesSelector={`.${styles.schemeLight}`}
        theme={showcaseTheme}
        withGlobalClasses={false}
      />
    </>
  );
}

export function HeroShowcase() {
  return (
    <section
      className={styles.column}
      aria-label="Interactive registry component previews"
      data-playground
    >
      {PANELS.map(({ name, widthRem }) => {
        const adapter = ADAPTERS[name];
        if (!adapter) return null;
        return (
          <div className={styles.panel} key={name}>
            <Panel adapter={adapter} widthRem={widthRem} />
          </div>
        );
      })}
    </section>
  );
}
