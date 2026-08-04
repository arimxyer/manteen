import { DEFAULT_THEME, MantineProvider } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";
// H-8: the House Theme mini has to describe the actual house theme, not invented roles — see
// ThemePreview below. Same relative-depth pattern the playground adapters already use to reach
// into `registry/` from `apps/docs/src` (e.g. playgrounds/article-card.playground.tsx), one
// level shallower since this file lives in `components/`, not `components/playgrounds/`.
import { theme as houseTheme } from "../../../../registry/lib/theme";
import type { PlaygroundAdapter } from "./playgrounds/contract";
import styles from "./RegistryCardPreview.module.css";

interface Props {
  name: string;
}

// No-op: card minis are decoration, not a live surface — nothing on the card should ever be
// visibly interactive, so recordEvent has nowhere to report to.
const noop = () => {};

/**
 * Discovery, not a hand-maintained list: any `<item-name>.playground.tsx` under ./playgrounds
 * registers itself here automatically (see playgrounds/contract.ts). `eager: true` is the one
 * difference from PlaygroundHost's use of the same glob — this component renders at
 * build/SSR time with no client directive, so the modules must already be resolved
 * synchronously; PlaygroundHost instead lazy-loads the same path client-side on demand.
 */
const adapterModules = import.meta.glob<{ default: PlaygroundAdapter }>(
  "./playgrounds/*.playground.tsx",
  { eager: true },
);

function adapterFor(name: string): PlaygroundAdapter | undefined {
  return adapterModules[`./playgrounds/${name}.playground.tsx`]?.default;
}

const liveMiniTheme = {
  fontFamily: "var(--__sl-font)",
  headings: { fontFamily: "var(--__sl-font)" },
  primaryColor: "indigo",
} as const;

// Uniform fit policy: every live mini is rendered at some fixed, un-scaled CSS width (its
// "natural" width) and then shrunk with `transform: scale()` to fit the card's fixed-height
// frame. `DEFAULT_SCALE` is the one scale value the spike screenshot-verified as legible at
// this frame size (article-card's rating badge was the failure case below it) — so the
// formula holds scale fixed and solves for width, rather than the other way around.
// `TARGET_EFFECTIVE_WIDTH_REM` is the average of the three spike-verified fits
// (20×0.44=8.8, 30×0.34=10.2, 22×0.42=9.24 → 9.4), i.e. the rendered-on-card width every
// mini should land near. An adapter's `stage.desktopWidth` hint (when it carries a numeric
// `min(Nrem, 100%)` cap) then only ever narrows that derived width, never widens it — a
// narrower box crops (a deliberate, already-accepted center-crop, see .liveMiniScheme below),
// while a wider derived box would need a smaller scale, which is the thing this policy holds
// fixed to keep type legible.
const DEFAULT_SCALE = 0.44;
const TARGET_EFFECTIVE_WIDTH_REM = 9.4;
const DESKTOP_WIDTH_CAP_PATTERN = /min\(\s*([\d.]+)rem/;

interface MiniFit {
  /** Un-scaled CSS width, in rem, the mini renders at before `scale` shrinks it to card size. */
  naturalWidthRem: number;
  scale: number;
  /**
   * Vertical anchor when the scaled box is taller than the frame. `"center"` (default) crops
   * evenly top and bottom — fine for content that reads the same anywhere in it (a card, a
   * table). `"start"` crops only the bottom, which reads better for content whose *beginning*
   * is what makes it recognizable (a list's first item, a form's first field).
   */
  align: "center" | "start";
  /** Extra class on the scaled box, for the rare item that needs a component-specific CSS
   * escape hatch beyond width/scale/align — see stats-grid's override for the one case. */
  boxClassName?: string;
}

/**
 * Per-item exceptions to the uniform formula below, found by screenshotting every live mini
 * in both themes. Keep this map short — an entry here means the formula's own guess was
 * visibly wrong for that item, not a preference.
 */
const MINI_FIT_OVERRIDES: Partial<Record<string, Partial<MiniFit>>> = {
  // The spike screenshot-verified these three exact fits; kept as-is rather than
  // re-derived, since the formula's own guess (~21.4rem/0.44) lands close but not
  // identical and re-tuning already-proven fits isn't worth the risk.
  "article-card": { naturalWidthRem: 20, scale: 0.44 },
  "cards-carousel": { naturalWidthRem: 30, scale: 0.34 },
  "data-table": { naturalWidthRem: 22, scale: 0.42 },
  // HeaderMegaMenu's top-level `Group justify="space-between"` (logo / nav links / login+signup)
  // uses Mantine's default `wrap="wrap"`, and every direct child of a `display: flex` parent is
  // itself a flex item with the initial `flex: 0 1 auto` — so without `flexShrink: 0` below, the
  // box this policy gives it (any naturalWidthRem) gets shrunk back down toward its min-content
  // size regardless of the declared width, because nothing here sets `overflow` on the box to
  // trigger the flexbox spec's automatic-minimum-size-to-0 exception. That min-content is small
  // (just the widest unbreakable label), so the header's own internal Group wrapped the nav onto
  // a second line ("Learn"/"Academy" below "Home"/"Features") well before the box ever reached
  // its intended width — which the card's fixed-height frame then clipped mid-glyph. Verified by
  // probing computed width live: an inline `width: 46rem` on the box still measured `clientWidth:
  // 248` until `flexShrink: 0` was added, after which `clientWidth` matched the declared width
  // exactly. `naturalWidthRem: 42` is the smallest width (screenshot-verified in 1rem steps) at
  // which the login/signup buttons also stay on the header's row instead of wrapping under it —
  // below 41rem they drop to a second row that the frame's fixed height then crops.
  //
  // H-7: this entry used to also pin `scale: 0.26`, re-derived down from DEFAULT_SCALE so the
  // rendered mini's effective width stayed near every sibling mini's ~9.4rem
  // (TARGET_EFFECTIVE_WIDTH_REM) instead of nearly 2x it. That traded away legibility for
  // visual-proportion consistency past the point of usability: at the header nav's 14px
  // unscaled font, 0.26 measured as a 3.64px effective font — about half of every other card's
  // ~7px and functionally illegible. Measured instead: leaving `scale` unset here (falling
  // through to DEFAULT_SCALE, same as every non-overridden mini) renders the 42rem box at
  // 295.68px, which still lands entirely inside the frame's ~326px content width with zero crop
  // on either axis (verified live: the box's `getBoundingClientRect()` sat fully inside the
  // frame's on all four edges) — so the "nearly 2x" concern the low scale was chosen to avoid
  // never actually cost a crop, just a mini that reads bigger and denser than its siblings.
  // Legibility wins that trade.
  "header-mega-menu": {
    naturalWidthRem: 42,
    boxClassName: styles.headerMegaMenuLiveMini,
  },
  // A 4-5 row vertical list is taller than the frame at any legible scale (measured: its
  // natural height at the default scale is over 2x the frame's content height). Center-crop
  // left an arbitrary middle slice visible (items 2-3, with item 1's leading number missing) —
  // top-anchoring instead shows the list's first item(s) uncropped, which reads as "a list",
  // where the centered crop read as an unlabeled fragment.
  "dnd-list": { align: "start" },
  // StatsGrid's column count is Mantine's own `SimpleGrid cols={{ base, xs, md }}` responsive
  // prop, which resolves against the REAL browser viewport width via `@media` — not against
  // this box's declared (pre-scale) width. At the catalog page's actual desktop viewport, the
  // `md` breakpoint always matches and Mantine lays out all 4 columns, which `transform:
  // scale()` then shrinks purely visually: 4 columns inside a ~9.4rem-wide scaled box left each
  // column only ~26px wide, and every stat's title/value text wrapped one character per line.
  // `.statsGridLiveMini` (CSS module) unconditionally forces the grid back to one column —
  // no `@media`, so no viewport size can re-break it — and the extra height that costs is
  // covered by a smaller scale plus top-anchoring, same reasoning as dnd-list above.
  "stats-grid": { scale: 0.34, boxClassName: styles.statsGridLiveMini, align: "start" },
};

function deriveFit(adapter: PlaygroundAdapter): MiniFit {
  const override = MINI_FIT_OVERRIDES[adapter.item];
  const scale = override?.scale ?? DEFAULT_SCALE;
  const derivedWidthRem = TARGET_EFFECTIVE_WIDTH_REM / scale;
  const cap = adapter.stage?.desktopWidth?.match(DESKTOP_WIDTH_CAP_PATTERN);
  const naturalWidthRem =
    override?.naturalWidthRem ??
    (cap ? Math.min(Number(cap[1]), derivedWidthRem) : derivedWidthRem);
  return {
    naturalWidthRem,
    scale,
    align: override?.align ?? "center",
    boxClassName: override?.boxClassName,
  };
}

/**
 * An SSR-inert "live mini": the item's real playground adapter, rendered at build time inside
 * a scoped MantineProvider, with NO client directive. This produces pure static HTML
 * (RegistryCardPreview itself already ships with zero client JS today — this keeps that
 * property), so it costs nothing at runtime beyond the extra markup and the page's now-larger
 * CSS payload (see SiteHead.astro's gate).
 *
 * Color scheme: a subtree with no hydration cannot react to Starlight's theme toggle. Mantine
 * stamps `data-mantine-color-scheme` on the scope element via a CLIENT EFFECT
 * (MantineThemeProvider), which never runs here — so the attribute has to be correct in the
 * initial markup instead of applied later. This renders BOTH schemes' full subtrees at build
 * time, each carrying its own accurate `data-mantine-color-scheme` attribute (verified against
 * @mantine/core's compiled styles.layer.css: many component rules key off that attribute as an
 * ancestor selector, not only CSS variables — a scheme sync that only fixed variables would
 * still be visibly wrong on those rules), and lets a plain CSS rule keyed on Starlight's
 * `data-theme` — the same convention `.preview` already uses two rules below in the CSS module
 * — pick the visible one. Live toggling then falls out of the browser's own selector matching:
 * no script, no MutationObserver, no FOUC.
 *
 * CSS-variable output: `withCssVariables`/`withGlobalClasses` are both off here because
 * `LiveMiniStyles` (below) already emits that page-wide, once per scheme, keyed to the same
 * shared scheme classes every card's wrapper carries — see that component's doc comment.
 */
function LiveMini({ adapter }: { adapter: PlaygroundAdapter }) {
  const { naturalWidthRem, scale, align, boxClassName } = deriveFit(adapter);
  // `transformOrigin` has to match how `.liveMiniScheme` positions the (unscaled) box: flex
  // `align-items: center` centers the box's full-height layout box within the frame, so scaling
  // from that same center point leaves the visual center where the layout already put it.
  // `align-items: flex-start` instead anchors the box's layout TOP to the frame's top using its
  // full unscaled height — scaling that from "center" would pull the visual top down by half
  // the removed height (verified: it pushed the whole scaled box below the visible frame,
  // rendering nothing), so the origin has to move to "top" too, anchoring the shrink to the
  // same edge the layout already anchored to.
  const boxStyle: CSSProperties = {
    width: `${naturalWidthRem}rem`,
    transform: `scale(${scale})`,
    transformOrigin: align === "start" ? "top" : "center",
  };
  // Default .liveMiniScheme centers both axes; "start" only overrides the vertical axis so a
  // too-tall mini crops its bottom instead of an arbitrary center slice (see MINI_FIT_OVERRIDES).
  const schemeStyle: CSSProperties | undefined =
    align === "start" ? { alignItems: "flex-start" } : undefined;

  const scheme = (value: "dark" | "light") => {
    const schemeClass = value === "dark" ? styles.liveMiniSchemeDark : styles.liveMiniSchemeLight;
    return (
      <div
        key={value}
        className={`${styles.liveMiniScheme} ${schemeClass}`}
        style={schemeStyle}
        data-mantine-color-scheme={value}
        // Decorative duplicate of a real, interactive component (anchors, buttons, sort
        // headers, drag handles) — `inert` removes the whole subtree from focus and the
        // accessibility tree in one attribute, which `aria-hidden` alone does not do for
        // focusable descendants.
        inert
      >
        <MantineProvider
          forceColorScheme={value}
          withCssVariables={false}
          withGlobalClasses={false}
          theme={liveMiniTheme}
        >
          <div className={boxClassName} style={boxStyle}>
            {adapter.render(adapter.defaultProps, noop, { viewport: "desktop", scheme: value })}
          </div>
        </MantineProvider>
      </div>
    );
  };

  return (
    <div className={styles.liveMiniStage} aria-hidden="true">
      {scheme("dark")}
      {scheme("light")}
    </div>
  );
}

/**
 * Emits the shared CSS-variable / global-utility-class `<style>` blocks for the live-mini
 * schemes exactly ONCE per page, instead of once per card. Every card's scheme wrapper shares
 * the same two class names (`.liveMiniSchemeDark` / `.liveMiniSchemeLight`) regardless of
 * which item it renders, so a single `MantineProvider` per scheme — with no children, run
 * purely for its `withCssVariables`/`withGlobalClasses` output — covers every card via
 * ordinary CSS selector matching; each per-card provider in `LiveMini` above then disables
 * both. Without this, a catalog page with N live minis emits the identical variables block N
 * times (measured at 25.6 KB each in the three-item spike). Render this once, anywhere on a
 * page that uses `RegistryCardPreview`.
 */
export function LiveMiniStyles() {
  return (
    <>
      <MantineProvider
        forceColorScheme="dark"
        cssVariablesSelector={`.${styles.liveMiniSchemeDark}`}
        theme={liveMiniTheme}
      />
      <MantineProvider
        forceColorScheme="light"
        cssVariablesSelector={`.${styles.liveMiniSchemeLight}`}
        theme={liveMiniTheme}
        withGlobalClasses={false}
      />
    </>
  );
}

// H-8(b): `registry/lib/theme.ts` has no `colors` key — `createTheme()` only sets a stock
// `primaryColor`, `defaultRadius`, fonts, and a handful of component `defaultProps`. The old
// mini drew four hand-picked hex values under invented "Surface"/"Success"/"Text" role labels
// that theme.ts never declares. This derives the mini from the theme object itself so it can't
// state anything the theme doesn't actually do, and can't drift silently if theme.ts changes.
const PRIMARY_COLOR = houseTheme.primaryColor ?? "indigo";
// Mantine's own ramp for that color name — accurate because theme.ts never overrides `colors`,
// so "indigo" here IS Mantine's stock indigo, not a look-alike.
const FULL_RAMP =
  DEFAULT_THEME.colors[PRIMARY_COLOR as keyof typeof DEFAULT_THEME.colors] ??
  DEFAULT_THEME.colors.indigo;
// H-8(a): the lightest 3 steps of most Mantine ramps sit within ~1-2:1 contrast of the light
// panel background this mini renders on (`--manteen-demo-panel-active`, #edf0f8) — showing them
// would reproduce the exact "swatch visible only via its border" defect this fix exists to
// close. Measured (WCAG relative-luminance contrast, light panel): indigo[0..2] are 1.02-1.44:1,
// indigo[3] is 2.01:1; dropping to indigo[3..] is the smallest cut that clears that band.
const RAMP = FULL_RAMP.slice(3);
const COMPONENT_NAMES = Object.keys(houseTheme.components ?? {});

function ThemePreview() {
  return (
    <div className={styles.themeMini}>
      {/* One contiguous bar, no gaps: adjacent shades delimit each other by their own contrast
          even where an individual shade's contrast against the panel is weak, and the strip's
          outer border (below) keeps the whole thing visible regardless. */}
      <div className={styles.themeRamp}>
        {RAMP.map((hex) => (
          <span key={hex} className={styles.themeSwatch} style={{ background: hex }} />
        ))}
      </div>
      <dl className={styles.themeFacts}>
        <div>
          <dt>Color</dt>
          <dd>{PRIMARY_COLOR}</dd>
        </div>
        <div>
          <dt>Radius</dt>
          <dd>{String(houseTheme.defaultRadius)}</dd>
        </div>
        <div>
          <dt>Components</dt>
          <dd>{COMPONENT_NAMES.join(" · ")}</dd>
        </div>
      </dl>
    </div>
  );
}

function FilePreview() {
  return (
    <div className={styles.fileMini}>
      <IconFileDescription size={38} stroke={1.4} />
      <div>
        <strong>MANTINE-UI.txt</strong>
        <small>License and attribution file</small>
      </div>
    </div>
  );
}

// Items with no playground adapter (theme, mantine-ui-license) keep a bespoke, hand-drawn
// mini — there is no real component to render live. Anything not listed here falls through
// to FilePreview, same as the pre-generalization switch's default case.
const STATIC_PREVIEWS: Partial<Record<string, ReactNode>> = {
  theme: <ThemePreview />,
};

export function RegistryCardPreview({ name }: Props) {
  const adapter = adapterFor(name);
  const preview = adapter ? (
    <LiveMini adapter={adapter} />
  ) : (
    (STATIC_PREVIEWS[name] ?? <FilePreview />)
  );

  return (
    <div className={styles.preview} aria-hidden="true">
      {preview}
    </div>
  );
}
