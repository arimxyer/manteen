import { MantineProvider } from "@mantine/core";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { type Scheme, useMounted, useStarlightScheme } from "../../lib/useStarlightScheme";
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

/** How long an event chip stays up. Matches PlaygroundShell, which owns the same adapter contract. */
const EVENT_LINGER_MS = 2600;

/**
 * One instance per panel — but two on the server.
 *
 * Before this island hydrated it could not read Starlight's `data-theme`, so it rendered BOTH
 * schemes into the markup and let a CSS rule pick the visible one: no script, no observer, no
 * FOUC. That trick was free while the subtree was `inert`, because there was no state to lose.
 *
 * It stopped being free the moment the components became interactive. Two rendered schemes are two
 * independent React instances, and the CSS rule only chooses which one is `display: none`. A theme
 * change therefore swapped the reader onto the *other* instance — discarding whatever they had
 * typed or sorted and destroying keyboard focus, with no announcement. Under the "Auto" setting
 * that can happen with no user action at all, because Starlight follows the OS.
 *
 * So: both schemes for the server render and the first client pass (hydration must match, and the
 * no-FOUC property is worth keeping), then exactly one from the moment we know which. The swap
 * happens in the mount effect, before a reader can have typed anything, so there is no state to
 * carry across it. From then on a theme change only re-renders `forceColorScheme` and two
 * attributes in place.
 *
 * Verified rather than assumed: type "Silkeater" into the table's search, flip `data-theme`, and
 * the input still reads "Silkeater", `document.activeElement` is still the input, the filtered row
 * count is still 1, and the panel has re-themed (`--mantine-color-body: #fff`).
 */
function Panel({ adapter, widthRem }: { adapter: PlaygroundAdapter; widthRem: number }) {
  const [event, setEvent] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const scheme = useStarlightScheme();
  const mounted = useMounted();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Each event replaces the chip and restarts its dismissal clock, so the panel returns to the
  // composition it started in rather than growing a line permanently.
  const recordEvent = (name: string) => {
    setEvent(name);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setEvent(""), EVENT_LINGER_MS);
  };

  // The key is deliberately NOT the scheme. Keying on it made React unmount and remount the whole
  // subtree on every theme change, which is the exact state-and-focus loss this rewrite exists to
  // fix — verified: typing "Silkeater" into the table's search and flipping `data-theme` returned
  // value "" and activeElement BODY. With a constant key the instance survives and only
  // `forceColorScheme` and two attributes change.
  const render = (value: Scheme, key: string) => (
    <div
      key={key}
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
          {adapter.render(adapter.defaultProps, recordEvent, {
            viewport: "desktop",
            scheme: value,
          })}
          {/* The chip is decoration and is `aria-hidden`; the always-mounted live region below
              does the announcing, so a reader hears each event exactly once. Mounting a live
              region together with its first message is unreliable — several screen readers skip
              it — which is why the region is rendered empty rather than conditionally. It is also
              positioned out of flow, so the first interaction does not push the rest of the
              column down. Same shape as PlaygroundShell, which already solved this. */}
          {event && (
            <p className={styles.event} aria-hidden="true">
              {event}
            </p>
          )}
          <span className={styles.announcement} aria-live="polite">
            {event}
          </span>
        </div>
      </MantineProvider>
    </div>
  );

  return (
    <>{mounted ? render(scheme, "live") : [render("dark", "dark"), render("light", "light")]}</>
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
