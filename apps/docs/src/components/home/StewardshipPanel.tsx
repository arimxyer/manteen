import { MantineProvider } from "@mantine/core";
import { IconCoin } from "@tabler/icons-react";
import { useEffect, useState } from "react";

// The real component, from the real registry — the same relative-depth reach the playground
// adapters use. Nothing here is a mock-up of a StatCard; `diff` below is its actual optional prop.
import { StatCard } from "../../../../../registry/ui/stat-card";
import styles from "./StewardshipPanel.module.css";

/**
 * The one animated thing on the page (see docs/home-art-direction.md, "Motion").
 *
 * It performs the product rather than decorating it: a component that already landed in your repo
 * is shown alongside its source, upstream changes, `manteen diff` marks the change, `manteen
 * update` reconciles it, and the LIVE component above gains a row — because `diff?: number` is a
 * genuine optional prop of `registry/ui/stat-card.tsx`. The animation and the API are the same
 * fact, which is why this can't be told with a screenshot.
 */

type Phase = "rest" | "detected" | "updating" | "done";

// Dwell time per phase, ms. `done` is longest so the reconciled state — the point of the whole
// loop — is what a glancing reader is most likely to actually catch.
const PHASES: { phase: Phase; hold: number }[] = [
  { phase: "rest", hold: 2600 },
  { phase: "detected", hold: 2000 },
  { phase: "updating", hold: 2200 },
  { phase: "done", hold: 3400 },
];

const STATUS: Record<Phase, { prompt: string; text: string; tone: "idle" | "mod" | "add" }> = {
  rest: { prompt: "$", text: "manteen diff @house/stat-card", tone: "idle" },
  detected: { prompt: "~", text: "1 change upstream · stat-card.tsx", tone: "mod" },
  updating: { prompt: "$", text: "manteen update @house/stat-card", tone: "idle" },
  done: { prompt: "✓", text: "updated · your edits preserved", tone: "add" },
};

export default function StewardshipPanel() {
  const [index, setIndex] = useState(0);
  const [scheme, setScheme] = useState<"dark" | "light">("dark");
  const [reduced, setReduced] = useState(false);

  // Same sync Playground.tsx uses (H5): Starlight stamps `data-theme` before hydration, so
  // reading it during render would disagree with what the browser already painted.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setScheme(root.dataset.theme === "light" ? "light" : "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Reduced motion freezes on `done` rather than removing the panel's meaning: the reconciled
  // state is the informative frame, so a reader who never sees the transition still sees the point.
  useEffect(() => {
    if (reduced) {
      setIndex(PHASES.findIndex((entry) => entry.phase === "done"));
      return;
    }
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % PHASES.length),
      PHASES[index].hold,
    );
    return () => window.clearTimeout(timer);
  }, [index, reduced]);

  const phase = PHASES[index].phase;
  // The prop arrives with `updating` and stays through `done` — the card keeps what the update
  // gave it, which is the whole claim.
  const hasDiff = phase === "updating" || phase === "done";
  const status = STATUS[phase];

  return (
    <figure className={`spec__panel ${styles.panel}`} data-phase={phase}>
      <figcaption className="spec__panelHead">
        <span className={styles.dot} data-tone={phase === "rest" ? "idle" : status.tone} />
        <span className="spec__label">src/components/ui/stat-card.tsx</span>
        <span className="spec__label">owned</span>
      </figcaption>

      <div className={styles.stage}>
        <MantineProvider
          forceColorScheme={scheme}
          theme={{ fontFamily: "var(--__sl-font)", primaryColor: "indigo" }}
          // Scoped to this island so the provider's variables can't leak onto the page's own
          // tokens, which are hand-authored in custom.css.
          cssVariablesSelector={`.${styles.stage}`}
        >
          <div className={styles.card}>
            <StatCard
              label="Revenue"
              value="$48,200"
              diff={hasDiff ? 12.4 : undefined}
              icon={<IconCoin size={20} />}
            />
          </div>
        </MantineProvider>
      </div>

      {/* No aria-label: `aria-label` is not supported on <pre>, and the figcaption above already
          names this source by its path. */}
      <pre className={styles.source}>
        <code>
          <span className={styles.line}>
            <span className={styles.gutter} aria-hidden="true" />
            {"<StatCard"}
          </span>
          <span className={styles.line}>
            <span className={styles.gutter} aria-hidden="true" />
            {'  label="Revenue"'}
          </span>
          <span className={styles.line}>
            <span className={styles.gutter} aria-hidden="true" />
            {'  value="$48,200"'}
          </span>
          {/* The added line keeps its box at every phase — it only changes state. Mounting it
              would reflow the panel mid-loop and make the card below jump. */}
          <span className={styles.line} data-state={hasDiff ? "added" : "pending"}>
            <span className={styles.gutter} aria-hidden="true">
              {hasDiff ? "+" : phase === "detected" ? "~" : ""}
            </span>
            <span className={styles.added}>{"  diff={12.4}"}</span>
          </span>
          <span className={styles.line}>
            <span className={styles.gutter} aria-hidden="true" />
            {"/>"}
          </span>
        </code>
      </pre>

      <p className={styles.status} data-tone={status.tone}>
        <span className={styles.statusPrompt} aria-hidden="true">
          {status.prompt}
        </span>
        <span>{status.text}</span>
      </p>
    </figure>
  );
}
