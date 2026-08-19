"use client";

import { animate, type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Swap, drawn as a chronology rather than as a pair of windows.
 *
 * WHY NOT A REEL
 *
 * The two-window reel put the whole claim into one hand-off: you had to catch
 * the exchange frame to see that nothing was ever half-replaced, and once the
 * exchange had happened the lower half of the plate had nothing left to say. But
 * the claim is not really about a moment. It is about a *duration* — that across
 * the entire run, every read of the published set returned a complete set. A
 * duration wants a time axis, so this plate is a trace chart: a spine at the
 * start of the run, a cap at the end of it, and the whole run on screen at once,
 * at every instant, in both outcomes.
 *
 * WHAT IS DRAWN
 *
 * Each published document is one unbroken horizontal lifeline running spine to
 * cap. That single graphic property — no lifeline anywhere on the plate ever has
 * a gap — *is* the invariant. It cannot be true only at the settled frame,
 * because a gap would sit in the finished chart forever.
 *
 * A read is drawn as one bracket spanning the whole set that exists at that
 * instant, never as a mark per document: a reader fetches a set, and marks per
 * document would suggest a reader could collect files individually and so end up
 * holding a mixture. Every bracket therefore lies wholly before the rule or
 * wholly after it, and each one visibly encloses a complete set.
 *
 * Publication is one vertical rule crossing every band of the plate. Existing
 * lifelines pass straight through it; the new document's lifeline *begins* at
 * it. A boundary in time is exactly what atomicity is, and a rule is the honest
 * way to draw a boundary in time.
 *
 * WHAT THE LOWER BAND IS NOT
 *
 * The band under the axis is a *composition profile*, not a write log, and its
 * visual language is deliberately unlike a lifeline: hollow, hairlined, stepped,
 * never solid. `renderOutput` assembles the entire path→content map in memory —
 * items sorted by `localeCompare`, then `registry.json` once the index has been
 * checked against the rendered set, then the ownership marker over all of it —
 * and throws before a single byte is staged. Drawing the band as files landing
 * on disk would assert that a refused build writes and rolls back, which is the
 * very thing this study exists to deny. Nothing crosses from the band up into
 * the lifelines: the only thing joining the two regions is the rule, and a rule
 * is a time, not a conveyance.
 *
 * THE REFUSAL IS STRUCTURAL
 *
 * The authoring schema puts no uniqueness constraint on item names, so two
 * catalog entries can compile to one output filename; `renderOutput` then throws
 * `duplicate-rendered-item`. Sorted by name the two land back to back. So the
 * refusal is drawn as what it is — a prospective lane carrying a name a
 * published lane already carries, joined in the label gutter, and a composition
 * profile that stops — rather than as a graphic overlapping itself, which reads
 * as a rendering fault instead of as a rule being enforced. And then the plate
 * keeps running: the lifelines continue, unbroken, all the way to the cap, with
 * reads still enclosing them. That long quiet tail is not dead space. It is the
 * claim.
 *
 * NO COUNTS
 *
 * Documents are representative. A set's size is a volatile catalog fact and is
 * asserted nowhere on the plate; what is fixed is the shape — item documents,
 * then the index that must be exactly the rendered set, then the marker — and
 * the compiler's sort order.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/** The published set. Representative documents, in the compiler's sort order. */
const PUBLISHED = ["data-table", "empty-state", "faq-simple", "page-header", "stat-card"] as const;

/** The document this build adds when it succeeds. */
const ADDED = "stats-grid";

/**
 * The name the refusing build's new item was pasted with. It is already in use,
 * so both entries compile to `page-header.json`. Chosen from the middle of the
 * sort order so the refusal lands mid-composition and the plate stays balanced
 * rather than emptying in its first fifth.
 */
const COLLIDING = "page-header";
const COLLIDING_LANE = PUBLISHED.indexOf(COLLIDING);

/** Item documents, then the index, then the marker. */
const CLAIMS = PUBLISHED.length + 1 + 2;
/** Claims made before the second claim on `page-header.json` stops the run. */
const CLAIMS_BEFORE_COLLISION = COLLIDING_LANE + 1;

const CLAIM_START = 0.045;
const CLAIM_STEP = 0.066;
const claimAt = (index: number) => CLAIM_START + index * CLAIM_STEP;

/** The single instant. Placed past two thirds so both halves of the chart carry weight. */
const RULE_AT = 0.655;
const COLLIDE_AT = claimAt(CLAIMS_BEFORE_COLLISION);
/** The composition is whole here, and holds for about a second before the rule. */
const WHOLE_AT = claimAt(CLAIMS - 1) + 0.02;
/** The refusal has settled here; the rest of the run is the published set carrying on. */
const REFUSED_AT = 0.5;
/** The cap states what the whole run showed, so it can only be drawn once the run is over. */
const CAP_AT = 0.97;

/**
 * One linear sweep, and everything on the plate is derived from it.
 *
 * Discrete events are read off the same progress value rather than off their own
 * timers. Two clocks would drift under any main-thread stall, and because every
 * mark on this plate sits at a time position, drift would detach marks from the
 * playhead — the one failure that reads as broken rather than as slow.
 */
const RUN_MS = 7400;

/**
 * Reads. Deliberately none within 0.05 of the rule: a bracket straddling the
 * instant would be the one thing on the plate that could imply a mixed set.
 */
const READS = [0.1, 0.22, 0.34, 0.46, 0.58, 0.73, 0.85, 0.95] as const;

const ROWS = { lane: 23, reads: 18, band: 56, steps: 36, cap: 22 } as const;
const COMPACT_ROWS = { lane: 18, reads: 13, band: 38, steps: 24, cap: 18 } as const;

type Outcome = "succeeds" | "refuses";
type Phase = "composing" | "whole" | "published" | "collided" | "refused";

const CAPTIONS: Record<Phase, { lead: string; detail: string }> = {
  composing: {
    lead: "A complete replacement is composed away from the published set.",
    detail: "Documents in name order, then the index, then the ownership marker.",
  },
  whole: {
    lead: "The replacement is whole.",
    detail: "Only a complete set can take the published position.",
  },
  published: {
    lead: "The set changes on a single instant.",
    detail: "Every read falls before the rule or after it. None falls inside it.",
  },
  collided: {
    lead: "Two items claim one output path.",
    detail: "The composition stops. Nothing is written anywhere.",
  },
  refused: {
    lead: "No rule was drawn.",
    detail: "The published lines run unbroken, and readers keep getting that set.",
  },
};

const CAP_CLAIM: Record<Outcome, { long: string; short: string }> = {
  succeeds: { long: "no read returned a partial set", short: "no partial read" },
  refuses: { long: "the published set was never touched", short: "never touched" },
};

const SUMMARY =
  "A chronology of two builds of one registry, read left to right. Every published document is " +
  "an unbroken line spanning the whole run, and each read is drawn as one bracket enclosing the " +
  "complete set that existed at that moment. When the build succeeds, a single vertical rule " +
  "marks the instant the set changes: the existing lines pass through it unbroken and the new " +
  "document's line begins at it, so every read bracket lies wholly before the rule or wholly " +
  "after it and none straddles it. When the build refuses — here because two items compile to " +
  "page-header.json — no rule is drawn at all, the composition below the axis simply stops " +
  "before anything is written, and every published line continues unbroken to the end of the run.";

export function SwapStudyB({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);
  const [phase, setPhase] = useState<Phase>(run > 0 ? "composing" : "published");
  const progress = useMotionValue(run > 0 ? 0 : 1);

  useEffect(() => {
    if (reduceMotion) return;
    const read = (value: number) => {
      const next: Phase =
        outcome === "succeeds"
          ? value >= RULE_AT
            ? "published"
            : value >= WHOLE_AT
              ? "whole"
              : "composing"
          : value >= REFUSED_AT
            ? "refused"
            : value >= COLLIDE_AT
              ? "collided"
              : "composing";
      setPhase((current) => (current === next ? current : next));
    };
    read(progress.get());
    return progress.on("change", read);
  }, [progress, reduceMotion, outcome]);

  useEffect(() => {
    if (reduceMotion) return;
    // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed —
    // is the finished chart, which already states its own result.
    if (run === 0 && presses === 0) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, { duration: RUN_MS / 1000, ease: "linear" });
    return () => controls.stop();
    // `presses` is the outcome trigger too: selecting an outcome always
    // increments it, so a switch mid-run restarts the sweep from zero rather
    // than springing the plate backwards through a state it never occupied.
  }, [presses, run, reduceMotion, progress]);

  if (reduceMotion) return <StaticPair />;

  const caption = CAPTIONS[phase];

  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center">
      <div className="mb-5 flex items-center gap-1">
        {(["succeeds", "refuses"] as const).map((value) => (
          <button
            key={value}
            type="button"
            // Two independent `aria-pressed` toggles rather than a radiogroup:
            // pressing the pressed one is a replay, which a radio cannot express.
            aria-pressed={outcome === value}
            onClick={() => {
              setOutcome(value);
              setPresses((count) => count + 1);
            }}
            className={cn(
              "relative rounded-sm px-2 pt-1 pb-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none",
              outcome === value ? "text-fd-foreground" : "text-fd-muted-foreground",
            )}
          >
            {value}
            {outcome === value ? (
              <motion.span
                layoutId="swap-study-b-outcome"
                className="pointer-events-none absolute inset-x-2 bottom-0.5 h-px bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      <Chart outcome={outcome} progress={progress} />

      <p className="mt-5 min-h-[2.75rem] text-[13px] leading-snug text-fd-foreground">
        {caption.lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{caption.detail}</span>
      </p>

      {/* Announced once the run has settled, rather than on every frame. */}
      <p className="sr-only" role="status">
        {phase === "published"
          ? "Build succeeded. The published set changed on a single instant; no read returned a partial set."
          : phase === "refused"
            ? "Build refused. Two items compiled to page-header.json, nothing was written, and the published set is unchanged."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

/**
 * The plate. One grid, one label gutter, one time axis.
 *
 * `progress` is a live sweep in the interactive tree and `null` in the reduced
 * motion tree, where every mark is rendered at its finished position by a plain
 * element. Nothing here animates on `null`, so the still is built out of
 * elements that never move rather than out of motion values set to nil.
 */
function Chart({
  outcome,
  progress,
  compact = false,
}: {
  outcome: Outcome;
  progress: MotionValue<number> | null;
  compact?: boolean;
}) {
  const refusing = outcome === "refuses";
  const row = compact ? COMPACT_ROWS : ROWS;
  const lanes = PUBLISHED.length + 1;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative min-w-0",
        compact ? "[--gutter:4rem] sm:[--gutter:6rem]" : "[--gutter:4.25rem] sm:[--gutter:6.5rem]",
      )}
    >
      {/* The spine, the rule, the playhead and the cap all cross every band, so
          they live in one overlay pinned to the chart column. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 left-[var(--gutter)]">
        <span className="absolute inset-y-0 left-0 w-px bg-fd-border" />
        <Cap progress={progress} />
      </div>
      <div
        className="pointer-events-none absolute top-0 right-0 left-[var(--gutter)]"
        style={{ bottom: row.cap + 1 }}
      >
        {refusing ? null : <Rule progress={progress} />}
        {progress ? <Playhead progress={progress} /> : null}
      </div>

      <div className="grid grid-cols-[var(--gutter)_1fr] items-center">
        <GutterLabel>reads</GutterLabel>
        <div className="relative" style={{ height: row.reads }}>
          {READS.map((at) => (
            <ReadMark key={at} progress={progress} at={at} />
          ))}
        </div>
      </div>

      <div className="relative grid grid-cols-[var(--gutter)_1fr] border-t">
        {/* Reads enclose the set, so their brackets are pinned to the lane block
            and to nothing else. They never reach the composition band. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 left-[var(--gutter)]">
          {READS.map((at) => (
            <ReadBracket
              key={at}
              progress={progress}
              at={at}
              height={row.lane * (!refusing && at > RULE_AT ? lanes : PUBLISHED.length)}
            />
          ))}
        </div>

        {PUBLISHED.map((name) => (
          <Lane key={name} name={name} height={row.lane} bare={compact}>
            <Lifeline progress={progress} />
          </Lane>
        ))}

        {/* The position this run is trying to add. It exists in both outcomes so
            the plate keeps its geometry, and in the refusal it is the drawing of
            the collision: a lane carrying a name a published lane already
            carries, joined in the gutter, capped where composition stopped. */}
        <Lane name={refusing ? COLLIDING : ADDED} height={row.lane} muted={refusing} bare={compact}>
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-fd-border" />
          {refusing ? (
            <span
              className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-fd-foreground/50"
              style={{ left: `${COLLIDE_AT * 100}%` }}
            />
          ) : (
            <NewLifeline progress={progress} />
          )}
        </Lane>

        {refusing ? (
          <span
            className="absolute w-2 border-t border-r border-b border-fd-foreground/40"
            style={{
              left: "calc(var(--gutter) - 0.65rem)",
              top: row.lane * COLLIDING_LANE + row.lane / 2,
              height: row.lane * (PUBLISHED.length - COLLIDING_LANE),
            }}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-[var(--gutter)_1fr] items-end border-t">
        <GutterLabel short="build" className="pb-1">
          this build
        </GutterLabel>
        <div className="relative" style={{ height: row.band }}>
          {/* A flat baseline the whole width: after the rule there is genuinely
              nothing staged, and a flat profile is how that reads. */}
          <span className="absolute inset-x-0 bottom-0 border-t border-fd-border" />
          <div className="absolute inset-x-0 bottom-0" style={{ height: row.steps }}>
            {Array.from({ length: CLAIMS }, (_, index) => (
              <Step
                key={claimAt(index)}
                progress={progress}
                index={index}
                height={row.steps}
                fills={!refusing || index < CLAIMS_BEFORE_COLLISION}
              />
            ))}
            {refusing ? <TwoClaims progress={progress} /> : null}
          </div>
          {refusing ? (
            <CollisionTag progress={progress} compact={compact} />
          ) : (
            <WholeBrace progress={progress} top={row.band - row.steps - 12} />
          )}
        </div>
      </div>

      {/* The run's closing statement, inside the chart and beside its cap. */}
      <div className="grid grid-cols-[var(--gutter)_1fr] border-t">
        <span />
        <div className="relative" style={{ height: row.cap }}>
          <CapClaim progress={progress} outcome={outcome} />
        </div>
      </div>
    </div>
  );
}

function GutterLabel({
  children,
  short,
  className,
}: {
  children: string;
  /** The form used below `sm`, where the gutter is 68px. Measured, not guessed. */
  short?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pr-2 font-mono text-[9px] tracking-[0.14em] text-fd-muted-foreground uppercase",
        className,
      )}
    >
      <span className="sm:hidden">{short ?? children}</span>
      <span className="hidden sm:inline">{children}</span>
    </span>
  );
}

/** One row: a name in the gutter, a track in the chart column. */
function Lane({
  name,
  height,
  muted = false,
  bare = false,
  children,
}: {
  name: string;
  height: number;
  muted?: boolean;
  /** Drop the extension: the refusal's point is two lanes with one name. */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="contents">
      <span
        className={cn(
          "flex items-center pr-2 font-mono text-[9px] sm:text-[10px]",
          muted ? "text-fd-muted-foreground" : "text-fd-secondary-foreground",
        )}
        style={{ height }}
      >
        {bare ? (
          <span className="truncate">{name}</span>
        ) : (
          <>
            <span className="truncate sm:hidden">{name}</span>
            <span className="hidden truncate sm:inline">{name}.json</span>
          </>
        )}
      </span>
      <div className="relative" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

/**
 * A published document, for the whole run. Solid, and the only thing on the
 * plate drawn that way — the composition band never gets this weight.
 */
function Lifeline({ progress }: { progress: MotionValue<number> | null }) {
  const className =
    "absolute inset-x-0 top-1/2 h-[2px] origin-left -translate-y-1/2 bg-fd-foreground/55";
  if (!progress) return <span className={className} />;
  return <motion.span className={className} style={{ scaleX: progress }} />;
}

/** The added document's line. It does not travel into place; it begins at the rule. */
function NewLifeline({ progress }: { progress: MotionValue<number> | null }) {
  if (!progress) {
    return (
      <span
        className="absolute top-1/2 right-0 h-[2px] -translate-y-1/2"
        style={{ left: `${RULE_AT * 100}%`, backgroundColor: BRAND_INK }}
      />
    );
  }
  return <MotionNewLifeline progress={progress} />;
}

function MotionNewLifeline({ progress }: { progress: MotionValue<number> }) {
  const scaleX = useTransform(progress, [RULE_AT, 1], [0, 1], { clamp: true });
  return (
    <motion.span
      className="absolute top-1/2 right-0 h-[2px] origin-left -translate-y-1/2"
      style={{ left: `${RULE_AT * 100}%`, backgroundColor: BRAND_INK, scaleX }}
    />
  );
}

/**
 * One read, drawn as one bracket around the whole set it returned — never as a
 * mark per document, which would suggest a reader could collect files one at a
 * time and so end up holding a mixture. Every bracket lies wholly on one side of
 * the rule, and the ones after it are taller by exactly the added document.
 */
function ReadBracket({
  progress,
  at,
  height,
}: {
  progress: MotionValue<number> | null;
  at: number;
  height: number;
}) {
  const glyph = (
    <>
      <span className="absolute top-0 left-0 h-px w-[7px] bg-fd-foreground/35" />
      <span className="absolute bottom-0 left-0 h-px w-[7px] bg-fd-foreground/35" />
      <span className="absolute inset-y-0 left-0 w-px bg-fd-foreground/[0.17] dark:bg-fd-foreground/[0.10]" />
    </>
  );
  if (!progress) {
    return (
      <span className="absolute top-0" style={{ left: `${at * 100}%`, height }}>
        {glyph}
      </span>
    );
  }
  return (
    <MotionReveal
      progress={progress}
      at={at}
      className="absolute top-0"
      style={{ left: `${at * 100}%`, height }}
    >
      {glyph}
    </MotionReveal>
  );
}

/** The read's position on the time axis. One mark per read, not one per document. */
function ReadMark({ progress, at }: { progress: MotionValue<number> | null; at: number }) {
  const className =
    "absolute bottom-0 size-[3px] -translate-x-1/2 rounded-full bg-fd-muted-foreground";
  const style = { left: `${at * 100}%` };
  if (!progress) return <span className={className} style={style} />;
  return <MotionReveal progress={progress} at={at} className={className} style={style} />;
}

/** The instant. One stroke crossing every band, drawn as the sweep reaches it. */
function Rule({ progress }: { progress: MotionValue<number> | null }) {
  if (!progress) {
    return (
      <>
        <span
          className="absolute inset-y-0 w-px"
          style={{ left: `${RULE_AT * 100}%`, backgroundColor: BRAND_INK }}
        />
        <RuleLabel />
      </>
    );
  }
  return <MotionRule progress={progress} />;
}

function RuleLabel() {
  return (
    <span
      className="absolute top-0 -translate-x-full pr-1.5 font-mono text-[9px] tracking-[0.14em] uppercase sm:translate-x-0 sm:pr-0 sm:pl-1.5"
      style={{ left: `${RULE_AT * 100}%`, color: BRAND_INK }}
    >
      published
    </span>
  );
}

function MotionRule({ progress }: { progress: MotionValue<number> }) {
  const scaleY = useTransform(progress, [RULE_AT, RULE_AT + 0.028], [0, 1], { clamp: true });
  const opacity = useTransform(progress, [RULE_AT + 0.02, RULE_AT + 0.055], [0, 1], {
    clamp: true,
  });
  return (
    <>
      <motion.span
        className="absolute inset-y-0 w-px origin-top"
        style={{ left: `${RULE_AT * 100}%`, backgroundColor: BRAND_INK, scaleY }}
      />
      <motion.span style={{ opacity }}>
        <RuleLabel />
      </motion.span>
    </>
  );
}

/** The end of the run, closing the chart against its spine. */
function Cap({ progress }: { progress: MotionValue<number> | null }) {
  const className = "absolute inset-y-0 right-0 w-[2px] bg-fd-foreground/45";
  if (!progress) return <span className={className} />;
  return <MotionReveal progress={progress} at={CAP_AT} span={0.02} className={className} />;
}

function CapClaim({
  progress,
  outcome,
}: {
  progress: MotionValue<number> | null;
  outcome: Outcome;
}) {
  const claim = CAP_CLAIM[outcome];
  const glyph = (
    <span className="absolute inset-y-0 right-0 flex items-center pr-2 font-mono text-[9px] tracking-[0.1em] text-fd-foreground uppercase sm:text-[10px]">
      <span className="sm:hidden">{claim.short}</span>
      <span className="hidden sm:inline">{claim.long}</span>
    </span>
  );
  if (!progress) return glyph;
  return (
    <MotionReveal progress={progress} at={CAP_AT} span={0.02} className="absolute inset-0">
      {glyph}
    </MotionReveal>
  );
}

/** The sweep's own leading edge. It is a drawing instrument, so it leaves at the end. */
function Playhead({ progress }: { progress: MotionValue<number> }) {
  const left = useTransform(progress, (value) => `${value * 100}%`);
  const opacity = useTransform(progress, [0, 0.015, 0.955, 0.995], [0, 1, 1, 0]);
  return (
    <motion.span className="absolute inset-y-0 -ml-px w-px bg-brand/45" style={{ left, opacity }} />
  );
}

/**
 * One claim on one output path. Hollow and stepped, so the band can never be
 * read as files landing: nothing has been written when these are drawn.
 */
function Step({
  progress,
  index,
  height,
  fills,
}: {
  progress: MotionValue<number> | null;
  index: number;
  height: number;
  fills: boolean;
}) {
  const at = claimAt(index);
  const box = {
    left: `${(at - CLAIM_STEP * 0.42) * 100}%`,
    width: `${CLAIM_STEP * 0.84 * 100}%`,
    height: Math.round(((index + 1) / CLAIMS) * height),
  };

  return (
    <>
      <span className="absolute bottom-0 border border-dashed border-fd-border" style={box} />
      {fills ? <StepFill progress={progress} box={box} at={at} /> : null}
    </>
  );
}

function StepFill({
  progress,
  box,
  at,
}: {
  progress: MotionValue<number> | null;
  box: { left: string; width: string; height: number };
  at: number;
}) {
  const className = "absolute bottom-0 origin-bottom border border-brand/45 bg-brand/[0.09]";
  if (!progress) return <span className={className} style={box} />;
  return <MotionStepFill progress={progress} box={box} at={at} className={className} />;
}

function MotionStepFill({
  progress,
  box,
  at,
  className,
}: {
  progress: MotionValue<number>;
  box: { left: string; width: string; height: number };
  at: number;
  className: string;
}) {
  const scaleY = useTransform(progress, [at, at + 0.012], [0, 1], { clamp: true });
  return <motion.span className={className} style={{ ...box, scaleY }} />;
}

/**
 * Two claims, one path — drawn as a join rather than as two things on top of
 * each other. An overlap reads as a rendering fault; a join reads as the
 * uniqueness rule the compiler actually enforces.
 */
function TwoClaims({ progress }: { progress: MotionValue<number> | null }) {
  const glyph = (
    <>
      <span className="absolute top-0 left-0 size-[5px] border border-fd-foreground/70" />
      <span className="absolute top-0 right-0 size-[5px] border border-fd-foreground/70" />
      <span className="absolute top-[2px] left-[2px] h-px w-[19px] bg-fd-foreground/70" />
      <span className="absolute top-[2px] left-[11px] h-[18px] w-px bg-fd-foreground/70" />
      <span className="absolute bottom-0 left-[9px] size-[5px] rounded-full bg-fd-foreground/80" />
    </>
  );
  const className = "absolute bottom-0 h-[23px] w-[23px] -translate-x-1/2";
  const style = { left: `${COLLIDE_AT * 100}%` };
  if (!progress) {
    return (
      <span className={className} style={style}>
        {glyph}
      </span>
    );
  }
  return (
    <MotionReveal progress={progress} at={COLLIDE_AT} className={className} style={style}>
      {glyph}
    </MotionReveal>
  );
}

function CollisionTag({
  progress,
  compact,
}: {
  progress: MotionValue<number> | null;
  compact: boolean;
}) {
  const glyph = (
    <span
      className="absolute top-0 flex items-center gap-1.5 font-mono text-[8px] tracking-[0.1em] text-fd-foreground uppercase sm:text-[9px]"
      style={{ left: `${COLLIDE_AT * 100}%`, marginLeft: 14 }}
    >
      <span className="h-px w-2 shrink-0 bg-fd-foreground/45" />
      {/* The lane gutter already shows the name twice, so the tag names the rule
          that was broken rather than repeating the path. */}
      <span className="sm:hidden">two claims</span>
      <span className="hidden whitespace-nowrap sm:inline">
        {compact ? "two claims" : "one path · two claims"}
      </span>
    </span>
  );
  if (!progress) return glyph;
  return (
    <MotionReveal progress={progress} at={COLLIDE_AT} className="absolute inset-0">
      {glyph}
    </MotionReveal>
  );
}

/**
 * The hold, drawn once: a brace over every claim at the moment the composition
 * is whole. It is the only mark in the band that spans all of them, because
 * being whole is the only property the set acquires all at once — and it is what
 * the rule then acts on. It stays where it happened; a chronology does not erase
 * a past event, and the band right of the rule is empty because nothing was
 * composed there.
 */
function WholeBrace({ progress, top }: { progress: MotionValue<number> | null; top: number }) {
  const style = {
    top,
    left: `${(claimAt(0) - CLAIM_STEP * 0.42) * 100}%`,
    right: `${(1 - (claimAt(CLAIMS - 1) + CLAIM_STEP * 0.42)) * 100}%`,
    height: 6,
  };
  const className = "absolute border-t border-r border-l border-brand/45";
  if (!progress) return <span className={className} style={style} />;
  return (
    <MotionReveal
      progress={progress}
      at={WHOLE_AT}
      span={0.012}
      className={className}
      style={style}
    />
  );
}

/**
 * A mark becoming present as the sweep reaches its time position — the only
 * shared reveal on the plate, so nothing can appear at an x the sweep has not
 * arrived at. Not used in the reduced-motion tree, which renders plain elements.
 */
function MotionReveal({
  progress,
  at,
  span = 0.006,
  className,
  style,
  children,
}: {
  progress: MotionValue<number>;
  at: number;
  span?: number;
  className?: string;
  style?: Record<string, string | number>;
  children?: ReactNode;
}) {
  const opacity = useTransform(progress, [at, at + span], [0, 1], { clamp: true });
  return (
    <motion.span className={className} style={{ ...style, opacity }}>
      {children}
    </motion.span>
  );
}

/**
 * Reduced motion: both finished charts, one above the other, with no control —
 * there is nothing left for it to reveal. Every mark is a plain element at its
 * final position, so there is no positional movement and no crossfade.
 */
function StaticPair() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-6">
      <StaticOutcome
        heading="succeeds"
        outcome="succeeds"
        lead="The set changed on a single instant."
        detail="The lines pass through the rule unbroken and the new line begins at it, so each read encloses a complete set."
      />
      <StaticOutcome
        heading="refuses"
        outcome="refuses"
        lead="No rule was drawn."
        detail="Two items claimed page-header.json, so nothing was written and every published line runs unbroken to the cap."
      />
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

function StaticOutcome({
  heading,
  outcome,
  lead,
  detail,
}: {
  heading: string;
  outcome: Outcome;
  lead: string;
  detail: string;
}) {
  return (
    <section className="min-w-0">
      <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
        {heading}
      </p>
      <Chart outcome={outcome} progress={null} compact />
      <p className="pt-3 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}
