"use client";

import { GitMerge } from "lucide-react";
import { motion } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { AnimatedBeam } from "@/components/home/animated-beam";
import { cn } from "@/lib/cn";

/**
 * A four-beat storyboard of what owning the source actually costs you, which is
 * nothing: install, your edit, upstream's edit, and the merge that reconciles
 * them against the copy neither of you touched.
 *
 * The shape is deliberate. Two sources on the left, `update` in the middle, your
 * file on the right — that is the data flow of a three-way merge stated as a
 * diagram, and it is why the pristine base has to be on screen at all. A picture
 * with only two documents can show a change arriving; it cannot show why the
 * change knows to arrive *around* your edit.
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

export const STORY: { caption: string; hold: number }[] = [
  {
    caption: "Install writes your copy — and keeps a pristine base of it beside the file.",
    hold: 2000,
  },
  { caption: "You adapt two lines. Nothing else on the diagram knows yet.", hold: 1600 },
  { caption: "Upstream changes two others, and has never heard of yours.", hold: 1600 },
  {
    caption:
      "update reads all three. The base says which two lines are upstream's to change, so upstream's arrive and yours are never touched.",
    hold: 0,
  },
];

/** Which side of a line each document is showing, at a given beat. */
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
      className={cn(
        "relative z-10 rounded-lg border bg-fd-background p-2.5",
        // The base is not a file anyone opens, and a dashed edge is the cheapest
        // way to say "kept, not used" without a second label competing with the
        // three that are already on screen.
        pristine && "border-dashed bg-fd-secondary",
      )}
    >
      <div className="mb-2 flex flex-col gap-0.5">
        <span className="text-[10px] leading-tight font-medium tracking-wide text-fd-foreground uppercase">
          {title}
        </span>
        <span className="truncate font-mono text-[9px] leading-tight text-fd-muted-foreground [font-variant-ligatures:none]">
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
                transition={{ duration: 0.25 }}
              />
              <motion.span
                className={cn("absolute top-0 h-1 rounded-full", TONE[shown])}
                style={{ left: INDENT[line.indent], width: `${line.next}%` }}
                initial={false}
                animate={{ opacity: changed ? 1 : 0 }}
                transition={{ duration: 0.25 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The storyboard, controlled. It owns no clock — a caller passes the beat, which
 * is what lets the same component be hover-driven on the page and scrubbed
 * step-by-step in a preview without the two versions drifting apart.
 *
 * `beamKey` restarts the pulses. A gradient animation plays on mount, so a beat
 * that is entered twice has to remount its beams to fire twice.
 */
export function OwnershipStory({
  step,
  beamKey = 0,
  beamDuration = 1.8,
  className,
}: {
  step: StoryStep;
  beamKey?: number;
  beamDuration?: number;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const upstream = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const centre = useRef<HTMLDivElement>(null);
  const yours = useRef<HTMLDivElement>(null);

  // Beat 0 writes: upstream comes in, and both the file and its base go out.
  // Beat 3 reads: upstream and the base come in, and the merged file goes out.
  // Same three wires, and the direction of travel is the difference between
  // being installed and being updated.
  const installing = step === 0;
  const merging = step === 3;
  const live = installing || merging;

  return (
    <div className={cn("flex flex-col", className)}>
      <div ref={container} className="relative flex flex-row items-stretch gap-3 sm:gap-4">
        <AnimatedBeam
          key={`up-${beamKey}`}
          containerRef={container}
          fromRef={upstream}
          toRef={centre}
          play={live}
          duration={beamDuration}
        />
        <AnimatedBeam
          key={`base-${beamKey}`}
          containerRef={container}
          fromRef={base}
          toRef={centre}
          // Written at install, read at update. One wire, and the pulse runs the
          // other way round depending on which is happening.
          reverse={installing}
          play={live}
          delay={installing ? beamDuration * 0.4 : 0}
          duration={beamDuration}
        />
        <AnimatedBeam
          key={`out-${beamKey}`}
          containerRef={container}
          fromRef={centre}
          toRef={yours}
          play={live}
          delay={beamDuration * 0.4}
          duration={beamDuration}
        />

        <div className="flex w-[38%] flex-col justify-between gap-3">
          <Doc
            node="upstream"
            step={step}
            title="Upstream"
            path="@acme/release-panel"
            innerRef={upstream}
          />
          <Doc
            node="base"
            step={step}
            title="Base"
            path=".manteen/bases/"
            pristine
            innerRef={base}
          />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              ref={centre}
              className={cn(
                "relative z-10 flex size-9 items-center justify-center rounded-full border bg-fd-background transition-colors",
                live && "border-brand",
              )}
            >
              <GitMerge
                className={cn(
                  "size-4 transition-colors",
                  live ? "text-brand" : "text-fd-muted-foreground",
                )}
                aria-hidden="true"
              />
            </div>
            <span className="font-mono text-[9px] whitespace-nowrap text-fd-muted-foreground">
              {installing ? "manteen add" : "manteen update"}
            </span>
          </div>
        </div>

        {/* A column, not a row: a row's child sizes to its content, so the
            document shrank to the width of its own header and stopped matching
            the two it is being compared against. */}
        <div className="flex w-[38%] flex-col justify-center">
          <Doc
            node="yours"
            step={step}
            title="Your copy"
            path="release-panel.tsx"
            innerRef={yours}
          />
        </div>
      </div>

      {/* Three lines held, because the last beat's caption is the long one and
          the copy card beside this is a grid sibling. */}
      <p className="mt-4 min-h-[3.75rem] text-xs text-fd-muted-foreground sm:min-h-[3rem]">
        {STORY[step]?.caption}
      </p>
    </div>
  );
}

/**
 * The clock. Starts finished, replays on hover — `TerminalPanel`'s contract, and
 * the page's idiom: nothing animates at a reader on arrival.
 */
export function OwnershipStoryPlayer({ className }: { className?: string }) {
  const [step, setStep] = useState<StoryStep>(3);
  const [run, setRun] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const hold = STORY[step]?.hold ?? 0;
    if (hold === 0) return;
    const timer = setTimeout(() => setStep((prev) => (prev + 1) as StoryStep), hold);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    // Decoration over a claim the copy beside it already makes, so the whole
    // diagram is hidden from assistive technology rather than announced as a
    // pile of unlabelled boxes.
    <div
      className={className}
      aria-hidden="true"
      onMouseEnter={() => {
        // Only a finished run rewinds, so crossing the diagram mid-play cannot
        // knock it back to the first beat.
        if (still || step !== 3) return;
        setRun((prev) => prev + 1);
        setStep(0);
      }}
    >
      <OwnershipStory step={step} beamKey={run * 4 + step} />
    </div>
  );
}
