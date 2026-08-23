import { MantineProvider } from "@mantine/core";
import {
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";
import type { CSSProperties } from "react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./PlaygroundShell.module.css";
import type { PlaygroundAdapter, PlaygroundControl } from "./playgrounds/contract";

type Viewport = "desktop" | "mobile";
type PreviewScheme = "dark" | "light";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

/**
 * The generic playground shell: scoped MantineProvider, Starlight theme sync, viewport and
 * scheme toggles, declarative controls, copy-JSX, and the aria-live event log. Adapters
 * (see playgrounds/contract.ts) supply only what differs per item.
 */
export function Playground({ adapter }: { adapter: PlaygroundAdapter }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [scheme, setScheme] = useState<PreviewScheme>("dark");
  // H-overlay-containment — Mantine portals (HoverCard/Menu/Popover/Tooltip dropdowns,
  // Modal/Drawer) default to `document.body`, which escapes this styled-div "isolated frame"
  // entirely: a mega-menu dropdown paints over the shell's own controls, and a mobile Drawer
  // covers the real Starlight header/sidebar. `theme.components.Portal.defaultProps.target`
  // (read via `useProps` by every OptionalPortal call that doesn't pass its own `portalProps`)
  // redirects ALL of them into this node instead, generically — no adapter needs to know.
  // A ref alone isn't enough: the theme object is only re-read on render, and nothing forces a
  // render between mount and the first hover/click, so the target node is captured in state via
  // a callback ref, guaranteeing a render (and a populated theme.target) before any overlay can
  // open. DOM placement alone doesn't fix Drawer/Modal though — they use `position: fixed`,
  // which escapes ANY portal target and paints at viewport size unless an ANCESTOR establishes
  // a containing block for fixed descendants; see `.stage`'s `contain: layout` in the CSS
  // module, which is what actually clips them to the stage box.
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [props, setProps] = useState(adapter.defaultProps);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  // RC-1 / H-4 — a portalled dropdown is out-of-flow (`position: absolute` inside
  // `.portalHost`), so it never contributes to `.stage`'s own flex-computed height, only to its
  // *scrollable* overflow: `scrollHeight` grows past `clientHeight` and the extra content is
  // clipped with nothing but a plain scrollbar to find it. `portalHost.scrollHeight` already
  // measures the true extent (verified: it reflects an absolutely-positioned child's bounds
  // even though the host itself never resizes), so once a dropdown mounts we read that gap and
  // report it via `--playground-stage-overflow`, which `.stage` turns into extra bottom padding.
  //
  // That padding is not a one-shot fix, though — measured empirically. `.stage` centers its
  // single child (`align-items: center`), and while the stage's total height is still pinned to
  // its `min-height` floor (small demo content, tall floor — true for every current adapter),
  // adding bottom padding *shrinks* the content area available for centering, which shifts the
  // centered trigger the dropdown is anchored to upward. That's a smaller gap than before, but
  // not zero: a first pass here took header-mega-menu from 43% of its dropdown visible to 71%,
  // not 100%. So this re-measures after every `stageOverflow` change, not just once — each pass
  // needs a smaller correction than the last (the trigger has less room left to move), so it's a
  // converging series rather than a loop: `stageIterations` caps it hard in case some future
  // adapter's geometry doesn't converge, rather than trusting the math to always terminate.
  const [stageOverflow, setStageOverflow] = useState(0);
  const stageIterations = useRef(0);
  // stageOverflow is read only through the ref-backed iteration guard inside the effect below;
  // depending on it in that effect is what drives each convergence pass (see the comment above
  // its `measure` function).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional, see comment above.
  useEffect(() => {
    if (!portalTarget) return;
    let raf1 = 0;
    let raf2 = 0;
    const measure = () => {
      if (!portalTarget.isConnected) return;
      // Some overlays (verified: a Drawer's root) stay mounted in `.portalHost` after their
      // first render instead of unmounting when closed — `children.length` alone can't tell
      // "closed" from "open" once that's happened, so a dropdown closing would leave the
      // reservation stuck at its last value forever. A closed one renders at `offsetHeight: 0`
      // though (verified), so only children actually taking up space count as "something is
      // open."
      const hasOpenOverlay = Array.from(portalTarget.children).some(
        (child) => (child as HTMLElement).offsetHeight > 0,
      );
      if (!hasOpenOverlay) {
        stageIterations.current = 0;
        setStageOverflow(0);
        return;
      }
      // `scrollHeight - clientHeight` is the gap still visible RIGHT NOW, at whatever
      // `stageOverflow` is already applied — not the total the stage needs from zero. Adding
      // padding pulls the centered trigger upward too (see the comment above), so each pass's
      // remaining gap is smaller than the last but never jumps straight to 0: accumulate onto
      // the current value rather than replacing it, or the first correction (which typically
      // over-shoots) looks like the final answer and every later, smaller correction gets
      // silently dropped by a "did it grow" check.
      const remaining = Math.max(0, portalTarget.scrollHeight - portalTarget.clientHeight);
      if (remaining < 1 || stageIterations.current >= 12) return;
      stageIterations.current += 1;
      setStageOverflow((current) => current + remaining);
    };
    const remeasure = () => {
      cancelAnimationFrame(raf1);
      // Two rAFs: the dropdown's floating-ui position is committed in a layout effect that
      // runs after the triggering mutation/render, so measuring on the very next frame can
      // catch it mid-placement.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(measure);
      });
    };
    const observer = new MutationObserver(() => {
      stageIterations.current = 0;
      remeasure();
    });
    observer.observe(portalTarget, { childList: true });
    remeasure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [portalTarget, stageOverflow]);

  // H5 — the stage used to open dark on a light page regardless of the reader's theme; the
  // toggle already proved the light path renders correctly, so only the default was wrong.
  // Synced in an effect rather than a lazy initializer because Starlight stamps `data-theme`
  // before hydration: reading it during render would disagree with the SSR output.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setScheme(root.dataset.theme === "light" ? "light" : "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const previewTitleId = `${idBase}-preview-title`;
  const playgroundTitleId = `${idBase}-playground-title`;

  const setProp = (prop: string, value: string | number | boolean) =>
    setProps((current) => ({ ...current, [prop]: value }));

  // Each event replaces the toast and restarts its dismissal clock.
  const eventTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(eventTimer.current), []);

  const recordEvent = (name: string) => {
    setEventMessage(`${name} fired`);
    window.clearTimeout(eventTimer.current);
    eventTimer.current = window.setTimeout(() => setEventMessage(null), 2600);
  };

  const reset = () => {
    setProps(adapter.defaultProps);
    window.clearTimeout(eventTimer.current);
    setEventMessage(null);
    setCopyStatus("idle");
  };

  const copyJsx = async () => {
    try {
      await copyText(adapter.renderJsx(props));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  const renderControl = (control: PlaygroundControl) => {
    if (control.kind === "switch") {
      const checked = Boolean(props[control.prop]);
      // H-2 — the visible label was a plain sibling <span>, never associated with the
      // control, so every switch's only accessible text was its own "On"/"Off" span and
      // announced identically ("On, switch") no matter which field it was. `aria-labelledby`
      // *replaces* the accessible name outright (it doesn't concatenate with the button's own
      // text), so pointing it only at this id gives the name "Descriptions" while the checked
      // state still comes through role="switch" + aria-checked — not "Descriptions On" fighting
      // the state on every toggle. select/text-field controls below are already inside a real
      // <label> and get this for free; the switch is a <div> because its label and control
      // aren't naturally nestable the way a real <label> wants.
      const labelId = `${idBase}-switch-${control.prop}`;
      return (
        <div key={control.prop} className={styles.switchField}>
          <span id={labelId}>{control.label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelId}
            onClick={() => setProp(control.prop, !checked)}
          >
            <span>{checked ? "On" : "Off"}</span>
            <span className={styles.switchTrack} aria-hidden="true">
              <span />
            </span>
          </button>
        </div>
      );
    }

    if (control.kind === "select") {
      return (
        <label key={control.prop}>
          <span>{control.label}</span>
          <select
            value={String(props[control.prop])}
            onChange={(event) => setProp(control.prop, event.target.value)}
          >
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    // M-3 — the field's width comes from its category (compact/plain/wide), not from the
    // value's length, so a long default clips mid-glyph with no ellipsis and no way to read
    // the rest. `title` gives a hover/focus tooltip with the full value; skip it when empty so
    // we don't emit a useless `title=""`. The ellipsis itself is CSS (see `.fields input` in
    // the module) — text-overflow needs the value present here to have something to truncate.
    const value = String(props[control.prop]);
    return (
      <label
        key={control.prop}
        className={
          control.wide ? styles.wideField : control.compact ? styles.compactField : undefined
        }
      >
        <span>{control.label}</span>
        <input
          value={value}
          title={value || undefined}
          placeholder={control.placeholder}
          inputMode={control.inputMode}
          maxLength={control.maxLength}
          onChange={(event) => setProp(control.prop, event.target.value)}
        />
      </label>
    );
  };

  const stageStyle = {
    "--playground-stage-min-height": adapter.stage?.minHeight,
    "--playground-stage-overflow": stageOverflow ? `${stageOverflow}px` : undefined,
  } as CSSProperties;
  const slotStyle = {
    "--playground-desktop-width": adapter.stage?.desktopWidth,
    "--playground-mobile-width": adapter.stage?.mobileWidth,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={styles.scope} data-playground={adapter.item}>
      <div className={styles.toolbar}>
        {/* biome-ignore lint/a11y/useSemanticElements: H12 — a <fieldset> here spilled its two
            buttons 12px below its own bottom border at 390px, because the sr-only <legend> still
            reserves space in the fieldset box model. The audit's fix directs replacing it with a
            div + aria-label, which is the exposed-group semantics without the broken geometry. */}
        <div className={styles.viewportControl} role="group" aria-label="Preview viewport">
          <button
            type="button"
            className={viewport === "desktop" ? styles.activeButton : undefined}
            aria-pressed={viewport === "desktop"}
            onClick={() => setViewport("desktop")}
          >
            <IconDeviceDesktop aria-hidden="true" size={14} />
            Desktop
          </button>
          <button
            type="button"
            className={viewport === "mobile" ? styles.activeButton : undefined}
            aria-pressed={viewport === "mobile"}
            onClick={() => setViewport("mobile")}
          >
            <IconDeviceMobile aria-hidden="true" size={14} />
            Mobile
          </button>
        </div>
        <button
          type="button"
          className={styles.themeButton}
          aria-pressed={scheme === "light"}
          onClick={() => setScheme((current) => (current === "dark" ? "light" : "dark"))}
        >
          {scheme === "dark" ? (
            <IconMoon aria-hidden="true" size={14} />
          ) : (
            <IconSun aria-hidden="true" size={14} />
          )}
          {scheme === "dark" ? "Dark" : "Light"}
        </button>
      </div>

      <MantineProvider
        forceColorScheme={scheme}
        cssVariablesSelector={`.${styles.scope}`}
        getRootElement={() => rootRef.current ?? undefined}
        theme={{
          fontFamily: "var(--__sl-font)",
          headings: { fontFamily: "var(--__sl-font)" },
          primaryColor: "indigo",
          components: {
            Portal: {
              defaultProps: { target: portalTarget ?? undefined },
            },
            // Modal/Drawer lock the REAL document's scroll by default (react-remove-scroll,
            // `lockScroll: true`) — correct for a real full-page overlay, wrong here: this is a
            // contained demo element, and the surrounding docs page must stay scrollable while
            // it's open. `Drawer`/`Modal` (not just their `*Root`) need the override: each has
            // its own hardcoded `lockScroll: true` default and forwards it as an *explicit*
            // prop to its `*Root`, where an explicit prop wins over that root's own theme
            // default — setting only `DrawerRoot`/`ModalRoot` would silently no-op.
            Drawer: { defaultProps: { lockScroll: false } },
            Modal: { defaultProps: { lockScroll: false } },
          },
        }}
      >
        <section className={styles.previewFrame} aria-labelledby={previewTitleId}>
          <header className={styles.frameHeader}>
            <div className={styles.liveStatus}>
              <span aria-hidden="true" />
              <strong id={previewTitleId}>Live component</strong>
            </div>
            <span>
              {viewport === "desktop"
                ? "Isolated frame · desktop width"
                : "Isolated frame · mobile width"}
            </span>
          </header>
          {/* `not-content` is Starlight's escape hatch: every `.sl-markdown-content` rule
              excludes `.not-content *`. Without it the demo is styled as PROSE — content
              tables get shrink-to-fit display (a left-hugging half-width DataTable), demo
              anchors get doc-link colors (two "View" buttons in different tints). */}
          <div
            className={`${styles.stage} not-content`}
            data-viewport={viewport}
            data-preview-scheme={scheme}
            style={stageStyle}
          >
            <div className={styles.demoSlot} style={slotStyle}>
              {adapter.render(props, recordEvent, { viewport, scheme, surface: "playground" })}
            </div>
            {/* Event feedback lives ON the stage, next to the interaction that caused it —
                a transient toast, not a permanent bar (Ari's call, 2026-08-03). The visual
                chip is aria-hidden; the persistent live region below the controls does the
                announcing, so screen readers hear each event exactly once. */}
            {eventMessage && (
              <div className={styles.eventToast} aria-hidden="true">
                <span className={styles.eventDot} />
                <code>{eventMessage}</code>
              </div>
            )}
            {/* Portal target for every overlay this demo opens (see theme.components.Portal
                above) — empty and inert until something portals into it, so it must never
                intercept pointer events itself (see .portalHost in the CSS module) or it would
                shadow the demo content underneath it whenever nothing is open. */}
            <div ref={setPortalTarget} className={styles.portalHost} />
          </div>
        </section>
      </MantineProvider>

      <section className={styles.playground} aria-labelledby={playgroundTitleId}>
        <header className={styles.playgroundHeader}>
          <div>
            <h2 id={playgroundTitleId}>Playground controls</h2>
            <p>Curated props from this item&apos;s preview adapter.</p>
          </div>
          <div className={styles.playgroundActions}>
            <button type="button" onClick={reset}>
              Reset
            </button>
            <button type="button" onClick={copyJsx}>
              <IconCopy aria-hidden="true" size={13} />
              {copyStatus === "copied"
                ? "Copied"
                : copyStatus === "failed"
                  ? "Copy failed"
                  : "Copy JSX"}
            </button>
          </div>
        </header>

        <div className={styles.fields}>{adapter.controls.map(renderControl)}</div>

        <span className={styles.copyAnnouncement} aria-live="polite">
          {eventMessage ?? ""}
        </span>
        <span className={styles.copyAnnouncement} aria-live="polite">
          {copyStatus === "copied"
            ? "Current JSX copied to clipboard."
            : copyStatus === "failed"
              ? "Current JSX could not be copied."
              : ""}
        </span>
      </section>
    </div>
  );
}
