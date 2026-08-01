import { MantineProvider } from "@mantine/core";
import {
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ArticleCard } from "../../../../registry/mantine-ui/article-card/article-card";
import styles from "./ArticleCardPlayground.module.css";

const DEFAULT_PROPS = {
  title: "How resilient teams design for change",
  authorName: "Avery Stone",
  rating: "4.9",
  actions: true,
};

const ARTICLE_DESCRIPTION =
  "A field guide to building systems that remain clear, useful, and adaptable as the work evolves.";
const ARTICLE_IMAGE_SOURCE =
  "https://images.unsplash.com/photo-1778084356053-40103587d24f?auto=format&fit=crop&w=1080&q=80";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/?$/, "/");
const ARTICLE_IMAGE = `${BASE_URL}registry-assets/article-card/article-card-preview.jpg`;

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

export function ArticleCardPlayground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [scheme, setScheme] = useState<PreviewScheme>("dark");
  const [props, setProps] = useState(DEFAULT_PROPS);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  // H13 — the toolbar renders into the tab-bar row (RegistryItemDetail.astro's
  // `.registry-tab-row__toolbar`) rather than into its own band above the preview. `undefined`
  // is "not looked yet": rendering the toolbar in place first and moving it on the next frame
  // would flash it in the position the audit is asking us to leave.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null | undefined>(undefined);

  useEffect(() => {
    setToolbarSlot(document.querySelector<HTMLElement>("[data-playground-toolbar-slot]"));
  }, []);

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

  const jsx = useMemo(() => {
    const actionProps = props.actions
      ? "\n  onLike={() => {}}\n  onBookmark={() => {}}\n  onShare={() => {}}"
      : "";

    return `<ArticleCard
  image=${JSON.stringify(ARTICLE_IMAGE_SOURCE)}
  title=${JSON.stringify(props.title)}
  description=${JSON.stringify(ARTICLE_DESCRIPTION)}
  authorName=${JSON.stringify(props.authorName)}
  rating=${JSON.stringify(props.rating)}
  href="/articles/resilient-teams"${actionProps}
/>`;
  }, [props]);

  const recordEvent = (name: string) => setEventMessage(`${name} fired`);

  const reset = () => {
    setProps(DEFAULT_PROPS);
    setEventMessage(null);
    setCopyStatus("idle");
  };

  const copyJsx = async () => {
    try {
      await copyText(jsx);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  const toolbar = (
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
  );

  return (
    <div ref={rootRef} className={styles.scope} data-article-card-playground>
      {/* The portal target sits outside this subtree, so the toolbar takes `styles.scope` with
          it — every control's sizing rule in the module is scope-prefixed, and losing them is
          exactly the size mismatch H13 reports. `.scope` declares only variables and a colour,
          so a second one is inert. */}
      {toolbarSlot === undefined
        ? null
        : toolbarSlot
          ? createPortal(
              <div className={`${styles.scope} ${styles.toolbarHost}`}>{toolbar}</div>,
              toolbarSlot,
            )
          : toolbar}

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
        <section className={styles.previewFrame} aria-labelledby="article-card-preview-title">
          <header className={styles.frameHeader}>
            <div className={styles.liveStatus}>
              <span aria-hidden="true" />
              <strong id="article-card-preview-title">Live component</strong>
            </div>
            <span>
              {viewport === "desktop" ? "Isolated frame · 800 px" : "Isolated frame · 390 px"}
            </span>
          </header>
          <div className={styles.stage} data-viewport={viewport} data-preview-scheme={scheme}>
            <ArticleCard
              image={ARTICLE_IMAGE}
              title={props.title || "Untitled article"}
              description={ARTICLE_DESCRIPTION}
              authorName={props.authorName || "Unknown author"}
              rating={props.rating || undefined}
              href="#article-card-preview-title"
              onLike={props.actions ? () => recordEvent("onLike") : undefined}
              onBookmark={props.actions ? () => recordEvent("onBookmark") : undefined}
              onShare={props.actions ? () => recordEvent("onShare") : undefined}
              classNames={{
                root: styles.articleCard,
                image: styles.articleImage,
                rating: styles.articleRating,
                title: styles.articleTitle,
                footer: styles.articleFooter,
                action: styles.articleAction,
              }}
            />
          </div>
        </section>
      </MantineProvider>

      <section className={styles.playground} aria-labelledby="article-card-playground-title">
        <header className={styles.playgroundHeader}>
          <div>
            <h2 id="article-card-playground-title">Playground controls</h2>
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

        <div className={styles.fields}>
          <label className={styles.titleField}>
            <span>Title</span>
            <input
              value={props.title}
              onChange={(event) =>
                setProps((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Author</span>
            <input
              value={props.authorName}
              onChange={(event) =>
                setProps((current) => ({ ...current, authorName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Rating</span>
            <input
              value={props.rating}
              inputMode="decimal"
              maxLength={4}
              onChange={(event) =>
                setProps((current) => ({ ...current, rating: event.target.value }))
              }
            />
          </label>
          <div className={styles.actionsField}>
            <span>Actions</span>
            <button
              type="button"
              role="switch"
              aria-checked={props.actions}
              onClick={() => setProps((current) => ({ ...current, actions: !current.actions }))}
            >
              <span>{props.actions ? "On" : "Off"}</span>
              <span className={styles.switchTrack} aria-hidden="true">
                <span />
              </span>
            </button>
          </div>
        </div>

        <div className={styles.eventLog} aria-live="polite">
          <div>
            <strong>Events</strong>
            <span
              className={eventMessage ? styles.eventDot : styles.eventDotIdle}
              aria-hidden="true"
            />
            <code>{eventMessage ?? "No callbacks yet"}</code>
          </div>
          <div>
            {eventMessage && <span>now</span>}
            <button type="button" disabled={!eventMessage} onClick={() => setEventMessage(null)}>
              Clear
            </button>
          </div>
        </div>
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
