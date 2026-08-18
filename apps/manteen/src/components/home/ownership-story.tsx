"use client";

import { LoaderCircle, Play, RotateCcw } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { AnimatedBeam } from "@/components/home/animated-beam";
import { cn } from "@/lib/cn";

/**
 * A four-beat storyboard of what owning the source costs you, which is nothing:
 * install, your edit, upstream's edit, and the merge that reconciles them
 * against the copy neither of you touched.
 *
 * Manteen is the hub and every wire runs through it. That is the claim — the
 * three files never talk to each other, and the tool is what makes an upstream
 * change safe to accept — so no wire may connect two documents directly.
 *
 * Sources left, tool centre, your file right. A triangle was built and reviewed
 * against this — ancestor above, the two that diverged below, which is how
 * version control has always drawn a three-way merge — and Ari chose the row
 * (2026-08-15). It is in the history at 61c7cc5 behind a `layout` prop if the
 * question reopens.
 *
 * The row's known cost, so nobody rediscovers it as a bug: it puts the base on
 * the side the eye reads as inputs, and at the install beat the base is
 * WRITTEN rather than read. The pulse running outward on that wire is what
 * carries the correction, which is why its direction is not decorative.
 */
type Origin = "base" | "local" | "upstream";

type Line = { id: string; indent: 0 | 1 | 2; base: number; next: number; origin: Origin };

const LINES: Line[] = [
  { id: "a", indent: 0, base: 66, next: 66, origin: "base" },
  { id: "b", indent: 1, base: 48, next: 48, origin: "base" },
  { id: "c", indent: 1, base: 38, next: 60, origin: "local" },
  { id: "d", indent: 2, base: 56, next: 32, origin: "local" },
  { id: "e", indent: 1, base: 44, next: 44, origin: "base" },
  { id: "f", indent: 1, base: 60, next: 42, origin: "upstream" },
  { id: "g", indent: 2, base: 34, next: 64, origin: "upstream" },
];

const INDENT = [0, 8, 16] as const;

/**
 * Blue already means "yours" everywhere else on this page, so upstream gets the
 * one non-brand hue on the landing page — blue against amber being the pair that
 * survives the most kinds of colour vision. Colour never carries a fact alone:
 * every node is named, the bars change width when they change hands, and the
 * caption says in words what the picture says in hue.
 */
const TONE = {
  base: "bg-fd-muted-foreground/25",
  local: "bg-brand",
  upstream: "bg-amber-500 dark:bg-amber-300",
} as const;

export type StoryStep = 0 | 1 | 2 | 3;

/**
 * The captions carry the story, and on two of the four beats they carry all of
 * it — editing a file is not a thing that flows anywhere, so beats two and three
 * have no beam by design. That makes the words load-bearing rather than a label
 * under a picture, which is why they are set as their own panel instead of as a
 * muted line of small print.
 */
export const STORY: { lead: string; caption: string; hold: number }[] = [
  {
    lead: "Install",
    caption:
      "Manteen writes your copy — and keeps a pristine base of it, untouched, beside the file.",
    hold: 3600,
  },
  {
    lead: "You adapt it",
    caption: "Two lines become yours. This is the edit every other registry tells you not to make.",
    hold: 2600,
  },
  {
    lead: "Upstream moves",
    caption: "The registry changes two different lines, and has never heard of yours.",
    hold: 2600,
  },
  {
    lead: "Update",
    caption:
      "Manteen reads all three. The base is what proves which two lines were upstream's to change — so upstream's arrive, and yours are never touched.",
    hold: 0,
  },
];

/** Which version of a line each document is showing, at a given beat. */
function tone(origin: Origin, node: "upstream" | "base" | "yours", step: StoryStep): Origin {
  if (origin === "base") return "base";
  if (node === "base") return "base";
  if (node === "upstream") return origin === "upstream" && step >= 2 ? "upstream" : "base";
  if (origin === "local") return step >= 1 ? "local" : "base";
  return step >= 3 ? "upstream" : "base";
}

function Doc({
  node,
  step,
  title,
  path,
  pristine,
  innerRef,
}: {
  node: "upstream" | "base" | "yours";
  step: StoryStep;
  title: string;
  path: string;
  pristine?: boolean;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={innerRef}
      aria-hidden="true"
      className={cn(
        "relative z-10 rounded-lg border bg-fd-background p-2.5",
        // The base is not a file anyone opens, and a dashed edge is the cheapest
        // way to say "kept, not used" without a fourth label competing with the
        // three already on screen.
        pristine && "border-dashed bg-fd-secondary",
      )}
    >
      <div className="mb-2 flex flex-col gap-0.5">
        <span className="text-[10px] leading-tight font-medium tracking-wide text-fd-foreground uppercase">
          {title}
        </span>
        <span className="truncate font-mono text-[9px] leading-tight text-fd-foreground/70 [font-variant-ligatures:none]">
          {path}
        </span>
      </div>

      <div className="flex flex-col">
        {LINES.map((line) => {
          const shown = tone(line.origin, node, step);
          const changed = shown !== "base";
          return (
            <div key={line.id} className="relative mb-1.5 h-1">
              <motion.span
                className={cn("absolute top-0 h-1 rounded-full", TONE.base)}
                style={{ left: INDENT[line.indent], width: `${line.base}%` }}
                initial={false}
                animate={{ opacity: changed ? 0 : 1 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              />
              <motion.span
                className={cn("absolute top-0 h-1 rounded-full", TONE[shown])}
                style={{ left: INDENT[line.indent], width: `${line.next}%` }}
                initial={false}
                animate={{ opacity: changed ? 1 : 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The hub carries the product's name and is the one control for the explanation.
 * Putting play on the object that drives every wire keeps transport chrome out
 * of the caption without making the diagram itself a mystery-meat click target:
 * the media icon, focus treatment, title, and accessible name all say what it
 * does. Its transparent pseudo-element supplies a 44px hit area without making
 * the visual node too large for the diagram.
 */
type HubIconState = "play" | "playing" | "replay";

function Hub({
  innerRef,
  live,
  iconState,
  label,
  controlsId,
  onPlay,
}: {
  innerRef: RefObject<HTMLButtonElement | null>;
  live: boolean;
  iconState: HubIconState;
  label: string;
  controlsId: string;
  onPlay: () => void;
}) {
  const Icon = iconState === "playing" ? LoaderCircle : iconState === "replay" ? RotateCcw : Play;

  return (
    <button
      ref={innerRef}
      type="button"
      aria-label={label}
      aria-controls={controlsId}
      title={label}
      disabled={iconState === "playing"}
      onClick={onPlay}
      className={cn(
        "relative z-10 inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-3.5 text-xs font-medium tracking-tight transition-[color,background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none active:scale-[0.97] disabled:cursor-wait motion-reduce:transition-none motion-reduce:active:scale-100",
        live
          ? "border-brand-hover bg-brand-hover text-brand-foreground"
          : "border-fd-border bg-fd-background text-fd-foreground hover:bg-fd-accent",
      )}
    >
      <span>Manteen</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={iconState}
          className="flex size-3.5 items-center justify-center"
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          <Icon
            className={cn(
              "size-3.5",
              iconState === "play" && "translate-x-px",
              iconState === "playing" && "animate-spin",
            )}
            aria-hidden="true"
          />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function OwnershipStory({
  step,
  hubLabel,
  hubIconState,
  controlsId,
  onPlay,
  beamKey = 0,
  beamDuration = 1.2,
  beamRepeat = 1,
  animateBeat = true,
  className,
}: {
  step: StoryStep;
  hubLabel: string;
  hubIconState: HubIconState;
  controlsId: string;
  onPlay: () => void;
  beamKey?: number;
  beamDuration?: number;
  beamRepeat?: number;
  animateBeat?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const upstream = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLButtonElement>(null);
  const yours = useRef<HTMLDivElement>(null);

  // Beat 0 writes: upstream comes in, the file and its base go out. Beat 3
  // reads: upstream and the base come in, the merged file goes out. The same
  // three wires, and the direction of travel is the whole difference between
  // being installed and being updated.
  const installing = step === 0;
  const merging = step === 3;
  const live = installing || merging;

  const beam = { play: live && animateBeat, duration: beamDuration, repeat: beamRepeat };

  const docs = {
    upstream: (
      <Doc
        node="upstream"
        step={step}
        title="Upstream"
        path="@acme/release-panel"
        innerRef={upstream}
      />
    ),
    base: (
      <Doc node="base" step={step} title="Base" path=".manteen/bases/" pristine innerRef={base} />
    ),
    yours: (
      <Doc node="yours" step={step} title="Your copy" path="release-panel.tsx" innerRef={yours} />
    ),
  };

  return (
    <div ref={container} className={cn("relative", className)}>
      <AnimatedBeam
        key={`up-${beamKey}`}
        containerRef={container}
        fromRef={upstream}
        toRef={hub}
        {...beam}
      />
      <AnimatedBeam
        key={`base-${beamKey}`}
        containerRef={container}
        fromRef={base}
        toRef={hub}
        // Written at install, read at update. One wire; the pulse runs the
        // other way round depending on which of those is happening.
        reverse={installing}
        delay={installing ? beamDuration * 0.35 : 0}
        {...beam}
      />
      <AnimatedBeam
        key={`out-${beamKey}`}
        containerRef={container}
        fromRef={hub}
        toRef={yours}
        delay={beamDuration * 0.35}
        {...beam}
      />

      {/* One DOM order, two arrangements, because the three columns do not
            survive a phone: at 390px the hub's pill takes its width out of the
            middle and both documents shrink until their headers truncate to
            nothing. Below `sm` the same reading — sources, then the tool, then
            your file — runs top to bottom instead of left to right. The wires
            need no help with either: they are measured from wherever the boxes
            land, which is the whole reason for porting a beam that measures. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[38%_1fr_38%] sm:gap-4">
        <div className="sm:col-start-1 sm:row-start-1">{docs.upstream}</div>
        <div className="sm:col-start-1 sm:row-start-2">{docs.base}</div>
        <div className="col-span-2 flex items-center justify-center sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <Hub
            innerRef={hub}
            live={live}
            iconState={hubIconState}
            label={hubLabel}
            controlsId={controlsId}
            onPlay={onPlay}
          />
        </div>
        <div className="col-span-2 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
          {docs.yours}
        </div>
      </div>
    </div>
  );
}

/**
 * The beat, given an editorial caption beneath the diagram.
 *
 * It was a muted line under the diagram, which is the wrong weight for the thing
 * doing most of the explaining. The rule and the lead word give it a place, and
 * a short fade keeps the sentence swap legible without turning the caption into
 * a second control surface. `mode="wait"` runs the exit and entrance in series,
 * so each half gets 120ms rather than making one state change feel twice as long.
 */
function Caption({ id, step }: { id: string; step: StoryStep }) {
  const beat = STORY[step];
  if (!beat) return null;

  return (
    <div
      id={id}
      className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center sm:min-h-[3.75rem]"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={beat.lead}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          className="text-sm leading-snug"
        >
          <span className="font-medium text-brand-hover">{beat.lead}.</span>{" "}
          <span className="text-fd-foreground">{beat.caption}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/**
 * The clock and controls. React owns the semantic beat; Motion only explains the
 * visual change that beat causes. The story rests at Install, its actual starting
 * condition, then advances only when a reader asks it to.
 */
export function OwnershipStoryPlayer({ className }: { className?: string }) {
  const [step, setStep] = useState<StoryStep>(0);
  const [run, setRun] = useState(0);
  const [playback, setPlayback] = useState<"idle" | "playing" | "complete">("idle");
  const prefersReducedMotion = useReducedMotion();
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const storyId = useId();

  useEffect(() => setMotionPreferenceReady(true), []);

  const shouldReduceMotion = motionPreferenceReady && prefersReducedMotion === true;

  useEffect(() => {
    if (playback !== "playing") return;
    if (shouldReduceMotion) {
      setStep(3);
      setPlayback("complete");
      return;
    }

    const hold = STORY[step]?.hold ?? 0;
    if (hold === 0) return;

    const timer = setTimeout(() => {
      const next = (step + 1) as StoryStep;
      setStep(next);
      if (next === STORY.length - 1) setPlayback("complete");
    }, hold);

    return () => clearTimeout(timer);
  }, [playback, shouldReduceMotion, step]);

  const play = () => {
    if (playback === "playing") return;
    setRun((current) => current + 1);

    if (shouldReduceMotion) {
      const showStart = step === STORY.length - 1;
      setStep(showStart ? 0 : 3);
      setPlayback(showStart ? "idle" : "complete");
      return;
    }

    setStep(0);
    setPlayback("playing");
  };

  const playLabel = shouldReduceMotion
    ? step === STORY.length - 1
      ? "Show ownership story starting state"
      : "Show ownership story merged result"
    : playback === "playing"
      ? "Story playing"
      : playback === "complete"
        ? "Replay story"
        : "Play story";
  const hubIconState: HubIconState =
    playback === "playing" ? "playing" : playback === "complete" ? "replay" : "play";

  return (
    <MotionConfig reducedMotion="user">
      <div className={className} data-ownership-story-player>
        <OwnershipStory
          step={step}
          hubLabel={playLabel}
          hubIconState={hubIconState}
          controlsId={storyId}
          onPlay={play}
          beamKey={run * STORY.length + step}
          animateBeat={run > 0 && !shouldReduceMotion}
        />

        <div className="mt-5 border-l border-brand pl-3">
          <Caption id={storyId} step={step} />
        </div>
      </div>
    </MotionConfig>
  );
}
