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
  const [props, setProps] = useState(adapter.defaultProps);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

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
      return (
        <div key={control.prop} className={styles.switchField}>
          <span>{control.label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
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

    return (
      <label
        key={control.prop}
        className={
          control.wide ? styles.wideField : control.compact ? styles.compactField : undefined
        }
      >
        <span>{control.label}</span>
        <input
          value={String(props[control.prop])}
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
          <div
            className={styles.stage}
            data-viewport={viewport}
            data-preview-scheme={scheme}
            style={stageStyle}
          >
            <div className={styles.demoSlot} style={slotStyle}>
              {adapter.render(props, recordEvent)}
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
