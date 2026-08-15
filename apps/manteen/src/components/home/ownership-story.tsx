"use client";

import { AnimatePresence, motion } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
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
 * The hub, and it carries the product's name rather than the command it happens
 * to be running. What the diagram claims is that ONE tool sits between these
 * three files — not that two different verbs do two different jobs. Naming the
 * verb also put a command in the picture that a reader could not run, set in a
 * mono face that suggested they should.
 */
function Hub({ innerRef, live }: { innerRef: RefObject<HTMLDivElement | null>; live: boolean }) {
  return (
    <div
      ref={innerRef}
      className={cn(
        "relative z-10 rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-tight transition-colors duration-300",
        live
          ? "border-brand bg-brand text-brand-foreground"
          : "border-fd-border bg-fd-background text-fd-foreground",
      )}
    >
      Manteen
    </div>
  );
}

export function OwnershipStory({
  step,
  beamKey = 0,
  beamDuration = 1.2,
  beamRepeat = 1,
  className,
}: {
  step: StoryStep;
  beamKey?: number;
  beamDuration?: number;
  beamRepeat?: number;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const upstream = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const yours = useRef<HTMLDivElement>(null);

  // Beat 0 writes: upstream comes in, the file and its base go out. Beat 3
  // reads: upstream and the base come in, the merged file goes out. The same
  // three wires, and the direction of travel is the whole difference between
  // being installed and being updated.
  const installing = step === 0;
  const merging = step === 3;
  const live = installing || merging;

  const beam = { play: live, duration: beamDuration, repeat: beamRepeat };

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
    <div className={cn("flex flex-col", className)}>
      <div ref={container} className="relative">
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
            <Hub innerRef={hub} live={live} />
          </div>
          <div className="col-span-2 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
            {docs.yours}
          </div>
        </div>
      </div>

      <Caption step={step} />
    </div>
  );
}

/**
 * The beat, given its own panel.
 *
 * It was a muted line under the diagram, which is the wrong weight for the thing
 * doing most of the explaining. The rule and the lead word give it a place; the
 * pips give beats two and three — which have no beam — something that visibly
 * advances; and the swap is animated because a sentence that changes without
 * moving reads as a typo rather than as a step.
 */
function Caption({ step }: { step: StoryStep }) {
  const beat = STORY[step];
  if (!beat) return null;

  return (
    <div className="mt-5 border-l-2 border-brand pl-3">
      <div className="flex min-h-[4.5rem] flex-col gap-2 sm:min-h-[3.75rem]">
        <div className="flex flex-row items-center gap-1.5" aria-hidden="true">
          {STORY.map((item, index) => (
            <motion.span
              key={item.lead}
              className={cn(
                "h-0.5 rounded-full",
                index === step ? "bg-brand" : "bg-fd-muted-foreground/30",
              )}
              initial={false}
              animate={{ width: index === step ? 18 : 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={beat.lead}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="text-sm leading-snug"
          >
            <span className="font-medium text-brand">{beat.lead}.</span>{" "}
            <span className="text-fd-muted-foreground">{beat.caption}</span>
          </motion.p>
        </AnimatePresence>
      </div>
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
    // Decoration over a claim the copy beside it already makes, so the diagram is
    // hidden from assistive technology rather than announced as a pile of
    // unlabelled boxes.
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
