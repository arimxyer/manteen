"use client";

import { motion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study C — Carrier.
 *
 * THE INSTRUMENT
 *
 * One seat and one bench, not two windows. The seat is a fixed bezel — corner
 * marks, two axle pins, a state line — and it is the published location. It never
 * moves and it is never redrawn. Sitting in it is a two-faced carrier plate: the
 * face turned toward the reader is the published set, and its reverse is whatever
 * this build has loaded. Below the seat, in the same well, is an open bench where
 * the replacement is composed. The bench is not a second window: it has no bezel,
 * no fill and no frame, and when it is empty it stops existing.
 *
 * THE ONE TRANSFORM, AND WHY IT IS A TURN
 *
 * The exchange is a single 180-degree turn of the carrier about its axle.
 *
 * That choice is the whole point of this study. A slide past a clip — two grids
 * translating through one aperture — puts the bottom of the old set and the top
 * of the new set inside the published frame at the same time, for the entire
 * length of the move. Whatever the caption says, the picture shows a half-updated
 * published location, which is the one state the product guarantees cannot exist.
 * A turn has no such frame: the reader sees the complete old set foreshortening,
 * an edge, then the complete new set opening out. Every document is present in
 * every frame of the move. There is no interval in which the seat holds a partial
 * set, because a rotating plate is never partly one face and partly the other.
 *
 * Loading is deliberately not the transform. The composed plate rises off the
 * bench and passes *behind* the carrier, which is opaque and exactly seat-sized,
 * so the published face is uninterrupted while the replacement is loaded. Nothing
 * about the published set has changed at that point, and nothing on screen
 * suggests it has.
 *
 * REFUSAL IS A SHAPE, NOT AN ERROR STATE
 *
 * A single check head travels down the bench plate and works one position at a
 * time, in the compiler's own order: documents sorted by name, then the index,
 * then the marker over both. On the refusing build a second item compiles to a
 * filename already claimed, and that position is drawn as a VOID — a hatched
 * cut-out with notched edges, a hole in a rigid plate. The head stops there. The
 * positions below it are never reached, the index is never built, the marker
 * never exists, and the carrier never turns. Nothing overlaps, nothing collides
 * on screen, and nothing flashes: the refusal is legible as a still.
 *
 * WHAT IS REAL, READ FROM THE SOURCE
 *
 * `renderOutput` walks `result.items` sorted by `localeCompare`, validates each,
 * and throws `duplicate-rendered-item` the moment a second item claims a
 * filename already in the map. `registry.json` is added to that map only *after*
 * the loop, and the marker — schema version, namespace, package version, sorted
 * path and SHA-256 entries — is computed last, over the accumulated files. So the
 * order the head walks is the compiler's order, and on the refusing run the index
 * and the marker are drawn as never built rather than as the thing that caught it.
 *
 * The whole render happens into an in-memory map before `writeRegistry` stages
 * anything. That is why this plate reserves the word "written" for the published
 * side and calls the bench work "composed": on the refused run nothing was
 * written, and that sentence is literally true rather than nearly true.
 *
 * No count is asserted anywhere. The names are representative registry items and
 * the shape — documents, then the index that must equal exactly them, then the
 * marker over both — is the fixed part.
 *
 * THE COMPOSITION RESOLVES
 *
 * When the bench is empty the well closes down onto the seat and uncovers the
 * outcome register beneath it, which states both branches at once. The outer box
 * is a constant height, so nothing in the page moves; what changes is that the
 * settled frame is a seat holding one complete set above the claim in words,
 * rather than a full-size empty tray. There is no frame of this study in which a
 * large region is present and holding nothing.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/**
 * Secondary ink, pulled toward the foreground for the same reason.
 *
 * Measured on the rendered pixels rather than reasoned about: plain
 * `--color-fd-muted-foreground` over this study's tinted plate is 4.22:1 in light
 * mode and its inactive register row is 4.04:1 over the card, both under AA for
 * text this small. Mixing toward the foreground raises every one of them past
 * 4.5:1 in light and leaves dark mode, which already passed, comfortably above.
 * The token itself is not touched; this is a local ink for a local surface.
 */
const MUTED_INK =
  "color-mix(in oklab, var(--color-fd-muted-foreground) 66%, var(--color-fd-foreground))";

/**
 * Fixed pixel geometry, on purpose.
 *
 * The turn and the load are expressed as exact offsets between two slots, so the
 * two slots have to be the same known height at every width. A responsive height
 * would make `SHIFT` a measurement, and a measurement taken a frame late puts the
 * loaded plate slightly off its seat. Content is budgeted to fit the smaller
 * number: at 320px the plate's rows occupy 162px inside a 172px seat.
 */
const SEAT_H = 178;
/** Plates sit inside the seat, so the seat reads as a recess rather than a second border. */
const SEAT_INSET = 4;
const GAP = 14;
/** Bench slot offset. The load is exactly this, so the plate lands square in the seat. */
const SHIFT = SEAT_H + GAP;
const WELL_OPEN = SEAT_H * 2 + GAP;
/** Uncovered when the well closes. Sized so the outer box never changes height. */
const REGISTER_H = WELL_OPEN - SEAT_H - 10;

/**
 * A position on a plate. Two positions can legitimately carry one filename —
 * that collision is this study's refusal — so a position needs an identity of
 * its own rather than borrowing its document's name.
 */
type Slot = { id: string; name: string };

const slot = (name: string, id = name): Slot => ({ id, name });

/** The published set. Representative items, in the compiler's sort order. */
const PUBLISHED: readonly Slot[] = [
  slot("data-table"),
  slot("empty-state"),
  slot("faq-simple"),
  slot("page-header"),
  slot("stat-card"),
];

/** The succeeding build's set: the same items plus one the author added. */
const REPLACEMENT: readonly Slot[] = [...PUBLISHED, slot("stats-grid")];

/**
 * The refusing build's positions. The author added an item and named it
 * `page-header`, which is already in use, so sorted by name the two land back to
 * back and the second one claims a filename the first already holds. Position 4
 * is where `renderOutput` throws.
 */
const CONTESTED: readonly Slot[] = [
  slot("data-table"),
  slot("empty-state"),
  slot("faq-simple"),
  slot("page-header"),
  slot("page-header", "page-header-second-claim"),
  slot("stat-card"),
];
const VOID_POSITION = 4;

/** Six documents, then the index, then the marker. */
const POSITIONS = REPLACEMENT.length + 2;

/** Rows the check head steps through: three grid rows, the index, the marker. */
const ROWS = 5;

/** Which row a position sits in, so the head rests on the row it is working. */
function rowOfPosition(position: number): number {
  if (position >= REPLACEMENT.length + 1) return 4;
  if (position >= REPLACEMENT.length) return 3;
  return Math.floor(position / 2);
}

type Outcome = "succeeds" | "refuses";

type Phase =
  | "composing"
  | "composed"
  | "loading"
  | "turning"
  | "installed"
  | "halted"
  | "discarding"
  | "discarded";

type Keyframe = { at: number; phase?: Phase; processed?: number };

/** The check head's window. One continuous gesture rather than a row of ticks. */
const PASS_START = 320;
const PASS_MS = 2050;

function passAt(position: number): number {
  return Math.round(PASS_START + (PASS_MS * (position + 1)) / POSITIONS);
}

/**
 * Both runs as data. Three legible beats each, with the dwell spent on the two
 * moments a reader has to actually understand — the plate being whole, and the
 * plate being impossible — rather than on the mechanics in between.
 */
const TIMELINES: Record<Outcome, readonly Keyframe[]> = {
  succeeds: [
    ...Array.from({ length: POSITIONS }, (_, position) => ({
      at: passAt(position),
      processed: position + 1,
    })),
    { at: passAt(POSITIONS - 1), phase: "composed" },
    // The whole plate holds long enough to be read before anything moves.
    { at: 3120, phase: "loading" },
    { at: 3800, phase: "turning" },
    { at: 4400, phase: "installed" },
  ],
  refuses: [
    ...Array.from({ length: VOID_POSITION + 1 }, (_, position) => ({
      at: passAt(position),
      processed: position + 1,
    })),
    { at: passAt(VOID_POSITION), phase: "halted" },
    // Refusal is an explanatory hold, not an error flash.
    { at: 3300, phase: "discarding" },
    { at: 3820, phase: "discarded" },
  ],
};

/** The turn. Firm and mechanical at both ends: a plate in a seat, not a card. */
const TURN = { duration: 0.56, ease: [0.65, 0, 0.35, 1] } as const;
/** The load. It ends under the carrier, so it settles rather than arrives. */
const LOAD = { type: "spring", stiffness: 210, damping: 30, mass: 0.9 } as const;
const CLOSE = { duration: 0.44, ease: [0.23, 1, 0.32, 1] } as const;
const OPEN = { duration: 0.26, ease: [0.23, 1, 0.32, 1] } as const;
const STEP = { duration: 0.22, ease: "linear" } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Returning to the start of a run is a cut, not a move.
 *
 * Springing the carrier back through 180 degrees would draw the published set
 * being un-replaced, which is the one event this study exists to say never
 * happens. A new run begins; it does not rewind.
 */
const CUT = { duration: 0 } as const;

type Caption = { lead: string; detail: string };

const CAPTIONS: Record<Phase, Caption> = {
  composing: {
    lead: "A complete replacement is composed away from the published set.",
    detail: "One pass, in the compiler's order: each document, then the index, then the marker.",
  },
  composed: {
    lead: "The replacement is whole.",
    detail: "Only a whole set is ever loaded into the carrier.",
  },
  loading: {
    lead: "The whole set is loaded behind the published face.",
    detail: "Readers are still being served the set that is already published.",
  },
  turning: {
    lead: "One turn exchanges which set is published.",
    detail: "There is no reading between the two faces of the carrier.",
  },
  installed: {
    lead: "A reader receives one complete set.",
    detail: "The set that was published, or the set that replaced it. Never a partial set.",
  },
  halted: {
    lead: "Two items compile to page-header.json.",
    detail: "One path cannot carry two claims. The build refuses before anything is written.",
  },
  discarding: {
    lead: "The incomplete set is discarded whole.",
    detail: "The carrier never turned.",
  },
  discarded: {
    lead: "A reader receives one complete set.",
    detail: "The refused build never reached the carrier. The published set is exactly as it was.",
  },
};

/** The claim in text, for a reader who never sees the plate move. */
const SUMMARY =
  "One published location holds a two-faced carrier. When a build succeeds, the complete " +
  "replacement is loaded behind the published face and a single turn exchanges them, so a reader " +
  "receives the old complete set or the new complete set and never a partial one. When a build " +
  "refuses — here because two items compile to page-header.json — the plate has a void where that " +
  "output path would be, the index and marker are never built, the carrier never turns, and the " +
  "published set is unchanged.";

export function SwapStudyC({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this study's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);
  const settled: Phase = outcome === "succeeds" ? "installed" : "discarded";

  // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed — is
  // the selected outcome already at rest, so the first frame a reader sees states
  // its result without having played. Note the boundary: this study's first frame
  // is the first CLIENT frame. The prototype harness gates every variant behind a
  // `clientReady` effect, so the server-rendered HTML holds its placeholder, not
  // this still. The guarantee proven here is that nothing animates on arrival, not
  // that the settled still is server-rendered.
  const [phase, setPhase] = useState<Phase>(run > 0 ? "composing" : settled);
  const [processed, setProcessed] = useState(run > 0 ? 0 : POSITIONS);

  useEffect(() => {
    if (reduceMotion || (run === 0 && presses === 0)) {
      setPhase(settled);
      setProcessed(outcome === "succeeds" ? POSITIONS : 0);
      return;
    }
    setPhase("composing");
    setProcessed(0);
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.processed !== undefined) setProcessed(frame.processed);
      }, frame.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [outcome, presses, run, reduceMotion, settled]);

  // Reduced motion is the settled composition with every transition removed —
  // no positional movement and no crossfade, including on the control, whose
  // shared-layout pill is replaced by a plain background rather than shortened.
  const still = reduceMotion;
  const turned = phase === "turning" || phase === "installed";
  const loaded = phase === "loading" || turned;
  const halted = phase === "halted" || phase === "discarding";
  const leaving = phase === "discarding" || phase === "discarded";
  // The well is open only while the bench is holding something. It closes as the
  // plate leaves — loaded or discarded — so the bench is never drawn empty.
  const wellOpen = !still && (phase === "composing" || phase === "composed" || phase === "halted");

  const benchPositions = outcome === "succeeds" ? REPLACEMENT : CONTESTED;
  const caption = CAPTIONS[phase];

  // The head rests on the row it is working, and sits above the plate before the
  // pass begins rather than pre-marking the first row.
  const headFraction = halted
    ? (rowOfPosition(VOID_POSITION) + 1) / ROWS
    : processed === 0
      ? 0
      : (rowOfPosition(Math.min(processed, POSITIONS) - 1) + 1) / ROWS;

  return (
    <div
      className="flex min-h-[26rem] w-full min-w-0 flex-col"
      style={{ "--swap-c-muted": MUTED_INK } as CSSProperties}
    >
      <div className="mb-3 flex items-center gap-2">
        {(["succeeds", "refuses"] as const).map((value) => (
          <button
            key={value}
            type="button"
            // Two independent toggles rather than a radiogroup: pressing the
            // pressed one is a replay, which a radio cannot express.
            aria-pressed={outcome === value}
            onClick={() => {
              setOutcome(value);
              setPresses((count) => count + 1);
            }}
            className={cn(
              "home-stage-button relative rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-[color,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100",
              outcome === value ? "text-brand-foreground" : "text-[color:var(--swap-c-muted)]",
            )}
          >
            {outcome === value ? (
              still ? (
                <span className="pointer-events-none absolute inset-0 rounded-full bg-brand" />
              ) : (
                <motion.span
                  layoutId="swap-c-outcome-pill"
                  className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="min-w-0">
        <SeatLabel
          state={
            phase === "installed"
              ? "serving the new set"
              : leaving
                ? "serving, unchanged"
                : "serving"
          }
          short={phase === "installed" ? "new set" : leaving ? "unchanged" : "serving"}
          emphasis={phase === "installed"}
        />

        {/* Constant outer height. Only the well inside it resolves. */}
        <div className="relative min-w-0" style={{ height: WELL_OPEN }}>
          <OutcomeRegister outcome={outcome} />

          <motion.div
            className="absolute inset-x-0 top-0 overflow-hidden rounded-xl bg-fd-background"
            initial={false}
            animate={{ height: wellOpen ? WELL_OPEN : SEAT_H }}
            transition={still ? CUT : wellOpen ? OPEN : CLOSE}
          >
            {/* The bench. An open work surface, not a second window: one hairline,
                no frame, no fill, and nothing left behind when the plate goes. */}
            <div
              className="absolute inset-x-0 border-t border-dashed"
              style={{ top: SHIFT, height: SEAT_H }}
            />

            {/* The composed plate. It rises behind the carrier, so the published
                face is never interrupted while it loads. */}
            {/* Unmounted the moment the carrier starts turning: at the edge-on
                instant the carrier stops occluding, and a plate parked behind it
                would show through the seat. */}
            {turned ? null : (
              <motion.div
                className="absolute z-10"
                style={{
                  top: SEAT_INSET,
                  left: SEAT_INSET,
                  right: SEAT_INSET,
                  height: SEAT_H - SEAT_INSET * 2,
                }}
                initial={false}
                animate={{ y: loaded ? 0 : leaving ? SHIFT + SEAT_H + 24 : SHIFT }}
                transition={still ? CUT : loaded ? LOAD : leaving ? CLOSE : CUT}
              >
                <Plate
                  heading="this build"
                  positions={benchPositions}
                  processed={still ? 0 : processed}
                  voidPosition={outcome === "refuses" ? VOID_POSITION : null}
                  halted={halted}
                  headFraction={headFraction}
                  showHead={!still && (phase === "composing" || halted)}
                  complete={phase === "composed" || loaded}
                  animateCells={!still}
                />
              </motion.div>
            )}

            {/* The carrier. Two faces, one axle, one turn. */}
            <div
              className="absolute z-20"
              style={{
                top: SEAT_INSET,
                left: SEAT_INSET,
                right: SEAT_INSET,
                height: SEAT_H - SEAT_INSET * 2,
                perspective: 1100,
              }}
            >
              <motion.div
                className="relative h-full w-full"
                style={{ transformStyle: "preserve-3d" }}
                initial={false}
                animate={{ rotateX: turned ? 180 : 0 }}
                transition={still ? CUT : turned ? TURN : CUT}
              >
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                >
                  <Plate heading="complete set" positions={PUBLISHED} sealed />
                </div>
                <div
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateX(180deg)",
                  }}
                >
                  <Plate heading="complete set" positions={REPLACEMENT} sealed />
                </div>
              </motion.div>
            </div>

            <SeatBezel />
          </motion.div>
        </div>
      </div>

      {/* Reserved for the longest caption at the narrowest width, so the study's
          outer height is identical in every frame and the harness can compare
          studies side by side without one of them growing mid-playback. */}
      <div className="mt-auto pt-4">
        <p className="min-h-[5.5rem] text-[13px] leading-snug text-fd-foreground sm:min-h-[3.25rem]">
          {caption.lead}
          <span className="mt-0.5 block text-[12px] text-[color:var(--swap-c-muted)]">
            {caption.detail}
          </span>
        </p>
      </div>

      {/* Announced at rest, rather than on every frame of a run. */}
      <p className="sr-only" role="status">
        {phase === "installed"
          ? "Build succeeded. The complete replacement was loaded behind the published face and one turn exchanged them."
          : phase === "discarded"
            ? "Build refused. Two items compiled to page-header.json, so the index and marker were never built, the carrier never turned, and the published set is unchanged."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

/**
 * The published location's name and what it is doing, above the seat so that
 * nothing is ever drawn over the carrier.
 *
 * Both halves carry a short form rather than relying on `truncate`: at 320px a
 * state line that reads "SERVING THE NEW S" is worse than one that reads "NEW SET".
 */
function SeatLabel({
  state,
  short,
  emphasis,
}: {
  state: string;
  short: string;
  emphasis: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase">
      <span className="shrink-0 text-[color:var(--swap-c-muted)]">Published location</span>
      <span
        className="min-w-0 truncate"
        style={emphasis ? { color: BRAND_INK } : { color: "var(--color-fd-foreground)" }}
      >
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{state}</span>
      </span>
    </div>
  );
}

/**
 * The seat, drawn over the carrier: corner marks and the two axle pins the turn
 * happens about. Non-interactive, and never animated — the location is the one
 * thing in this study that has to be fixed.
 */
function SeatBezel() {
  const corner = "absolute size-2.5 border-fd-foreground/25";
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 rounded-xl border"
      style={{ height: SEAT_H }}
    >
      <span className={cn(corner, "top-1 left-1 border-t border-l")} />
      <span className={cn(corner, "top-1 right-1 border-t border-r")} />
      <span className={cn(corner, "bottom-1 left-1 border-b border-l")} />
      <span className={cn(corner, "bottom-1 right-1 border-b border-r")} />
      <span className="absolute top-1/2 -left-px h-4 w-[3px] -translate-y-1/2 rounded-r-sm bg-fd-foreground/35" />
      <span className="absolute top-1/2 -right-px h-4 w-[3px] -translate-y-1/2 rounded-l-sm bg-fd-foreground/35" />
    </div>
  );
}

/**
 * One plate, at one moment. The published face and the bench plate are the same
 * component with different props, because they are the same kind of object —
 * that is the study's argument, and two copies of the markup would let them
 * drift into looking like different things.
 */
function Plate({
  heading,
  positions,
  processed = 0,
  voidPosition = null,
  halted = false,
  headFraction = 0,
  showHead = false,
  sealed = false,
  complete = false,
  animateCells = false,
}: {
  heading: string;
  positions: readonly Slot[];
  processed?: number;
  voidPosition?: number | null;
  halted?: boolean;
  headFraction?: number;
  showHead?: boolean;
  /** A published face arrives whole — index and marker included — and never animates in. */
  sealed?: boolean;
  complete?: boolean;
  animateCells?: boolean;
}) {
  const documents = positions.length;
  return (
    <div
      className={cn(
        // Opaque on purpose. `--color-fd-card` carries 40% alpha in dark mode,
        // and a translucent carrier would let the plate loaded behind it show
        // through — the one thing this study must never draw.
        "flex h-full flex-col overflow-hidden rounded-xl border bg-fd-secondary p-2 transition-colors duration-300",
        complete ? "border-brand/40" : "border-fd-border",
      )}
    >
      <div className="flex items-baseline justify-between px-0.5 pb-1 font-mono text-[9px] tracking-[0.12em] text-[color:var(--swap-c-muted)] uppercase">
        <span className="truncate">{heading}</span>
        {sealed ? null : (
          <span className="shrink-0" style={complete ? { color: BRAND_INK } : undefined}>
            {complete ? "whole" : halted ? "refused" : "composing"}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {showHead ? (
          <motion.div
            className="pointer-events-none absolute inset-x-0 top-0 z-10"
            initial={false}
            animate={{ height: `${headFraction * 100}%` }}
            transition={STEP}
          >
            <div
              className={cn(
                "h-full w-full",
                halted ? "bg-fd-foreground/[0.04]" : "bg-brand/[0.06]",
              )}
            />
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 h-[1.5px]",
                halted ? "bg-fd-foreground/70" : "bg-brand",
              )}
            />
          </motion.div>
        ) : null}

        <div className="flex h-full flex-col">
          <div className="grid grid-cols-2 gap-1">
            {positions.map((entry, position) => (
              <Cell
                key={entry.id}
                name={`${entry.name}.json`}
                state={
                  // The void appears only when the pass reaches it. Drawing it
                  // up front would announce the collision before the build has
                  // found it, which is not how the refusal happens.
                  sealed
                    ? "written"
                    : position >= processed
                      ? "empty"
                      : voidPosition === position
                        ? "void"
                        : "written"
                }
                animate={animateCells}
              />
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <Cell
              name="registry.json"
              note="exactly this set"
              state={sealed || processed > documents ? "written" : "empty"}
              animate={animateCells}
              wide
            />
            <Cell
              name=".manteen-kit-output.json"
              note="paths and hashes"
              state={sealed || processed > documents + 1 ? "sealed" : "empty"}
              animate={animateCells}
              wide
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One document, the position one would occupy, or a path two items both claim. */
function Cell({
  name,
  note,
  state,
  animate = false,
  wide = false,
}: {
  name: string;
  note?: string;
  state: "written" | "empty" | "void" | "sealed";
  animate?: boolean;
  wide?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "relative flex min-w-0 items-baseline justify-between gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[9px] leading-[1.35] sm:text-[10px]",
        state === "empty" &&
          "border-dashed border-fd-border bg-transparent text-[color:var(--swap-c-muted)]",
        state === "written" && "border-fd-border bg-fd-background/60 text-fd-secondary-foreground",
        state === "sealed" && "border-brand/40 bg-brand/[0.07]",
        // A hole in a rigid plate: notched corners, hatched through to the seat,
        // and no fill of its own. It is not an error badge, it is a missing part.
        state === "void" &&
          "border-dashed border-fd-foreground/60 text-fd-foreground [clip-path:polygon(0_0,calc(100%-6px)_0,100%_6px,100%_100%,6px_100%,0_calc(100%-6px))]",
      )}
      style={
        state === "sealed"
          ? { color: BRAND_INK }
          : state === "void"
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-fd-foreground) 14%, transparent) 0 1px, transparent 1px 5px)",
              }
            : undefined
      }
    >
      <span className="truncate">{name}</span>
      {/* Below `sm` the badge is dropped rather than shrunk: the filename is the
          fact a reader needs, the hatch already says the position is unfillable,
          and the caption names the collision in words. */}
      {state === "void" ? (
        <span className="hidden shrink-0 text-[9px] tracking-[0.08em] uppercase sm:inline">
          2 claims
        </span>
      ) : null}
      {note && wide && state !== "void" ? (
        <span className="hidden shrink-0 text-[color:var(--swap-c-muted)] sm:inline">{note}</span>
      ) : null}
    </div>
  );

  if (!animate || state === "empty" || state === "void") return body;

  return (
    <motion.div
      // Composed at a position, so it settles onto the position rather than
      // materialising in place.
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      {body}
    </motion.div>
  );
}

/**
 * Both branches, stated at once, under the seat.
 *
 * This is what the closing well uncovers, and it is why the settled frame is not
 * a large empty tray: the region that held the bench holds the claim instead.
 * It is also the reduced-motion frame, unchanged — the whole relationship is
 * present in words whether or not anything ever moved.
 */
function OutcomeRegister({ outcome }: { outcome: Outcome }) {
  const rows = [
    {
      key: "succeeds" as const,
      lead: "The whole set is loaded, then one turn publishes it.",
    },
    {
      key: "refuses" as const,
      lead: "Nothing is loaded. The published set is untouched.",
    },
  ];

  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col justify-center gap-3 px-1"
      style={{ height: REGISTER_H }}
    >
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-5">
        {rows.map((row) => {
          const active = row.key === outcome;
          return (
            <div key={row.key} className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-[2px]",
                    active ? "bg-brand" : "bg-fd-muted-foreground/40",
                  )}
                />
                <span style={active ? { color: BRAND_INK } : { color: "var(--swap-c-muted)" }}>
                  {row.key}
                </span>
              </span>
              <span
                className={cn(
                  "text-[12px] leading-snug",
                  active ? "text-fd-foreground" : "text-[color:var(--swap-c-muted)]",
                )}
              >
                {row.lead}
              </span>
            </div>
          );
        })}
      </div>
      <p className="border-t pt-3 text-[12px] leading-snug text-[color:var(--swap-c-muted)]">
        Either way a reader receives one complete set — never the transition.
      </p>
    </div>
  );
}
