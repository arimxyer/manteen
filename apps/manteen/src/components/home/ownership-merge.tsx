"use client";

import { MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One line of a file, drawn as a bar rather than as text.
 *
 * Abstract on purpose. The claim is about *whose* lines survive an update, and
 * legible code would invite a reader to read it instead — the shape of a diff is
 * the whole message, and a bar carries shape with nothing else attached.
 *
 * `base` is the width the line has in the pristine copy and `next` the width it
 * has after whoever owns it changed it. A line's width therefore says which
 * version of it you are looking at, which is what lets the same nine lines
 * render as three different files.
 */
type Origin = "base" | "local" | "upstream";

type Line = { id: string; indent: 0 | 1 | 2; base: number; next: number; origin: Origin };

/**
 * Nine lines, of which you changed two and upstream changed two others — and
 * the two pairs do not touch. That is the case `update` is built for and the
 * one this card claims: a merge around your edits rather than over them.
 *
 * Deliberately not the conflict case. A card that showed a collision would be
 * illustrating the refusal, which the note beside it already covers in words,
 * and the refusal is not what the headline promises.
 */
const LINES: Line[] = [
  { id: "l1", indent: 0, base: 68, next: 68, origin: "base" },
  { id: "l2", indent: 1, base: 52, next: 52, origin: "base" },
  { id: "l3", indent: 1, base: 40, next: 62, origin: "local" },
  { id: "l4", indent: 2, base: 58, next: 34, origin: "local" },
  { id: "l5", indent: 1, base: 46, next: 46, origin: "base" },
  { id: "l6", indent: 0, base: 28, next: 28, origin: "base" },
  { id: "l7", indent: 1, base: 62, next: 44, origin: "upstream" },
  { id: "l8", indent: 2, base: 36, next: 66, origin: "upstream" },
  { id: "l9", indent: 0, base: 22, next: 22, origin: "base" },
];

const INDENT = [0, 10, 20] as const;

/**
 * Blue is Manteen's accent and therefore already means "yours" everywhere else
 * on this page. Upstream needs to be *as* distinguishable, so it gets the one
 * non-brand hue on the landing page — blue against amber being the pair that
 * survives the most kinds of colour vision.
 *
 * Colour is never the only carrier. Each side is also named in its own header,
 * the bars change width when they change hands, and the caption says in words
 * what the picture says in hue.
 */
const TONE = {
  base: "bg-fd-muted-foreground/25",
  local: "bg-brand",
  upstream: "bg-amber-500 dark:bg-amber-300",
} as const;

/** Beat between the two files diverging and the merge landing. */
const PAUSE_MS = 900;

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

function Bar({
  width,
  indent,
  tone,
  layoutId,
  faded,
}: {
  width: number;
  indent: 0 | 1 | 2;
  tone: keyof typeof TONE;
  layoutId?: string;
  faded?: boolean;
}) {
  return (
    <motion.span
      layoutId={layoutId}
      className={cn("absolute top-0 h-1.5 rounded-full", TONE[tone])}
      style={{ left: INDENT[indent], width: `${width}%` }}
      // The panel arrives merged and sits still, so the first render plays
      // nothing: without this the base line under an already-merged bar fades
      // out on page load, which is an animation at the reader rather than one
      // they asked for.
      initial={false}
      animate={{ opacity: faded ? 0 : 1 }}
      transition={{ ...SPRING, opacity: { duration: 0.22 } }}
    />
  );
}

/**
 * One file. `side` decides which version of each line it holds, so the two
 * documents are the same nine lines read twice rather than two hand-drawn
 * pictures that could drift apart.
 *
 * The travelling bar is a THIRD element, and it has to be.
 *
 * A shared `layoutId` animates when the element carrying it unmounts in one
 * place and a new one mounts in another. Moving the identifier onto a bar that
 * was already on screen — upstream's own bar, which persists across the whole
 * run — is not that: React keeps the element, motion sees a prop change, and the
 * bar arrives at its destination instantly with nothing to interpolate from.
 * That version looked correct in both end states and animated nothing, which is
 * exactly the failure a still cannot show you.
 *
 * So upstream's document always draws its own amber bars, statically, and the
 * identifier lives on a duplicate stacked over them. That duplicate is the only
 * thing that moves: it unmounts from upstream's slot, mounts in yours, and
 * motion carries it across. Which reads as what it is — upstream keeps its copy,
 * you get one too.
 *
 * It exists on exactly one side at any moment. The same identifier rendered
 * twice at once matches nothing and animates neither.
 */
function Doc({ side, merged }: { side: "yours" | "upstream"; merged: boolean }) {
  return (
    <div className="relative rounded-lg border bg-fd-background p-2.5">
      <div className="mb-2.5 flex flex-col gap-0.5">
        <span className="text-[10px] font-medium tracking-wide text-fd-foreground uppercase">
          {side === "yours" ? "Your copy" : "Upstream"}
        </span>
        <span className="truncate font-mono text-[10px] text-fd-muted-foreground [font-variant-ligatures:none]">
          {side === "yours" ? "release-panel.tsx" : "@acme/release-panel"}
        </span>
      </div>

      <div className="flex flex-col">
        {LINES.map((line) => {
          const carries = side === "yours" ? line.origin === "local" : line.origin === "upstream";
          const arriving = side === "yours" && line.origin === "upstream" && merged;

          return (
            <div key={line.id} className="relative mb-2 h-1.5">
              {/* The line as the pristine base has it. It stays underneath its
                  own replacement and fades rather than vanishing, so a bar
                  arriving on top of it reads as a substitution rather than as
                  something appearing out of nowhere. */}
              {carries ? null : (
                <Bar width={line.base} indent={line.indent} tone="base" faded={arriving === true} />
              )}

              {/* The line as its own side has it: your edit, or upstream's.
                  Static — neither document loses a line to the other. */}
              {carries ? (
                <Bar
                  width={line.next}
                  indent={line.indent}
                  tone={line.origin === "local" ? "local" : "upstream"}
                />
              ) : null}

              {/* The travelling duplicate, on whichever side currently holds it. */}
              {line.origin === "upstream" && (side === "upstream") !== merged ? (
                <Bar
                  width={line.next}
                  indent={line.indent}
                  tone="upstream"
                  layoutId={`ownership-line-${line.id}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OwnershipMerge({ className }: { className?: string }) {
  const [merged, setMerged] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // The run is two states and one beat, so the schedule is a single timeout
  // rather than a clock. It exists only while a replay is in flight.
  useEffect(() => {
    if (merged) return;
    const timer = setTimeout(() => setMerged(true), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [merged]);

  return (
    // Decoration over a claim the copy beside it already makes, so the whole
    // illustration is hidden from assistive technology rather than announced as
    // a pile of unlabelled boxes. Same contract as `TerminalPanel`.
    <MotionConfig reducedMotion="user">
      <div
        className={cn("flex flex-col", className)}
        aria-hidden="true"
        onMouseEnter={() => {
          // Starts finished and replays on hover — the page's existing idiom,
          // and the guard is the terminal's: only a settled run rewinds, so
          // crossing the panel mid-play cannot restart it.
          if (!still && merged) setMerged(false);
        }}
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          {/* The pristine base, drawn as a sheet under your copy rather than as a
              third column. It is not a version anybody reads — it is the ancestor
              the merge is measured against — so a corner saying "still here" is
              the whole of what it has to communicate, and it costs no width.
              It sits INSIDE the grid cell rather than absolutely in the grid: a
              cell is the only thing that knows the column's width, and hand-
              computing it from the gap silently disagreed at the `sm` breakpoint
              where the gap changes. */}
          <div className="relative">
            <div
              className="absolute -top-2 -left-2 size-full -rotate-1 rounded-lg border border-dashed bg-fd-secondary"
              aria-hidden="true"
            />
            <Doc side="yours" merged={merged} />
          </div>
          <Doc side="upstream" merged={merged} />
        </div>

        <p className="mt-3 font-mono text-[10px] text-fd-muted-foreground [font-variant-ligatures:none]">
          .manteen/bases/ — the pristine copy behind yours
        </p>

        {/* Two lines' worth of height held, because the caption is the one part
            of this that changes length and the copy card beside it is a grid
            sibling. */}
        <p className="mt-3 min-h-[2.5rem] text-xs text-fd-muted-foreground">
          {merged
            ? "Merged. Upstream's two lines arrived; the two you changed were never touched."
            : "You changed two lines. Upstream changed two others, and does not know about yours."}
        </p>
      </div>
    </MotionConfig>
  );
}
