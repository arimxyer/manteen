import { MantineProvider } from "@mantine/core";
import { IconCoin } from "@tabler/icons-react";
import { useEffect, useState } from "react";

// The real component from the real registry. `diff` below is its actual optional prop — see
// registry/ui/stat-card.tsx. Nothing here is a drawing of a StatCard.
import { StatCard } from "../../../../../registry/ui/stat-card";
import styles from "./OwnershipPanel.module.css";

/**
 * The page's one artifact, and its whole argument.
 *
 * Every peer site surveyed (notes/home-hero-research) opens with a grid of components. None of
 * them shows the part that is actually manteen's: source that landed in your repository, that you
 * edited, that upstream also changed, and a tool that reconciles the two. So this shows that
 * instead — the file on the left, the component it renders on the right, and an `update` arriving
 * between them.
 *
 * It animates because the claim is about time. A screenshot can show "a component"; only motion
 * can show "and it still updates."
 */

type Phase = "rest" | "detected" | "updating" | "done";

const PHASES: { phase: Phase; hold: number }[] = [
  { phase: "rest", hold: 2800 },
  { phase: "detected", hold: 2100 },
  { phase: "updating", hold: 2100 },
  // Longest: the reconciled state is the point, so it should be what a glancing reader catches.
  { phase: "done", hold: 3800 },
];

/**
 * Plain English, not CLI output.
 *
 * The first version narrated in raw commands (`manteen diff @house/stat-card`, `~ 1 change
 * upstream`). Ari could not tell what the panel was showcasing — and if the person who built the
 * product cannot read it, a first-time visitor has no chance. Commands describe what the tool
 * types; these describe what is happening to your code, which is the thing the hero is claiming.
 * `cmd` is shown in mono alongside, so the tool still gets named without leading with jargon.
 */
const STATUS: Record<
  Phase,
  { glyph: string; text: string; cmd?: string; tone: "idle" | "mod" | "add" }
> = {
  rest: { glyph: "•", text: "Installed. This file is yours to edit.", tone: "idle" },
  detected: { glyph: "~", text: "Upstream changed this component.", tone: "mod" },
  updating: { glyph: "$", text: "merging the change…", cmd: "manteen update", tone: "idle" },
  done: { glyph: "✓", text: "Merged — and your edits were kept.", tone: "add" },
};

/** Minimal JSX colouring. Hand-rolled rather than a highlighter dependency: five lines of markup
 *  do not justify shipping a tokenizer to every visitor. */
function Attr({ name, value }: { name: string; value: string }) {
  return (
    <>
      <span className={styles.attr}>{name}</span>
      <span className={styles.punct}>=</span>
      <span className={styles.value}>{value}</span>
    </>
  );
}

export default function OwnershipPanel() {
  const [index, setIndex] = useState(0);
  const [scheme, setScheme] = useState<"dark" | "light">("dark");
  const [reduced, setReduced] = useState(false);

  // Starlight stamps `data-theme` before hydration, so this has to be an effect: reading it during
  // render would disagree with what the browser already painted.
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

  // Reduced motion freezes on the reconciled frame rather than hiding the panel: a reader who
  // never sees the transition still sees the claim.
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
  const hasDiff = phase === "updating" || phase === "done";
  const status = STATUS[phase];

  return (
    <figure className={styles.panel} data-phase={phase}>
      <figcaption className={styles.bar}>
        <span className={styles.dot} data-tone={status.tone} />
        <span className={styles.path}>src/components/ui/stat-card.tsx</span>
        <span className={styles.badge}>in your repo</span>
      </figcaption>

      <div className={styles.body}>
        {/* Pane labels. Without them the two halves are just "some code" and "some component" and
            the causal link between them — this file renders that thing, and an update changes both
            at once — has to be inferred. It was not being inferred. */}
        <p className={styles.paneLabel} data-pane="code">
          the source that landed
        </p>
        <p className={styles.paneLabel} data-pane="render">
          what it renders
        </p>

        {/* Every line is gutter + ONE body span. The indentation cannot live as a bare `{"  "}`
            text node next to the gutter: `.line` is a flex container, and the flexbox spec drops
            whitespace-only anonymous flex items, so the two spaces were present in the DOM and
            simply never rendered. Keeping all content inside `.lineBody` (which is `white-space:
            pre`, not a flex item boundary) is what preserves it. */}
        <pre className={styles.code}>
          <code>
            <span className={styles.line}>
              <i className={styles.gutter} aria-hidden="true" />
              <span className={styles.lineBody}>
                <span className={styles.tag}>&lt;StatCard</span>
              </span>
            </span>
            <span className={styles.line}>
              <i className={styles.gutter} aria-hidden="true" />
              <span className={styles.lineBody}>
                {"  "}
                <Attr name="label" value='"Revenue"' />
              </span>
            </span>
            <span className={styles.line}>
              <i className={styles.gutter} aria-hidden="true" />
              <span className={styles.lineBody}>
                {"  "}
                <Attr name="value" value='"$48,200"' />
              </span>
            </span>
            {/* The added line keeps its box in every phase and only changes state. Mounting it
                would reflow the pane and jog the component beside it on every cycle. */}
            <span className={styles.line} data-state={hasDiff ? "added" : "pending"}>
              <i className={styles.gutter} aria-hidden="true">
                {hasDiff ? "+" : phase === "detected" ? "~" : ""}
              </i>
              <span className={styles.lineBody}>
                {"  "}
                <span className={styles.attr}>diff</span>
                <span className={styles.punct}>=</span>
                <span className={styles.brace}>{"{12.4}"}</span>
              </span>
            </span>
            <span className={styles.line}>
              <i className={styles.gutter} aria-hidden="true" />
              <span className={styles.lineBody}>
                <span className={styles.tag}>/&gt;</span>
              </span>
            </span>
          </code>
        </pre>

        <div className={styles.stage}>
          <MantineProvider
            forceColorScheme={scheme}
            theme={{ fontFamily: "Figtree, sans-serif", primaryColor: "indigo" }}
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
          <p className={styles.stageNote}>rendered live, not a screenshot</p>
        </div>
      </div>

      <p className={styles.status} data-tone={status.tone} aria-live="polite">
        <span className={styles.glyph} aria-hidden="true">
          {status.glyph}
        </span>
        {status.cmd && <code className={styles.cmd}>{status.cmd}</code>}
        <span>{status.text}</span>
      </p>
    </figure>
  );
}
