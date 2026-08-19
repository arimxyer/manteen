"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study E — "Trace": the published set drawn against time.
 *
 * WHY A CLOCK AND NOT A SECOND WINDOW
 *
 * The Swap claim is temporal before it is spatial. "A reader gets the old
 * complete set or the new complete set" is a statement about every instant, and
 * the only way to falsify it is to find one instant where the published set is
 * partial. So the instrument is a record of one run against a clock rather than
 * a picture of two directories: a lane that pre-exists the run, a now-marker
 * that sweeps across it, and the tint left behind as the record of what a reader
 * received at each moment.
 *
 * That gives the illustration a sentence with one cause and one effect: a build
 * can put exactly one edge in the published line, or none. It can never put a
 * gap in it. Success is one hard edge. Refusal is one unbroken tint. Neither is
 * a gap, and there is no third possibility to draw.
 *
 * WHY THE EXCHANGE IS A CUT
 *
 * Every other transition on this plate is continuous; the exchange is the only
 * discontinuity. That is deliberate, and it is the strongest available statement
 * of atomicity — a spring, a crossfade, or a wipe would each draw an interval
 * during which the published set was in transition, which is the one thing that
 * never happens. The chips above the lane hold identical position and content
 * for the whole run and then change between two frames.
 *
 * For the same reason the edge never animates away. Returning to the start of a
 * run is a remount, not a reverse: an edge springing back out of the line would
 * draw a rollback of a published set, in the one plate that exists to say a
 * published set is never rolled back.
 *
 * WHAT IS REAL
 *
 * The five item names are entries in this repository's own catalog. No count is
 * asserted anywhere — a set's size is a volatile fact that belongs in the
 * catalog, so the plate shows a representative set and never a total.
 *
 * Both outcomes are the *same author edit*: `stat-card` was revised. If the
 * revision is valid the entire published set is replaced, even though one
 * document differs — which is the point the settled success frame is there to
 * make. If it is not valid, `renderOutput` throws `invalid-rendered-item` inside
 * its sorted render loop (`registry-output.ts:113`), so the run stops in name
 * order and the remaining documents, the index and the marker are never built.
 * `validateRegistryIndex` never runs on that path, so the index is drawn as
 * never built rather than as the thing that caught the fault, and nothing is
 * written at all — there is no staged copy to discard and nothing to undo.
 *
 * The order is the compiler's: items sorted by `localeCompare`, then
 * `registry.json` once the index has been checked against the rendered set, then
 * the ownership marker over both.
 *
 * WHAT DOES NOT MOVE
 *
 * The published chips and the lane's geometry. The chips have no entrance, no
 * reorder and no crossfade in either outcome; the lane is full width from the
 * first frame because the published set pre-exists the build. Only the record
 * accumulates.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/**
 * Secondary ink for text inside the two tinted panels.
 *
 * `text-fd-muted-foreground` measures 4.22:1 over `bg-fd-secondary` in light
 * mode, which is below AA, and this plate puts real sentences on that panel
 * rather than decoration. Pulling the muted token toward the foreground lifts it
 * past 5:1 in light mode and lightens it in dark mode, where the same mix moves
 * the other way.
 */
const PANEL_INK =
  "color-mix(in oklab, var(--color-fd-muted-foreground) 68%, var(--color-fd-foreground))";

/** Representative entries from this repository's catalog, in the compiler's sort order. */
const ITEMS = ["data-table", "empty-state", "page-header", "stat-card", "stats-grid"] as const;

/**
 * The one document this run's author edited. It is the same document in both
 * outcomes, because the two runs are the same edit with two verdicts.
 */
const EDITED = "stat-card";

/** Item documents, then the index, then the marker. */
const ROWS = [...ITEMS.map((name) => `${name}.json`), "registry.json", ".manteen-kit-output.json"];
const EDITED_ROW = ITEMS.indexOf(EDITED);
const MARKER_ROW = ROWS.length - 1;
const ALL_RENDERED = ROWS.length;

/**
 * What actually differs between the two published sets.
 *
 * The edited item is the obvious one. The ownership marker is the one that is
 * easy to get wrong and worth drawing: `renderOutput` builds it from
 * `sha256(content)` over every emitted file, so it necessarily differs whenever
 * any document does. The index is left unclaimed — `registry.json` is the
 * catalog's index, and whether it differs depends on whether the edit touched
 * an indexed field, which this plate has no business asserting either way.
 */
const CHANGED_ROWS = new Set([EDITED_ROW, MARKER_ROW]);

const OK_TOTAL = 5400;
const OK_EDGE = 3600;
const NO_TOTAL = 4800;
const NO_END = 3000;

const OK_EDGE_FRACTION = OK_EDGE / OK_TOTAL;
const NO_END_FRACTION = NO_END / NO_TOTAL;

/**
 * Reads are placed irregularly and sparsely on purpose. A metronome would imply
 * observed traffic that no source owns; these are *any* read, at any instant.
 * The fourth is pinned to the exact moment the run ends, because a read landing
 * on the exchange is the whole claim and it must be visible that one did.
 */
const OK_READS = [0.1, 0.27, 0.46, OK_EDGE_FRACTION, 0.83, 0.95] as const;
const NO_READS = [0.1, 0.27, 0.46, NO_END_FRACTION, 0.8, 0.94] as const;

type Outcome = "succeeds" | "refuses";

type Phase =
  | "opening"
  | "rendering"
  | "whole"
  | "exchanged"
  | "fault"
  | "refused"
  | "held"
  | "closed";

type Frame = { at: number; phase?: Phase; rendered?: number };

/**
 * Both runs as data rather than as a chain of callbacks, so a run can be
 * re-entered from the top at any moment. Every visual target is derived from
 * `phase` and `rendered`, which makes an outcome switch mid-run a restart rather
 * than an unwind.
 *
 * Pacing is deliberately unhurried: documents land 400ms apart, and the whole
 * replacement is held for roughly half a second before the exchange so the
 * reader can see a complete set *before* it is allowed to take the location.
 */
const TIMELINES: Record<Outcome, readonly Frame[]> = {
  succeeds: [
    { at: 500, phase: "rendering", rendered: 1 },
    { at: 900, rendered: 2 },
    { at: 1300, rendered: 3 },
    { at: 1700, rendered: 4 },
    { at: 2100, rendered: 5 },
    { at: 2500, rendered: 6 },
    { at: 2900, rendered: 7 },
    { at: 3150, phase: "whole" },
    { at: OK_EDGE, phase: "exchanged" },
    { at: 4400, phase: "held" },
    { at: OK_TOTAL, phase: "closed" },
  ],
  refuses: [
    { at: 500, phase: "rendering", rendered: 1 },
    { at: 900, rendered: 2 },
    { at: 1300, rendered: 3 },
    { at: 1800, phase: "fault" },
    { at: NO_END, phase: "refused" },
    { at: 3800, phase: "held" },
    { at: NO_TOTAL, phase: "closed" },
  ],
};

type Caption = { lead: string; detail: string };

const CAPTIONS: Record<Outcome, Partial<Record<Phase, Caption>>> = {
  succeeds: {
    opening: {
      lead: "The published set is what a reader receives.",
      detail: "Its documents and its ownership marker hold for the whole build.",
    },
    rendering: {
      lead: "A complete replacement is rendered beside it.",
      detail: "Item documents in name order, then the index, then the marker over both.",
    },
    whole: {
      lead: "The replacement set is whole.",
      detail: "Only a complete set is allowed to take the published location.",
    },
    exchanged: {
      lead: "The sets exchange in one move.",
      detail: "A read landing on that instant gets the old complete set or the new one.",
    },
    held: {
      lead: "Every read after the mark gets the new set.",
      detail: "None got a partial one, because there was never a partial set to get.",
    },
    closed: {
      lead: "Every read after the mark gets the new set.",
      detail: "None got a partial one, because there was never a partial set to get.",
    },
  },
  refuses: {
    opening: {
      lead: "The published set is what a reader receives.",
      detail: "Its documents and its ownership marker hold for the whole build.",
    },
    rendering: {
      lead: "A complete replacement is rendered beside it.",
      detail: "Item documents in name order, then the index, then the marker over both.",
    },
    fault: {
      lead: "One item document does not satisfy the wire schema.",
      detail: "The run stops in name order. Nothing after that document is built.",
    },
    refused: {
      lead: "The run is refused, and nothing was written.",
      detail: "The published location was never opened, so there is nothing to undo.",
    },
    held: {
      lead: "The published line has no edge.",
      detail: "Its documents and its marker are exactly what they were before the build ran.",
    },
    closed: {
      lead: "The published line has no edge.",
      detail: "Its documents and its marker are exactly what they were before the build ran.",
    },
  },
};

/**
 * The complete claim in text, for a reader who never sees the plate move. The
 * drawing is `aria-hidden`: a swept lane and a grid of filenames announce
 * nothing useful on their own.
 */
const SUMMARY =
  "One registry, one author edit, two verdicts, each drawn against time. The published set is its " +
  "item documents, its index and its ownership marker, and it is drawn as " +
  "a lane that already exists when the build starts; a pen sweeps across it and leaves behind a " +
  "record of what a reader received at each instant. When the build succeeds, the complete " +
  "replacement takes the published location in a single move, so the lane carries exactly one " +
  "hard edge and a read landing on that instant still receives a complete set. When the build " +
  "refuses — here because the revised stat-card.json does not satisfy the wire schema — the run " +
  "stops in name order, the remaining documents, the index and the ownership marker are never " +
  "built, nothing is written, and the lane carries no edge at all. In neither run does the lane " +
  "carry a gap.";

export function SwapStudyE({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);

  const resting = run === 0 && presses === 0;
  const [phase, setPhase] = useState<Phase>(resting ? "closed" : "opening");
  const [rendered, setRendered] = useState(resting ? ALL_RENDERED : 0);

  useEffect(() => {
    if (reduceMotion) return;
    // Strict no-autoplay. A direct arrival mounts the selected outcome already
    // at rest. The harness server-renders a placeholder behind its `clientReady`
    // gate, so this is a client-side arrival guarantee, not a claim that the
    // settled frame ships in the HTML.
    if (run === 0 && presses === 0) {
      setPhase("closed");
      setRendered(outcome === "succeeds" ? ALL_RENDERED : 3);
      return;
    }
    setPhase("opening");
    setRendered(0);
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.rendered !== undefined) setRendered(frame.rendered);
      }, frame.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [outcome, presses, run, reduceMotion]);

  if (reduceMotion) return <StaticTraces />;

  const succeeded = outcome === "succeeds";
  const exchanged = succeeded && (phase === "exchanged" || phase === "held" || phase === "closed");
  const faulted = !succeeded && phase !== "opening" && phase !== "rendering";
  const refused = !succeeded && (phase === "refused" || phase === "held" || phase === "closed");
  const caption = CAPTIONS[outcome][phase] ?? CAPTIONS[outcome].opening;

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
                layoutId="swap-e-outcome-pill"
                className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="flex min-w-0 flex-col gap-3">
        {/* The invariant. Chips and lane geometry are identical in every frame of
            every run; the only thing that ever changes here is the record. */}
        <section className="min-w-0">
          <PanelLabel
            left="Published"
            right={exchanged ? "replaced in one move" : "unchanged"}
            short={exchanged ? "replaced" : "unchanged"}
            emphasis={exchanged}
          />
          <div className="rounded-xl border bg-fd-secondary p-2">
            <div className="flex flex-wrap gap-1">
              {ROWS.map((file, index) => (
                <Chip key={file} name={file} marked={exchanged && CHANGED_ROWS.has(index)} />
              ))}
            </div>
            <Lane
              key={`${outcome}-${run}-${presses}`}
              outcome={outcome}
              resting={resting}
              exchanged={exchanged}
              refused={refused}
            />
          </div>
        </section>

        {/* The transform, drawn as a record rather than as a second directory.
            It only ever accumulates, so no frame of it is empty, and at rest it
            answers a question the lane above cannot: what actually differed. */}
        <section className="min-w-0">
          <PanelLabel
            left="This run"
            right={runState(outcome, phase)}
            short={shortRunState(outcome, phase)}
            emphasis={succeeded && (phase === "whole" || exchanged)}
            stamped={refused}
          />
          <div className="rounded-xl border bg-fd-secondary p-2">
            <ul className="flex flex-col gap-px">
              {ROWS.map((file, index) => (
                <RunRow
                  key={file}
                  file={file}
                  state={rowState({ index, rendered, succeeded, faulted })}
                  changed={succeeded && CHANGED_ROWS.has(index)}
                />
              ))}
            </ul>
            {/* Reserved to the tallest string this panel can hold, measured per
                breakpoint. An unreserved block resizes the card as phases
                advance, which is movement in the one plate whose thesis is that
                nothing moves except the record. */}
            <p
              className="mt-1.5 min-h-[4.5rem] border-t pt-1.5 text-[11px] leading-snug sm:min-h-[2.75rem]"
              style={{ color: PANEL_INK }}
            >
              {runFooter(outcome, phase)}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-auto pt-3">
        {/* Reserved for the same reason as the record's closing line. */}
        <p className="min-h-[5rem] text-[13px] leading-snug text-fd-foreground sm:min-h-[3.5rem]">
          {caption?.lead}
          <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">
            {caption?.detail}
          </span>
        </p>
      </div>

      {/* Announced at rest, rather than on every frame of a run. */}
      <p className="sr-only" role="status">
        {phase !== "closed"
          ? ""
          : succeeded
            ? "Build succeeded. The complete replacement set took the published location in one move, and the published line carries one edge and no gap."
            : "Build refused. The revised stat-card.json failed wire-schema validation, nothing was written, and the published line carries no edge."}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

/**
 * The published lane: what a reader received, instant by instant.
 *
 * The lane is full width from the first frame because the published set already
 * exists when a build starts — sweeping a *fill* across a lane that is already
 * there says "time passed", where growing the lane itself would say "the
 * published set was being created", which is false and would also make the
 * settled direct-arrival frame incoherent.
 *
 * The sweep is linear and runs at one rate across both segments, so the lane is
 * a clock rather than an easing curve. Remounting on every run start is what
 * keeps the edge from ever animating away: a new run begins from a fresh mount
 * rather than by reversing the previous one.
 */
function Lane({
  outcome,
  resting,
  exchanged,
  refused,
}: {
  outcome: Outcome;
  resting: boolean;
  exchanged: boolean;
  refused: boolean;
}) {
  const succeeded = outcome === "succeeds";
  const total = succeeded ? OK_TOTAL : NO_TOTAL;
  const endFraction = succeeded ? OK_EDGE_FRACTION : NO_END_FRACTION;
  const endPercent = endFraction * 100;
  const reads = succeeded ? OK_READS : NO_READS;

  return (
    <div className="mt-2 min-w-0">
      {/* Where this run ended, on the same clock, kept on the lane's upper edge
          so it can never be confused with a read. Both outcomes end at the same
          place; only one of them left an edge in the line. */}
      <div className="relative h-1.5">
        {exchanged || refused ? (
          <span
            className={cn(
              "absolute bottom-0 h-1.5 w-px -translate-x-1/2",
              exchanged ? "bg-brand" : "bg-fd-foreground/50",
            )}
            style={{ left: `${endPercent}%` }}
          />
        ) : null}
      </div>

      <div className="relative h-7 overflow-hidden rounded-md border bg-fd-background/40">
        {/* The set that was published when the run began. In a refused run this
            is the entire lane, edge to edge, and that is the claim. */}
        <motion.div
          className="absolute inset-y-0 left-0 bg-fd-foreground/[0.16]"
          initial={resting ? false : { width: "0%" }}
          animate={{ width: succeeded ? `${endPercent}%` : "100%" }}
          transition={{ duration: (succeeded ? OK_EDGE : NO_TOTAL) / 1000, ease: "linear" }}
        />
        {/* The set published after the exchange. It begins exactly where the
            previous one ends: the two segments share one boundary, so the lane
            has no instant that belongs to neither. */}
        {succeeded ? (
          <motion.div
            className="absolute inset-y-0 bg-brand/40"
            style={{ left: `${endPercent}%` }}
            initial={resting ? false : { width: "0%" }}
            animate={{ width: `${100 - endPercent}%` }}
            transition={{
              duration: (OK_TOTAL - OK_EDGE) / 1000,
              ease: "linear",
              delay: resting ? 0 : OK_EDGE / 1000,
            }}
          />
        ) : null}
        {/* The pen: one marker travelling at one rate for the whole run, so the
            lane reads as a clock rather than as two progress bars. */}
        <motion.span
          className="absolute inset-y-0 w-px bg-fd-foreground/60"
          initial={resting ? false : { left: "0%" }}
          animate={{ left: "100%" }}
          transition={{ duration: (succeeded ? OK_TOTAL : NO_TOTAL) / 1000, ease: "linear" }}
        />
        {/* The exchange itself: the one discontinuity on the plate. */}
        {exchanged ? (
          <motion.span
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand"
            style={{ left: `${endPercent}%` }}
            initial={resting ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
          />
        ) : null}
      </div>

      <div className="relative h-2">
        {reads.map((fraction, index) => (
          <ReadMark
            key={fraction}
            fraction={fraction}
            at={resting ? 0 : (fraction * total) / 1000}
            animate={!resting}
            fresh={succeeded && index >= 3}
          />
        ))}
      </div>

      <div
        className="flex items-baseline justify-between gap-2 pt-1 font-mono text-[9px] tracking-[0.1em] uppercase"
        style={{ color: PANEL_INK }}
      >
        <span className="hidden truncate sm:inline">
          each mark is a read · the line is what it received
        </span>
        <span className="ml-auto shrink-0">time &rarr;</span>
      </div>
    </div>
  );
}

/** One read of the published set, at one instant, and the set it received. */
function ReadMark({
  fraction,
  at,
  animate,
  fresh,
}: {
  fraction: number;
  at: number;
  animate: boolean;
  fresh: boolean;
}) {
  const className = cn(
    "absolute top-0.5 size-1.5 -translate-x-1/2 rounded-[1px]",
    fresh ? "bg-brand" : "bg-fd-foreground/45",
  );
  const style = { left: `${fraction * 100}%` };

  if (!animate) return <span className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, delay: at, ease: [0.23, 1, 0.32, 1] }}
    />
  );
}

/**
 * One document in the published set. Every chip carries a fixed-width trailing
 * slot whether or not it has anything to put in it, so marking the revised
 * document at the exchange cannot reflow the row — the chips have to hold
 * position, and a wrap that shifts by one chip would read as movement.
 */
function Chip({ name, marked }: { name: string; marked: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] leading-[1.5] sm:text-[10px]",
        marked
          ? "border-brand/50 bg-brand/[0.10]"
          : "border-fd-border bg-fd-background/50 text-fd-secondary-foreground",
      )}
      style={marked ? { color: BRAND_INK } : undefined}
    >
      <span className="truncate">{name}</span>
      <span
        className={cn("size-1 shrink-0 rounded-full", marked ? "bg-brand" : "bg-transparent")}
      />
    </span>
  );
}

type RowState = "pending" | "rendered" | "invalid" | "unreached";

function rowState({
  index,
  rendered,
  succeeded,
  faulted,
}: {
  index: number;
  rendered: number;
  succeeded: boolean;
  faulted: boolean;
}): RowState {
  if (succeeded) return index < rendered ? "rendered" : "pending";
  if (faulted && index === EDITED_ROW) return "invalid";
  if (faulted && index > EDITED_ROW) return "unreached";
  return index < rendered ? "rendered" : "pending";
}

/**
 * One line of the run's record. The fault is a marked row followed by rows that
 * say they were never reached — a structural statement, with nothing overlapping
 * anything and no element in an in-between state.
 */
function RunRow({ file, state, changed }: { file: string; state: RowState; changed: boolean }) {
  const note =
    state === "invalid"
      ? "invalid · wire schema"
      : state === "unreached"
        ? "never built"
        : state === "rendered"
          ? changed
            ? "rendered · differs"
            : "rendered"
          : "";
  const shortNote =
    state === "invalid"
      ? "invalid"
      : state === "unreached"
        ? "never built"
        : state === "rendered"
          ? changed
            ? "differs"
            : "rendered"
          : "";

  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-[3px] px-1 py-[3px] font-mono text-[9px] leading-[1.45] sm:text-[10px]",
        state === "rendered" && "text-fd-secondary-foreground",
        state === "invalid" && "bg-fd-foreground/[0.07] text-fd-foreground",
      )}
      style={state === "pending" || state === "unreached" ? { color: PANEL_INK } : undefined}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-[1px] border",
          state === "pending" && "border-dashed border-fd-border",
          state === "unreached" && "border-dashed border-fd-border",
          state === "rendered" && "border-fd-foreground/45 bg-fd-foreground/45",
          state === "invalid" && "border-fd-foreground bg-transparent",
        )}
      />
      <span className="truncate">{file}</span>
      <span className="ml-auto shrink-0 pl-1.5 tracking-[0.04em] uppercase">
        <span className="sm:hidden">{shortNote}</span>
        <span className="hidden sm:inline">{note}</span>
      </span>
    </li>
  );
}

function runState(outcome: Outcome, phase: Phase): string {
  if (outcome === "refuses") {
    if (phase === "opening" || phase === "rendering") return "rendering";
    if (phase === "fault") return "stopping";
    return "refused";
  }
  if (phase === "opening" || phase === "rendering") return "rendering";
  if (phase === "whole") return "replacement complete";
  return "installed";
}

function shortRunState(outcome: Outcome, phase: Phase): string {
  return outcome === "succeeds" && phase === "whole" ? "complete" : runState(outcome, phase);
}

/**
 * The record's closing statement. It is never blank and never a receipt for an
 * empty panel: while the run is live it says where the bytes are going, and once
 * the run is over it answers the question the lane above cannot — for a success,
 * what actually differed, and for a refusal, the specific structural fault.
 */
function runFooter(outcome: Outcome, phase: Phase): string {
  if (phase === "opening" || phase === "rendering") {
    return "Rendered complete before anything is staged beside the published location.";
  }
  if (outcome === "succeeds") {
    if (phase === "whole") {
      return "Every document was rendered again, and the set is not the one that is published.";
    }
    return "One item document differs, and the marker that hashes them all differs with it. The whole set was replaced, not patched.";
  }
  if (phase === "fault") {
    return "The revised stat-card.json does not satisfy the wire schema, and a set missing a document is not a set that can be published.";
  }
  return "Nothing was written. The published location was never opened, so there is nothing to roll back.";
}

/** A panel's name and its state, in one line that has to survive 320px. */
function PanelLabel({
  left,
  right,
  short,
  emphasis = false,
  stamped = false,
}: {
  left: string;
  right: string;
  /** The state word below `sm`. */
  short: string;
  emphasis?: boolean;
  stamped?: boolean;
}) {
  const state = (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{right}</span>
    </>
  );

  return (
    <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase">
      <span className="shrink-0 text-fd-muted-foreground">{left}</span>
      {stamped ? (
        <span className="min-w-0 truncate bg-fd-foreground px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-fd-background">
          {state}
        </span>
      ) : (
        <span
          className="min-w-0 truncate"
          style={emphasis ? { color: BRAND_INK } : { color: "var(--color-fd-foreground)" }}
        >
          {state}
        </span>
      )}
    </div>
  );
}

/**
 * Reduced motion: both runs' completed records, side by side in time, with no
 * playback to choose between them — so the two-position control is not rendered,
 * since there is nothing left for it to reveal.
 *
 * Built out of elements that never animate rather than out of motion values set
 * to nil: `reducedMotion: "user"` deliberately leaves opacity alone, so a
 * crossfade would survive that mechanism, and this concept's still has to have
 * no crossfade at all. Nothing here is a paused frame — each is the finished
 * record of one run, which is exactly what the animated version settles into.
 */
function StaticTraces() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-5">
      <StaticTrace
        heading="Succeeds"
        state="replaced in one move"
        shortState="replaced"
        emphasis
        lead="One edge in the published line."
        detail="One item document differed, and the marker that hashes them all differed with it, yet the whole set was replaced rather than patched. A read landing on the exchange got the old complete set or the new one."
      />
      <StaticTrace
        heading="Refuses"
        state="unchanged"
        shortState="unchanged"
        lead="No edge in the published line."
        detail="The revised stat-card.json did not satisfy the wire schema, so the run stopped in name order and the remaining documents, the index and the marker were never built. Nothing was written."
      />
    </div>
  );
}

function StaticTrace({
  heading,
  state,
  shortState,
  lead,
  detail,
  emphasis = false,
}: {
  heading: string;
  state: string;
  shortState: string;
  lead: string;
  detail: string;
  emphasis?: boolean;
}) {
  const reads = emphasis ? OK_READS : NO_READS;
  const endPercent = (emphasis ? OK_EDGE_FRACTION : NO_END_FRACTION) * 100;

  return (
    <section className="min-w-0">
      <PanelLabel left={heading} right={state} short={shortState} emphasis={emphasis} />
      <div className="rounded-xl border bg-fd-secondary p-2">
        <div className="flex flex-wrap gap-1">
          {ROWS.map((file, index) => (
            <Chip key={file} name={file} marked={emphasis && CHANGED_ROWS.has(index)} />
          ))}
        </div>
        <div className="relative mt-2 h-1.5">
          <span
            className={cn(
              "absolute bottom-0 h-1.5 w-px -translate-x-1/2",
              emphasis ? "bg-brand" : "bg-fd-foreground/50",
            )}
            style={{ left: `${endPercent}%` }}
          />
        </div>
        <div className="relative h-7 overflow-hidden rounded-md border bg-fd-background/40">
          <span
            className="absolute inset-y-0 left-0 bg-fd-foreground/[0.16]"
            style={{ width: emphasis ? `${endPercent}%` : "100%" }}
          />
          {emphasis ? (
            <>
              <span
                className="absolute inset-y-0 right-0 bg-brand/40"
                style={{ width: `${100 - endPercent}%` }}
              />
              <span
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand"
                style={{ left: `${endPercent}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="relative h-2">
          {reads.map((fraction, index) => (
            <span
              key={fraction}
              className={cn(
                "absolute top-0.5 size-1.5 -translate-x-1/2 rounded-[1px]",
                emphasis && index >= 3 ? "bg-brand" : "bg-fd-foreground/45",
              )}
              style={{ left: `${fraction * 100}%` }}
            />
          ))}
        </div>
        <div
          className="flex items-baseline justify-between gap-2 pt-1 font-mono text-[9px] tracking-[0.1em] uppercase"
          style={{ color: PANEL_INK }}
        >
          <span className="hidden truncate sm:inline">
            each mark is a read · the line is what it received
          </span>
          <span className="ml-auto shrink-0">time &rarr;</span>
        </div>
      </div>
      <p className="px-1 pt-2 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}
