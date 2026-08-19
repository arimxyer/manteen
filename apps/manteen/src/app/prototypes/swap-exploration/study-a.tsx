"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study A — "One address". Publication is a name, not an edit.
 *
 * THE QUESTION THIS PLATE ANSWERS
 *
 * Can a reader fetch my registry mid-build and receive half a set? No. The
 * honest way to draw that is not to animate bytes moving into a destination —
 * it is to draw the one thing a successful build actually changes: which
 * complete set the published address refers to.
 *
 * WHY THE NAME IS THE PROTAGONIST, AND WHAT THAT BUYS
 *
 * Every set drawn here is complete or visibly unfinished; no set is ever drawn
 * half-inside the published location, because nothing ever travels through it.
 * A single address chip is seated on exactly one card at every frame, and the
 * re-seat is a CUT — zero duration, one frame, no in-between. A spring here
 * would put the address over the gutter for several hundred milliseconds,
 * bound to neither set, which is a worse claim than a partial set and drawn in
 * the one place this plate exists to deny it.
 *
 * The consequence for composition is the point of the study: because the
 * published location is a name rather than a slot that something slides into,
 * the plate can settle to ONE card filling the whole well in BOTH outcomes.
 * There is no receipt panel and no vacated bay. Success settles to the new
 * complete set at the address; refusal settles to the old complete set at the
 * address, byte-identical to how it started. That identical composition, with
 * two different histories, IS the guarantee: a reader gets the old complete set
 * or the new complete set.
 *
 * WHAT THE GEOMETRY PROMISES
 *
 * The published card is `absolute inset-0` and its rect never changes while it
 * is published. The prospective set is not a sibling bay carved out of that
 * width — it is an ELEVATED COPY IN THE SAME PLACE, which is what a staging
 * directory is. That distinction is load-bearing on the refusal path: if the
 * published card had to give up width to make room, it would have to take that
 * width back at the refusal, and "build refused" followed immediately by "the
 * published thing moved" is the causal sentence a viewer assembles whether or
 * not the content was preserved. Here the refusal changes exactly zero pixels
 * of the published card.
 *
 * THE SPINE
 *
 * The elevated copy occludes most of the card beneath it, so each card carries
 * its contents twice: as rows, and as a column of position markers on its left
 * edge, aligned to those rows. During a run the two spines sit side by side —
 * the published set's markers holding still while the prospective set's fill in
 * — so the invariant is visible, not merely asserted, for the whole run.
 *
 * WHAT IS REAL, AND WHERE THIS PLATE IS DELIBERATELY LOOSER THAN THE CODE
 *
 * The order is the compiler's: item documents in `localeCompare` order, then
 * `registry.json` once the index has been checked against the rendered set,
 * then the ownership marker last. The documents are representative and no count
 * is stated anywhere on the plate, because a set's size is a volatile catalog
 * fact.
 *
 * The refusal is a real refusal: the authoring schema puts no uniqueness
 * constraint on item names, so two catalog entries can compile to one filename
 * and `renderOutput` throws `duplicate-rendered-item`. This plate draws that as
 * assembly reaching the contested position and stopping, which is the transform
 * the concept brief specifies. The implementation is STRICTER: `renderOutput`
 * throws before `writeRegistry` stages anything at all, so in the real build no
 * document is written to disk even in the prospective copy. Both statements
 * agree on the only claim the plate makes — the published set is untouched —
 * and the looser drawing is the one that shows a reader *why*.
 *
 * WHAT NEVER MOVES
 *
 * The published card, in position, size, and content, for every frame of the
 * refusing run and for every frame of the succeeding run up to the cut. After
 * the cut the old copy has changed role — it is no longer at the address — and
 * only then is it allowed to dim and go.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/**
 * Secondary ink for the drawing, and why it is not `text-fd-muted-foreground`.
 *
 * Measured on this page in light mode, the muted token lands at 4.50:1 on the
 * plain card and drops to 3.92–4.41:1 over every tinted panel in this plate —
 * under AA for text this small. Everything in the drawing is 9–10px, so the
 * margin the token leaves is not one to spend. Pulling it toward the foreground
 * moves both themes the right way at once, because the foreground is dark in
 * light mode and light in dark mode.
 *
 * The caption below the drawing deliberately keeps the site's muted token: it
 * sits on the untinted card, it measures 4.50:1, and caption colour is an open
 * site-wide question rather than this study's to answer.
 */
const QUIET_INK =
  "color-mix(in oklab, var(--color-fd-muted-foreground) 58%, var(--color-fd-foreground))";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * Well height, and why it is a hard height.
 *
 * The elevated copy is positioned against this box, so its collapsed offsets
 * are the only thing separating the two cards. The height is budgeted for the
 * TALLEST state the elevated copy ever reaches — the refusal, where one
 * position grows to hold two claimants — so nothing in either run can push its
 * own frame. A `min-h` would let the refusal resize the well underneath the
 * published card, which is precisely the motion the refusal must not have.
 *
 * Budgeted from measurement rather than from arithmetic. At the first height the
 * contested position measured 48px against a 22px row and the rows box
 * overflowed by 21px — `scrollHeight` 160 against `clientHeight` 139 — which an
 * `overflow-hidden` card renders as the index sitting on top of the last
 * document. The clear space here is that overflow plus margin.
 */
const WELL = "h-[19rem] sm:h-[19.75rem]";

/**
 * Collapsed offsets for the elevated copy, as custom properties so the same
 * inline `left/top/right/bottom` can be transitioned to `0` at any breakpoint.
 * The left offset is wider than the others: it is what keeps the published
 * card's spine uncovered for the whole run.
 */
const INSET_VARS = [
  "[--bay-l:1.625rem] [--bay-r:0.5rem] [--bay-t:2rem] [--bay-b:0.5rem]",
  "sm:[--bay-l:1.75rem] sm:[--bay-r:0.875rem] sm:[--bay-t:2.125rem] sm:[--bay-b:0.875rem]",
].join(" ");

/**
 * The elevated copy's surface, and why it is not `bg-fd-card`.
 *
 * `--color-fd-card` carries alpha. Measured on this site it resolves to
 * `#111f3c66` in dark mode, so a card painted with it lets whatever is beneath
 * it read straight through — and what is beneath this one is another set of
 * document rows at a four-pixel vertical offset. The first build of this study
 * did exactly that and produced two interleaved sets of filenames: precisely
 * the "looks like a rendering glitch" failure this study exists to avoid, and
 * arrived at from the opposite direction.
 *
 * The elevated copy must be opaque. Both operands here are opaque, so the mix
 * is too, in either theme.
 */
const ELEVATED_SURFACE =
  "color-mix(in oklab, var(--color-fd-secondary) 62%, var(--color-fd-background) 38%)";

/** The set that is published. Representative item documents, in the compiler's sort order. */
const PUBLISHED_ITEMS = ["data-table", "empty-state", "page-header", "stat-card"] as const;

/** The set this build renders: the same items, plus one the author added. */
const PROSPECTIVE_ITEMS = [...PUBLISHED_ITEMS, "stats-grid"] as const;

/**
 * The refusing build renders the same names, because its new item was pasted
 * with a name already in use. Sorted by name the two claimants land on one
 * output path, so the second has no position of its own to occupy — which is
 * why the run stops on the second position and the three remaining documents,
 * the index and the marker are never written.
 */
const CONTESTED_SLOT = PROSPECTIVE_ITEMS.indexOf("empty-state");

/** Item documents, then the index, then the marker: the compiler's own order. */
const TOTAL_POSITIONS = PROSPECTIVE_ITEMS.length + 2;

/** The published location. A name, which is the entire subject of this plate. */
const ADDRESS = "example.com/r";

type Outcome = "succeeds" | "refuses";

type RowState = "written" | "empty" | "sealed" | "contested";

/** Which kind of position a row occupies: a document, the index, or the marker. */
type Mark = "item" | "index" | "marker";

type Phase =
  /** A run has begun; the elevated copy has not opened yet. */
  | "idle"
  | "opening"
  | "writing"
  | "complete"
  /** The address has been re-seated. One frame, no transit. */
  | "bound"
  /** Settled success: the new complete set is at the address, alone in the well. */
  | "installed"
  | "colliding"
  | "refused"
  /** Settled refusal: the old complete set is at the address, alone in the well. */
  | "discarded";

type Keyframe = { at: number; phase?: Phase; written?: number; chapter?: number };

/**
 * Both runs as data rather than as a chain of callbacks. A keyframe list can be
 * re-entered from the top at any moment, which is what makes reselection a
 * replay and an outcome switch mid-run harmless: every visual target is derived
 * from `phase` and `written`, so an interruption retargets in flight instead of
 * unwinding a sequence.
 *
 * PACING. The earlier direction ticked eight times in 1.9s and read as a
 * progress bar. Here the run has THREE chapters and the item documents land as
 * ONE gesture — five positions on a 110ms stagger, over inside 700ms — so the
 * reader tracks three events, not eight. The index and the marker each get
 * their own beat because they are each a distinct guarantee, and the complete
 * set then HOLDS for 1.6s before anything is published, because "the
 * replacement is whole" is the precondition the whole claim rests on and it
 * cannot be read in passing.
 *
 * Caption chapters are offset ~200ms behind the visual beat that earns them.
 * Landing a sentence and a movement on the same frame doubles the reading load
 * at exactly the moments this plate is trying to slow down.
 */
const TIMELINES: Record<Outcome, readonly Keyframe[]> = {
  succeeds: [
    { at: 260, phase: "opening" },
    { at: 760, phase: "writing", written: 1 },
    { at: 870, written: 2 },
    { at: 980, written: 3 },
    { at: 1090, written: 4 },
    { at: 1200, written: 5 },
    // The index is checked against the rendered set, so it is its own beat.
    { at: 1880, written: 6 },
    // The marker records every emitted path with its hash, and is written last.
    { at: 2340, written: 7 },
    { at: 2560, phase: "complete" },
    { at: 2780, chapter: 1 },
    // 1.6s on the whole replacement before the address is allowed to move.
    { at: 4200, phase: "bound" },
    { at: 4420, chapter: 2 },
    { at: 5200, phase: "installed" },
  ],
  refuses: [
    { at: 260, phase: "opening" },
    { at: 760, phase: "writing", written: 1 },
    { at: 1500, phase: "colliding" },
    { at: 1720, chapter: 1 },
    // Refusal is an explanatory hold, not a transient error flash.
    { at: 2700, phase: "refused" },
    // The caption follows its beat here as everywhere else. At 4300 it preceded
    // the withdrawal by 200ms and announced a discard that had not happened yet.
    { at: 4500, phase: "discarded" },
    { at: 4700, chapter: 2 },
  ],
};

type Caption = { lead: string; detail: string };

/**
 * Three per outcome, and three is the ceiling. A fourth sentence would mean the
 * plate had a fourth thing to say, and it does not.
 */
const CAPTIONS: Record<Outcome, readonly [Caption, Caption, Caption]> = {
  succeeds: [
    {
      lead: "A complete replacement is assembled away from the published set.",
      detail: "Documents in name order, then the index, then the marker over both.",
    },
    {
      lead: "The replacement is whole. Only a whole set can take the address.",
      detail: "Nothing has been published yet. The address still names the set beneath.",
    },
    {
      lead: "The address moves in one step, and nothing is edited in place.",
      detail:
        "A reader gets the old complete set or the new complete set. There is no third answer.",
    },
  ],
  refuses: [
    {
      lead: "A complete replacement is assembled away from the published set.",
      detail: "Documents in name order, then the index, then the marker over both.",
    },
    {
      lead: "Two catalog items claim one output path.",
      detail:
        "The build stops here. The remaining documents, the index and the marker are never written.",
    },
    {
      lead: "The incomplete replacement is discarded whole.",
      detail: "The address never moved, so the published set is exactly what it was.",
    },
  ],
};

/**
 * The complete claim in text, for a reader who never sees the plate move. The
 * drawing is `aria-hidden` because a grid of animated cells announces nothing
 * useful on its own.
 */
const SUMMARY =
  "Two builds of one registry, drawn as one published address. A complete replacement set is " +
  "assembled away from the published set. When the build succeeds, the address moves to the " +
  "completed set in a single step, so no reader can fetch a partly updated set. When the build " +
  "refuses — here because two catalog items compile to empty-state.json — the address never " +
  "moves, the incomplete replacement is discarded whole, and the published set is left exactly " +
  "as it was.";

export function SwapStudyA({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);

  const settled: Phase = outcome === "succeeds" ? "installed" : "discarded";

  // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed —
  // is the selected outcome already at rest. Only a reader's own selection or
  // replay puts the plate in motion.
  const [phase, setPhase] = useState<Phase>(run > 0 ? "idle" : settled);
  const [written, setWritten] = useState(run > 0 ? 0 : TOTAL_POSITIONS);
  const [chapter, setChapter] = useState(run > 0 ? 0 : 2);

  useEffect(() => {
    if (reduceMotion) return;
    if (run === 0 && presses === 0) {
      setPhase(settled);
      setWritten(TOTAL_POSITIONS);
      setChapter(2);
      return;
    }
    setPhase("idle");
    setWritten(0);
    setChapter(0);
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.written !== undefined) setWritten(frame.written);
        if (frame.chapter !== undefined) setChapter(frame.chapter);
      }, frame.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [outcome, presses, run, reduceMotion, settled]);

  if (reduceMotion) return <StaticOutcomes />;

  const resting = run === 0 && presses === 0;
  /** The elevated copy exists from the moment it opens until the moment it is gone. */
  const copyShown = phase !== "idle" && phase !== "discarded";
  /** Settled success: the copy has become the card, and nothing is behind it. */
  const copyExpanded = phase === "installed";
  const seatedOnCopy = phase === "bound" || phase === "installed";
  const refusing = phase === "colliding" || phase === "refused";

  const caption = CAPTIONS[outcome][chapter] ?? CAPTIONS[outcome][0];

  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        {(["succeeds", "refuses"] as const).map((value) => (
          <button
            key={value}
            type="button"
            // Two independent `aria-pressed` toggles rather than a radiogroup:
            // pressing the pressed one is a replay, which a radio cannot
            // express, and pressed reports exactly what is on screen.
            aria-pressed={outcome === value}
            onClick={() => {
              setOutcome(value);
              setPresses((count) => count + 1);
            }}
            className={cn(
              "home-stage-button relative rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-[color,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100",
              outcome === value ? "text-brand-foreground" : "text-fd-muted-foreground",
            )}
          >
            {outcome === value ? (
              <motion.span
                layoutId="swap-study-a-pill"
                className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="flex min-w-0 flex-col">
        <AddressRail />

        <div className={cn("relative min-w-0", WELL, INSET_VARS)}>
          {/* The published set. Absolute `inset-0`, and its rect is never
              animated while it is at the address. */}
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: copyExpanded ? 0 : 1 }}
            transition={{ duration: copyExpanded ? 0.4 : 0, ease: EASE_OUT }}
          >
            <SetCard
              items={copyExpanded ? PROSPECTIVE_ITEMS : PUBLISHED_ITEMS}
              written={TOTAL_POSITIONS}
              sealed
              seated={!seatedOnCopy}
              state={seatedOnCopy ? "no longer at the address" : "complete set"}
              shortState={seatedOnCopy ? "released" : "complete"}
              // Dimming is allowed only after the address has left: at that
              // moment this copy has changed role and is being removed.
              retired={seatedOnCopy}
            />
          </motion.div>

          {/* The prospective set. A second copy in the same place at a higher
              elevation — not a station upstream, and not a bay carved out of
              the card beneath it. */}
          <motion.div
            className="absolute"
            initial={false}
            animate={{
              opacity: copyShown ? 1 : 0,
              scale: copyShown ? 1 : 0.985,
              y: copyShown ? 0 : 10,
            }}
            // The rise carries the entrance; the opacity ramp is deliberately
            // short. While the copy is translucent the published set's rows
            // read straight through it at a few pixels' offset, which is the
            // doubled-text reading this study exists to avoid — so the window
            // in which it can happen is 180ms, not 420ms.
            //
            // And when a run RESETS it is not a window at all. Recorded frames
            // caught the worst case: switching outcome from a settled success
            // dissolved a full-width copy over a published card holding a
            // different number of documents, which is maximum misalignment.
            // Returning to the pre-run state is a new run beginning rather than
            // anything either set did, so it is a cut — the same rule the
            // expansion below follows, for the same reason.
            transition={{
              opacity: { duration: phase === "idle" ? 0 : 0.18, ease: EASE_OUT },
              default: { duration: 0.42, ease: EASE_OUT },
            }}
            style={{
              left: copyExpanded ? 0 : "var(--bay-l)",
              right: copyExpanded ? 0 : "var(--bay-r)",
              top: copyExpanded ? 0 : "var(--bay-t)",
              bottom: copyExpanded ? 0 : "var(--bay-b)",
              // The expansion is the only box transition on the plate, and it
              // runs in one direction only. Resetting for a new run is a cut,
              // because a reversed expansion would draw the published set
              // un-replacing itself — a rollback, in the one plate that exists
              // to say a rollback never happens.
              transitionProperty: copyExpanded ? "left,right,top,bottom" : "none",
              transitionDuration: "620ms",
              transitionTimingFunction: EASE_OUT_CSS,
            }}
          >
            <SetCard
              items={PROSPECTIVE_ITEMS}
              written={written}
              elevated={!copyExpanded}
              seated={seatedOnCopy}
              contestedSlot={refusing ? CONTESTED_SLOT : null}
              complete={phase === "complete" || seatedOnCopy}
              stamped={phase === "refused"}
              state={copyState(phase)}
              shortState={copyShortState(phase)}
              animateCells={!resting}
            />
          </motion.div>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <p className="min-h-[3rem] text-[13px] leading-snug text-fd-foreground">
          {caption.lead}
          <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">
            {caption.detail}
          </span>
        </p>
      </div>

      {/* Announced at rest, rather than on every frame of a run. */}
      <p className="sr-only" role="status">
        {phase === "installed"
          ? "Build succeeded. The address moved in one step to the complete replacement set."
          : phase === "discarded"
            ? "Build refused. Two catalog items compiled to empty-state.json, the address never moved, and the published set is unchanged."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

function copyState(phase: Phase): string {
  if (phase === "discarded") return "discarded";
  if (phase === "complete") return "complete, not published";
  if (phase === "bound" || phase === "installed") return "at the address";
  if (phase === "colliding") return "stopped";
  if (phase === "refused") return "refused · nothing written";
  return "rendering";
}

function copyShortState(phase: Phase): string {
  if (phase === "discarded") return "discarded";
  if (phase === "complete") return "complete";
  if (phase === "bound" || phase === "installed") return "at address";
  if (phase === "refused") return "refused";
  if (phase === "colliding") return "stopped";
  return "rendering";
}

/**
 * The signage. The address is the subject of the plate, so it is stated once,
 * above everything, where nothing ever covers it — and it never changes, in
 * either outcome, because a successful build does not change the address. It
 * changes what the address names.
 */
function AddressRail() {
  return (
    <div className="mb-1.5 flex min-w-0 items-baseline gap-2 px-1">
      <span
        className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase"
        style={{ color: QUIET_INK }}
      >
        Address
      </span>
      <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.04em]">{ADDRESS}</span>
      <span className="h-px min-w-2 flex-1 bg-fd-border" />
      <span
        className="hidden shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase sm:inline"
        style={{ color: QUIET_INK }}
      >
        one set at a time
      </span>
    </div>
  );
}

/**
 * One set, at one moment. Both cards render this component with different props,
 * because they are the same kind of thing — that is the plate's argument, and
 * duplicating the markup would let the two drift into looking like different
 * objects.
 */
function SetCard({
  items,
  written,
  sealed = false,
  elevated = false,
  seated,
  state,
  shortState,
  contestedSlot = null,
  complete = false,
  stamped = false,
  retired = false,
  animateCells = false,
}: {
  items: readonly string[];
  /** Positions filled so far, across items, then the index, then the marker. */
  written: number;
  /** A published set arrives whole — index and marker included — and never animates in. */
  sealed?: boolean;
  elevated?: boolean;
  /** Holds the published address. Exactly one card on the plate ever does. */
  seated: boolean;
  state: string;
  shortState: string;
  contestedSlot?: number | null;
  complete?: boolean;
  stamped?: boolean;
  retired?: boolean;
  animateCells?: boolean;
}) {
  const indexWritten = sealed || written >= items.length + 1;
  const markerWritten = sealed || written >= items.length + 2;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border p-2 transition-[opacity,border-color,background-color] duration-400 ease-[var(--ease-out)]",
        elevated
          ? "border-fd-border shadow-[0_14px_34px_-10px_rgba(0,0,0,0.5)] ring-1 ring-black/10 dark:ring-white/10"
          : "bg-fd-secondary",
        retired ? "border-dashed opacity-55" : "opacity-100",
        complete && !retired ? "border-brand/40" : null,
      )}
      style={elevated ? { background: ELEVATED_SURFACE } : undefined}
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <Seat seated={seated} />
        <span
          className={cn(
            "min-w-0 truncate font-mono text-[9px] tracking-[0.1em] uppercase sm:text-[10px]",
            stamped ? "bg-fd-foreground px-1.5 py-0.5 text-fd-background" : null,
          )}
          style={stamped ? undefined : { color: complete && !retired ? BRAND_INK : QUIET_INK }}
        >
          <span className="sm:hidden">{shortState}</span>
          <span className="hidden sm:inline">{state}</span>
        </span>
      </div>

      {/* Rows, each preceded by its own position marker. The markers form the
          spine — the strip on the card's left edge that the elevated copy never
          covers, so this card's contents stay countable for the whole run.
          They are laid out INSIDE the rows rather than in a parallel column:
          a parallel column has to restate every row height, and it did, and the
          restatement drifted 5px the moment one position grew to hold two
          claimants. Here alignment is not maintained, it is structural. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          {items.map((name, position) => (
            <Row
              key={name}
              name={`${name}.json`}
              state={
                contestedSlot === position
                  ? "contested"
                  : sealed || position < written
                    ? "written"
                    : "empty"
              }
              animate={animateCells}
            />
          ))}
        </div>

        <div className="flex min-w-0 shrink-0 flex-col gap-1 pt-2">
          <Row
            name="registry.json"
            note="the index, exactly this set"
            state={indexWritten ? "written" : "empty"}
            animate={animateCells}
            mark="index"
            fixed
          />
          <Row
            name=".manteen-kit-output.json"
            note="paths and hashes"
            state={markerWritten ? "sealed" : "empty"}
            animate={animateCells}
            mark="marker"
            fixed
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The seat. Every card has one; exactly one is filled at every frame, including
 * the frame the address changes hands. The empty seat is drawn rather than
 * omitted, so a refusal reads as *the seat was never filled* — a structural
 * fact — instead of as an absence the reader has to notice.
 */
function Seat({ seated }: { seated: boolean }) {
  if (seated) {
    return (
      <motion.span
        // Keyed so the arrival plays once, at the destination, on the frame the
        // binding cuts. There is no travelling element and no shared layout id:
        // an interrupted layout animation would run this move in reverse.
        key="seated"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: EASE_OUT }}
        className="flex shrink-0 items-center gap-1 rounded-[5px] bg-brand px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-brand-foreground uppercase sm:text-[10px]"
      >
        <span className="size-1.5 rounded-[1px] bg-brand-foreground" />
        published
      </motion.span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-[5px] border border-dashed border-fd-border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase sm:text-[10px]"
      style={{ color: QUIET_INK }}
    >
      <span className="size-1.5 rounded-[1px] border border-fd-muted-foreground/70" />
      {/* Measured at 320px: this label and the longest state word beside it use
          180px of the 215px header, so the empty seat says what it is at every
          width rather than degrading to a dash. */}
      not published
    </span>
  );
}

/** This card's contents as position markers, aligned row for row. */
/**
 * One position marker. Filled when the position holds a document, open when it
 * does not, and turned on its corner when two items claim it.
 */
function Tick({ state, mark }: { state: RowState; mark: Mark }) {
  if (mark === "index") {
    return (
      <span className="flex w-3 shrink-0 items-center justify-center sm:w-3.5" aria-hidden="true">
        <span
          className={cn(
            "h-px w-2",
            state === "empty" ? "bg-fd-muted-foreground/45" : "bg-fd-foreground/45",
          )}
        />
      </span>
    );
  }
  if (mark === "marker") {
    return (
      <span className="flex w-3 shrink-0 items-center justify-center sm:w-3.5" aria-hidden="true">
        <span
          className={cn(
            "size-1.5 rounded-full border",
            state === "empty" && "border-dashed border-fd-muted-foreground/60",
          )}
          style={state === "sealed" ? { borderColor: BRAND_INK } : undefined}
        />
      </span>
    );
  }
  return (
    <span className="flex w-3 shrink-0 items-center justify-center sm:w-3.5" aria-hidden="true">
      <span
        className={cn(
          "size-1.5 rounded-[1px]",
          state === "contested"
            ? "size-2 rotate-45 border border-fd-foreground/70"
            : state === "empty"
              ? "border border-dashed border-fd-muted-foreground/60"
              : "bg-fd-foreground/45",
        )}
      />
    </span>
  );
}

/** One document, or the position one would occupy. */
function Row({
  name,
  note,
  state,
  animate = false,
  fixed = false,
  mark = "item",
}: {
  name: string;
  note?: string;
  state: RowState;
  animate?: boolean;
  /** The index and the marker keep one row height; only document positions absorb slack. */
  fixed?: boolean;
  mark?: Mark;
}) {
  const grow = fixed ? "h-[1.375rem] sm:h-6" : "min-h-[1.375rem] flex-1 basis-0 sm:min-h-6";

  if (state === "contested") {
    return <ContestedRow path={name} animate={animate} />;
  }

  const body = (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-1.5 font-mono text-[9px] leading-none sm:text-[10px]",
        state === "empty" && "border-dashed bg-transparent",
        state === "written" && "border-fd-border bg-fd-background/60 text-fd-secondary-foreground",
        state === "sealed" && "border-brand/40 bg-brand/[0.07]",
      )}
      style={
        state === "sealed"
          ? { color: BRAND_INK }
          : state === "empty"
            ? { color: QUIET_INK }
            : undefined
      }
    >
      <span className="truncate">{name}</span>
      {note ? (
        // Muted grey measured 4.38:1 over the brand-tinted marker row in dark
        // mode — under AA for 10px text. On a tinted panel the note inherits the
        // row's own ink instead; only the untinted rows keep the muted colour.
        <span
          className="hidden shrink-0 sm:inline"
          style={state === "sealed" ? undefined : { color: QUIET_INK }}
        >
          {note}
        </span>
      ) : null}
    </div>
  );

  if (!animate || state === "empty") {
    return (
      <div className={cn("flex min-w-0 items-stretch gap-1.5", grow)}>
        <Tick state={state} mark={mark} />
        {body}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("flex min-w-0 items-stretch gap-1.5", grow)}
      // Landing, not fading in: a document is written at a position, so it
      // arrives with a short drop rather than materialising in place.
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: EASE_OUT }}
    >
      <Tick state={state} mark={mark} />
      {body}
    </motion.div>
  );
}

/**
 * The refusal, drawn inside the position rather than beside it.
 *
 * An earlier direction drew the second claimant as a duplicate row overlapping
 * the first, which read as a rendering glitch rather than as a decision. The
 * structural fact is that ONE output path has TWO claims, so the path is drawn
 * once, as a labelled position, with both claimants bracketed inside it. It is
 * kept inside the grid on purpose: a row hung out at the margin is the exact
 * shape that an `overflow-hidden` ancestor clips at 320px.
 *
 * The state is never carried by colour alone — the outline is dashed, the
 * bracket is drawn, and the count is written out.
 */
function ContestedRow({ path, animate }: { path: string; animate: boolean }) {
  const body = (
    <div className="min-w-0 flex-1 rounded-md border border-dashed border-fd-foreground/70 bg-fd-foreground/[0.05] px-1.5 py-1 font-mono text-[9px] leading-none sm:text-[10px]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-fd-foreground">{path}</span>
        <span className="shrink-0 text-[8px] tracking-[0.06em] text-fd-foreground uppercase sm:text-[9px]">
          <span className="sm:hidden">2 claims</span>
          <span className="hidden sm:inline">2 claims · 1 path</span>
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 gap-1.5 border-l border-fd-foreground/50 pl-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Two claimants, named once each. The qualifier is dropped below `sm`
              rather than left to `truncate`, which cut it to "catalog it…". */}
          <span className="truncate" style={{ color: QUIET_INK }}>
            empty-state<span className="hidden sm:inline"> · catalog item</span>
          </span>
          <span className="truncate" style={{ color: QUIET_INK }}>
            empty-state<span className="hidden sm:inline"> · catalog item</span>
          </span>
        </div>
      </div>
    </div>
  );

  const line = (
    <>
      <Tick state="contested" mark="item" />
      {body}
    </>
  );

  if (!animate) {
    return <div className="flex min-w-0 shrink-0 items-stretch gap-1.5">{line}</div>;
  }

  return (
    <motion.div
      className="flex min-w-0 shrink-0 items-stretch gap-1.5"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {line}
    </motion.div>
  );
}

/**
 * Reduced motion: both answers at once, at their end states, with no playback
 * to choose between them — so the two-position control is not rendered here,
 * since there is nothing left for it to reveal.
 *
 * This branch renders no `motion` component at all. The harness supplies no
 * `MotionConfig`, so nothing suppresses animation ambiently; a still built out
 * of elements that cannot animate is the only kind that is actually still. No
 * positional movement and no opacity crossfade, in either direction.
 */
function StaticOutcomes() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-5">
      <StaticOutcome
        heading="Build succeeded"
        items={PROSPECTIVE_ITEMS}
        state="new set, complete"
        shortState="new set"
        lead="The address moved in one step to the complete replacement set."
        detail="A reader fetching during the build received the old complete set or the new complete set."
        emphasis
      />
      <StaticOutcome
        heading="Build refused"
        items={PUBLISHED_ITEMS}
        state="complete set, unchanged"
        shortState="unchanged"
        lead="The address never moved, so the published set is exactly what it was."
        detail="Two catalog items compiled to empty-state.json, and the incomplete replacement was discarded whole."
      />
    </div>
  );
}

function StaticOutcome({
  heading,
  items,
  state,
  shortState,
  lead,
  detail,
  emphasis = false,
}: {
  heading: string;
  items: readonly string[];
  state: string;
  shortState: string;
  lead: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex min-w-0 items-baseline gap-2 px-1">
        <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase">
          {heading}
        </span>
        <span className="h-px min-w-2 flex-1 bg-fd-border" />
        <span
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.1em] uppercase"
          style={emphasis ? { color: BRAND_INK } : { color: QUIET_INK }}
        >
          <span className="sm:hidden">{shortState}</span>
          <span className="hidden sm:inline">{state}</span>
        </span>
      </div>
      <div className="min-w-0">
        <StaticCard items={items} />
      </div>
      <p className="px-1 pt-2 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}

/** The same card, built without a single animatable element. */
function StaticCard({ items }: { items: readonly string[] }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-fd-secondary p-2">
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-1 rounded-[5px] bg-brand px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-brand-foreground uppercase sm:text-[10px]">
          <span className="size-1.5 rounded-[1px] bg-brand-foreground" />
          published
        </span>
        <span
          className="min-w-0 truncate font-mono text-[9px] tracking-[0.04em] sm:text-[10px]"
          style={{ color: QUIET_INK }}
        >
          {ADDRESS}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {items.map((name) => (
          <div
            key={name}
            className="flex h-[1.375rem] min-w-0 items-center rounded-md border border-fd-border bg-fd-background/60 px-1.5 font-mono text-[9px] leading-none text-fd-secondary-foreground sm:h-6 sm:text-[10px]"
          >
            <span className="truncate">{`${name}.json`}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-1">
        <div className="flex h-[1.375rem] min-w-0 items-center justify-between gap-2 rounded-md border border-fd-border bg-fd-background/60 px-1.5 font-mono text-[9px] leading-none text-fd-secondary-foreground sm:h-6 sm:text-[10px]">
          <span className="truncate">registry.json</span>
          <span className="hidden shrink-0 sm:inline" style={{ color: QUIET_INK }}>
            the index, exactly this set
          </span>
        </div>
        <div
          className="flex h-[1.375rem] min-w-0 items-center justify-between gap-2 rounded-md border border-brand/40 bg-brand/[0.07] px-1.5 font-mono text-[9px] leading-none sm:h-6 sm:text-[10px]"
          style={{ color: BRAND_INK }}
        >
          <span className="truncate">.manteen-kit-output.json</span>
          <span className="hidden shrink-0 sm:inline">paths and hashes</span>
        </div>
      </div>
    </div>
  );
}
