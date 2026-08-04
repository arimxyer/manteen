import type { ReactNode } from "react";

/**
 * The Wave 2 playground contract. One `<item-name>.playground.tsx` per registry item,
 * default-exporting a `PlaygroundAdapter`. Presence of the file IS the registration:
 * `RegistryItemDetail.astro`, `SiteHead.astro`, and `PlaygroundHost.tsx` all discover
 * adapters with `import.meta.glob("./playgrounds/*.playground.tsx")` — there is no
 * hand-maintained list to update, and no shared file for parallel authors to collide on.
 *
 * See README.md in this directory for the authoring guide.
 */

export type PlaygroundPropValue = string | number | boolean;
export type PlaygroundProps = Record<string, PlaygroundPropValue>;

interface ControlBase {
  /** Key into the adapter's props state. */
  prop: string;
  /** Uppercased eyebrow label above the control. */
  label: string;
}

export interface PlaygroundTextControl extends ControlBase {
  kind: "text";
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  maxLength?: number;
  /** Long free-text field (titles): takes the dominant share of its row, not an equal one. */
  wide?: boolean;
  /** Short-value field (ratings, counts): stays input-sized instead of growing. */
  compact?: boolean;
}

export interface PlaygroundSwitchControl extends ControlBase {
  kind: "switch";
}

export interface PlaygroundSelectControl extends ControlBase {
  kind: "select";
  options: ReadonlyArray<{ label: string; value: string }>;
}

export type PlaygroundControl =
  | PlaygroundTextControl
  | PlaygroundSwitchControl
  | PlaygroundSelectControl;

export interface PlaygroundStageOptions {
  /** Stage height floor; default 25rem (22rem under 32rem viewports). */
  minHeight?: string;
  /** Demo slot width on the desktop viewport setting; default `min(32.5rem, 100%)`. */
  desktopWidth?: string;
  /** Demo slot width on the mobile viewport setting; default `min(20rem, 100%)`. */
  mobileWidth?: string;
}

export interface PlaygroundRenderContext {
  /**
   * The shell's simulated viewport. The stage only narrows the slot — a component whose
   * responsive behavior watches real viewport media queries will NOT see this toggle, so
   * adapters for such components should branch on it explicitly (cards-carousel passes
   * slide sizing overrides, for example).
   */
  viewport: "desktop" | "mobile";
  /** The stage color scheme currently forced on the scoped MantineProvider. */
  scheme: "dark" | "light";
}

export interface PlaygroundAdapter {
  /** Registry item name; must equal the file's `<item-name>` prefix. */
  item: string;
  /** Initial control values; `Reset` returns to exactly this object. */
  defaultProps: PlaygroundProps;
  /** 2–4 controls that meaningfully change the render. */
  controls: PlaygroundControl[];
  /**
   * Renders the live component for the current control values. `recordEvent` feeds the
   * shell's aria-live event log — wire it into the component's callbacks so interactions
   * are visible ("onLike fired"). `context` is optional to consume.
   */
  render: (
    props: PlaygroundProps,
    recordEvent: (name: string) => void,
    context: PlaygroundRenderContext,
  ) => ReactNode;
  /**
   * The string `Copy JSX` puts on the clipboard for the current control values. Must be
   * paste-ready consumer code: real import alias values, no docs-site asset URLs.
   */
  renderJsx: (props: PlaygroundProps) => string;
  stage?: PlaygroundStageOptions;
}
