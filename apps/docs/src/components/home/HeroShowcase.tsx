import { MantineProvider } from "@mantine/core";
import type { CSSProperties } from "react";

import type { PlaygroundAdapter } from "../playgrounds/contract";
import styles from "./HeroShowcase.module.css";

/**
 * The right-hand column: real registry components, rendered at their NATURAL size, stacked and
 * deliberately bleeding off the right edge of the viewport.
 *
 * Two things distinguish this from the component collage every other library site has, and both
 * are what Radix gets right (see notes/home-hero-research):
 *
 *  - full size, not miniatures. A tidy grid of shrunken cards reads as a catalogue thumbnail
 *    sheet; components at the size you would actually use them read as a working app.
 *  - it bleeds. Cutting the column off at the viewport edge implies there is more, which is the
 *    whole point of a registry. A collage that fits neatly inside the page implies that is all
 *    there is.
 *
 * Zero client JS. `eager: true` because this renders at build time with no client directive —
 * the same discovery glob PlaygroundHost lazy-loads at runtime.
 */
const adapterModules = import.meta.glob<{ default: PlaygroundAdapter }>(
  "../playgrounds/*.playground.tsx",
  { eager: true },
);

function adapterFor(name: string): PlaygroundAdapter | undefined {
  return adapterModules[`../playgrounds/${name}.playground.tsx`]?.default;
}

const noop = () => {};

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
  { name: "table-sort", widthRem: 40 },
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
  const scheme = (value: "dark" | "light") => (
    <div
      key={value}
      className={`${styles.scheme} ${value === "dark" ? styles.schemeDark : styles.schemeLight}`}
      data-mantine-color-scheme={value}
      // Decorative duplicates of real interactive components (inputs, buttons, sort headers).
      // `inert` removes the whole subtree from focus AND the accessibility tree, which
      // `aria-hidden` alone does not do for focusable descendants.
      inert
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
          {adapter.render(adapter.defaultProps, noop, { viewport: "desktop", scheme: value })}
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
    <div className={styles.column} aria-hidden="true">
      {PANELS.map(({ name, widthRem }) => {
        const adapter = adapterFor(name);
        if (!adapter) return null;
        return (
          <div className={styles.panel} key={name}>
            <Panel adapter={adapter} widthRem={widthRem} />
          </div>
        );
      })}
    </div>
  );
}
