"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study D — "Received". The guarantee drawn from the reader's side.
 *
 * WHY THIS OBJECT AND NOT ANOTHER
 *
 * The claim is not "the build is careful". The claim is "there is no instant at
 * which a reader can fetch a partly updated set". That is a statement about
 * *every instant of the run*, and the only honest way to draw a statement about
 * every instant is to let instants pass and show what an observer got at each
 * one. So the plate's dominant element is not the registry. It is the record of
 * what readers received while this build ran.
 *
 * Above a fixed publication line: a band of marks, one per reader fetch across
 * the run, each mark a small capped stack — item documents under the index that
 * makes them a set. Every mark is whole. None is ever half-drawn, because none
 * ever could be. Below the line: what this build has rendered, which is the only
 * place in the picture where anything is ever incomplete — and it is not a place
 * a reader can look.
 *
 * WHY IT IS NOT A CONVEYOR
 *
 * A horizontal axis invites a pipeline reading, and the concept brief rules
 * pipelines and stations out. The discriminator is enforced in the layout:
 * *nothing translates along the axis.* Marks appear where they belong and never
 * move; only the present moment advances. The build below the line is a block
 * whose horizontal extent carries no time meaning at all, so there are never two
 * rightward-advancing things side by side. The one translation in the whole
 * plate is vertical, it happens once, and it is the publication itself.
 *
 * WHAT MOTION DOES THAT A STILL CANNOT
 *
 * Three beats, not eight: the rendered set *grows*, it becomes *whole*, and it
 * *crosses*. The crossing is one spring, and the region below the line clips it,
 * so the set is consumed by the publication line rather than sliding past it.
 * At that instant a seam falls between two marks, and every mark after it is the
 * new edition — one document taller. The seam is a boundary, never a transition:
 * no mark is ever half one edition and half the other, which is exactly the
 * partial state the plate exists to deny.
 *
 * WHY THE FRAME IS FULLER AT THE END THAN AT THE START
 *
 * The band accumulates, so the settled frame carries more than the first frame
 * in both outcomes, and it is the band that carries the composition. The strip
 * below the line never empties either — it settles as an installed record or as
 * a refusal record, three rows and a statement in both cases. Those two records
 * are equal to each other, which is the point that matters: a refusal is not
 * less evidence than a success, it is the same amount of evidence with a
 * different conclusion, and it is drawn that way.
 *
 * WHY THE REFUSAL CANNOT READ AS A GLITCH
 *
 * No overlapping geometry anywhere. A contested output path is drawn as a
 * *division*: one filename, and beneath it the two catalog entries that both
 * claim it, each named by its own source path. A division is deliberate; two
 * objects rendered on top of each other is what a broken layout looks like. The
 * slots after it simply stay dashed, because they are never reached, and the
 * band above does not flinch for a single mark.
 *
 * WHAT IS REAL, AND ONE DIVERGENCE FROM THE BRIEF
 *
 * The names are real catalog names and the two claim paths follow the catalog's
 * real file conventions (`registry/ui/...` and `registry/mantine-ui/<name>/...`).
 * No inventory count is asserted anywhere; a set's size belongs to the catalog.
 *
 * The concept brief specifies the refused transform as "assembly stops and the
 * staged side is removed whole". `registry-output.ts` is stricter: `renderOutput`
 * builds the entire file map in memory — items sorted by `localeCompare`,
 * throwing `duplicate-rendered-item` on a second claim to one filename, then the
 * index checked against the rendered set, then the marker — and it throws before
 * `writeRegistry` stages a single byte. The executable source outranks the
 * brief, so this study labels the lower region *what this build has rendered*,
 * and says of the refusal that nothing was ever written rather than that
 * something was written and removed. The crossing is never captioned with
 * filesystem vocabulary: what it guarantees is one move, and "rename" is how,
 * not what.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/** Reader fetches drawn across one run. Representative cadence, not measured traffic. */
const MARKS = 10;

/**
 * The mark at which the published edition changes. It is an index *between*
 * marks, never inside one: marks 0-5 received the old set, 6-9 the new one, and
 * there is no mark in either state.
 */
const SEAM_AT = 6;

/** Stable identities for positional elements, so nothing is keyed by a bare index. */
const MARK_SLOTS = Array.from({ length: MARKS }, (_, index) => `mark-${index}`);
const PIP_SLOTS = ["pip-a", "pip-b", "pip-c", "pip-d", "pip-e", "pip-f"] as const;

/** The published set. Representative item documents, in the compiler's sort order. */
const LIVE_ITEMS = ["data-table", "empty-state", "faq-simple", "page-header", "stat-card"] as const;

/** The set this build renders: the same items, plus one the author added. */
const NEW_ITEMS = [...LIVE_ITEMS, "stats-grid"] as const;

/** Item documents, then the index, then the marker: the compiler's own order. */
const RENDER_STEPS = NEW_ITEMS.length + 2;

/**
 * The refusing run renders the same names, because its new item was pasted into
 * the catalog under a name already in use. Sorted by name the two land back to
 * back, so rendering stops on the third document and neither the remaining
 * items, nor the index, nor the marker is ever reached.
 */
const CONTESTED = "empty-state";
const CLAIMS = [
  "registry/ui/empty-state.tsx",
  "registry/mantine-ui/empty-state/empty-state.tsx",
] as const;

type Outcome = "succeeds" | "refuses";

type Phase =
  | "rendering"
  | "whole"
  | "installing"
  | "installed"
  | "contested"
  | "discarding"
  | "discarded";

type Keyframe = { at: number; phase?: Phase; rendered?: number; marks?: number };

/**
 * Both runs as data rather than as a chain of callbacks. A keyframe list can be
 * re-entered from the top at any moment, which is what makes reselection a
 * replay and an outcome switch mid-run harmless: every visual target is derived
 * from `phase`, `rendered` and `marks`, so an interruption retargets a spring in
 * flight instead of unwinding a sequence.
 *
 * The cadence is deliberately uniform and unhurried. Reader fetches keep landing
 * through the whole run, including while the build renders and after it settles,
 * because that continuity is the claim: the tail is not padding, it is the proof
 * that the published set kept serving complete sets after the one move.
 */
const TIMELINES: Record<Outcome, readonly Keyframe[]> = {
  succeeds: [
    { at: 200, marks: 1 },
    { at: 420, rendered: 1 },
    { at: 660, marks: 2 },
    { at: 740, rendered: 2 },
    { at: 1060, rendered: 3 },
    { at: 1120, marks: 3 },
    { at: 1380, rendered: 4 },
    { at: 1580, marks: 4 },
    { at: 1700, rendered: 5 },
    { at: 2020, rendered: 6 },
    { at: 2040, marks: 5 },
    { at: 2380, rendered: 7 },
    { at: 2500, marks: 6 },
    { at: 2700, rendered: 8 },
    // The rendered set holds, whole, long enough to be read as one object before
    // anything can move. A thing can only cross as a unit if it was seen as one.
    { at: 2900, phase: "whole" },
    { at: 3500, phase: "installing", marks: 7 },
    { at: 4100, phase: "installed" },
    { at: 3980, marks: 8 },
    { at: 4440, marks: 9 },
    { at: 4900, marks: 10 },
  ],
  refuses: [
    { at: 200, marks: 1 },
    { at: 420, rendered: 1 },
    { at: 660, marks: 2 },
    { at: 740, rendered: 2 },
    { at: 1060, phase: "contested" },
    { at: 1120, marks: 3 },
    { at: 1580, marks: 4 },
    { at: 2040, marks: 5 },
    // Refusal is an explanatory hold, not a transient error flash.
    { at: 2200, phase: "discarding" },
    { at: 2500, marks: 6 },
    { at: 2700, phase: "discarded" },
    { at: 2960, marks: 7 },
    { at: 3420, marks: 8 },
    { at: 3880, marks: 9 },
    { at: 4340, marks: 10 },
  ],
};

/** One spring for the crossing. It is the only positional move on the plate. */
const CROSSING = { type: "spring", stiffness: 210, damping: 28, mass: 0.9 } as const;

/** The refused set leaves the other way, and leaving is not a publication. */
const DISCARD = { duration: 0.42, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * Returning to the start of a run is a cut, not a move.
 *
 * The rejected baseline recorded this the hard way: selecting the other outcome
 * from a settled state sprang its exchange in reverse, so the published set
 * visibly *un-published* itself — a rollback drawn in the one place the plate
 * denies rollbacks. The crossing is therefore the only direction with a spring.
 * The same hazard exists here in a second place, and is closed the same way: the
 * band's marks are unmounted rather than animated back, so no mark ever reverts
 * from the new edition to the old one.
 */
const CUT = { duration: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ARRIVE = { duration: 0.18, ease: EASE_OUT } as const;

type Caption = { lead: string; detail: string };

const CAPTIONS: Record<Phase, Caption> = {
  rendering: {
    lead: "A complete replacement set is rendered away from the published one.",
    detail: "Readers keep fetching throughout, and keep receiving the set they already had.",
  },
  whole: {
    lead: "The replacement set is whole.",
    detail: "Only a whole set is eligible to become the published one.",
  },
  installing: {
    lead: "The published set changes in one move.",
    detail:
      "Every fetch before that moment got the old set. Every fetch after it gets the new one.",
  },
  installed: {
    lead: "The published set changes in one move.",
    detail:
      "Every fetch before that moment got the old set. Every fetch after it gets the new one.",
  },
  contested: {
    lead: "Two catalog entries claim one output path.",
    detail:
      "Rendering refuses here, before the remaining documents, the index or the marker exist.",
  },
  discarding: {
    lead: "The refused set is gone, and nothing was ever written.",
    detail: "The published set was not touched, so readers never saw this build at all.",
  },
  discarded: {
    lead: "The refused set is gone, and nothing was ever written.",
    detail: "The published set was not touched, so readers never saw this build at all.",
  },
};

/**
 * The complete claim in text, for a reader who never sees the plate move. The
 * drawing is `aria-hidden`: a band of pips announces nothing useful on its own.
 */
const SUMMARY =
  "Two builds of one registry, drawn from the reader's side. A row of marks records what readers " +
  "received while each build ran, and every mark is a complete set. When the build succeeds, the " +
  "rendered replacement becomes the published set in a single move: the marks before that moment " +
  "carry the old set, the marks after it carry the new one, and no mark carries a mixture. When " +
  "the build refuses — here because two catalog entries both compile to empty-state.json — " +
  "rendering stops before anything is written, and every mark across the whole run carries the " +
  "same unchanged set.";

export function SwapStudyD({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);
  const settled: Phase = outcome === "succeeds" ? "installed" : "discarded";

  // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed —
  // is the selected outcome already at rest, with the band fully accumulated and
  // the seam already placed, so the first rendered frame states its result
  // without ever having played. (The *first* frame, not the server HTML: the
  // harness gates this component behind a `clientReady` effect, so the document
  // ships its placeholder and the settled still is the first client paint.
  // Measured on a direct `?v=5` arrival: 45 samples over 2.64s, one distinct
  // state.)
  const [phase, setPhase] = useState<Phase>(run > 0 ? "rendering" : settled);
  const [rendered, setRendered] = useState(run > 0 ? 0 : RENDER_STEPS);
  const [marks, setMarks] = useState(run > 0 ? 0 : MARKS);

  useEffect(() => {
    if (reduceMotion) return;
    if (run === 0 && presses === 0) {
      setPhase(settled);
      setRendered(outcome === "succeeds" ? RENDER_STEPS : 2);
      setMarks(MARKS);
      return;
    }
    setPhase("rendering");
    setRendered(0);
    setMarks(0);
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.rendered !== undefined) setRendered(frame.rendered);
        if (frame.marks !== undefined) setMarks(frame.marks);
      }, frame.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [outcome, presses, run, reduceMotion, settled]);

  if (reduceMotion) return <StaticOutcomes />;

  const resting = run === 0 && presses === 0;
  const crossed = phase === "installing" || phase === "installed";
  const leaving = phase === "discarding" || phase === "discarded";
  const caption = CAPTIONS[phase];

  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        {(["succeeds", "refuses"] as const).map((value) => (
          <button
            key={value}
            type="button"
            // Two independent `aria-pressed` toggles rather than a radiogroup:
            // pressing the pressed one is a replay, which a radio cannot express,
            // and pressed reports exactly what is on screen.
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
                layoutId="swap-d-outcome-pill"
                className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="flex min-w-0 flex-col">
        <StripLabel
          left="What every reader receives"
          shortLeft="Readers receive"
          right={crossed ? "new set" : "unchanged"}
          emphasis={crossed}
        />

        {/* The invariant. Nothing already in this band ever moves, changes tone,
            or is redrawn; the only thing that happens to it is that more of it
            arrives. An animation on the invariant is the one thing that could
            make the plate lie. */}
        <div className="min-w-0 rounded-t-xl border border-b-0 bg-fd-secondary px-2 pt-2 pb-0">
          <div className="flex h-[3.5rem] items-end justify-between gap-[3px] sm:h-[4.75rem] sm:gap-[5px]">
            {MARK_SLOTS.map((slot, index) => {
              const seam = index === SEAM_AT;
              return (
                <div key={slot} className="contents">
                  {seam ? <Seam shown={crossed} /> : null}
                  <div className="flex min-w-0 max-w-[30px] flex-1 items-end justify-center">
                    {index < marks ? (
                      <Mark
                        documents={
                          crossed && index >= SEAM_AT ? NEW_ITEMS.length : LIVE_ITEMS.length
                        }
                        fresh={crossed && index >= SEAM_AT}
                        animate={!resting}
                      />
                    ) : (
                      <span className="h-px w-full bg-fd-foreground/20" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The publication line. The one element on the plate that never changes
            in either outcome, and the edge the rendered set is consumed by. */}
        <div className="h-[2px] w-full bg-fd-foreground/70" />

        {/* The transform, and the only place anything is ever incomplete. */}
        <div className="relative min-w-0 overflow-hidden rounded-b-xl border-x border-b bg-fd-secondary">
          <div className="h-[9rem] sm:h-[11.5rem]" />

          {/* The record, revealed by the panel above it leaving rather than by a
              fade of its own — one motion, not two, and no crossfade to time. */}
          <div className="absolute inset-0 p-2">
            {outcome === "succeeds" ? <InstalledRecord /> : <RefusedRecord />}
          </div>

          <motion.div
            className="absolute inset-0 bg-fd-secondary"
            initial={false}
            animate={{
              transform: crossed
                ? "translate3d(0,-100%,0)"
                : leaving
                  ? "translate3d(0,100%,0)"
                  : "translate3d(0,0%,0)",
            }}
            transition={crossed ? CROSSING : leaving ? DISCARD : CUT}
          >
            <RenderedSet
              items={NEW_ITEMS}
              rendered={rendered}
              contested={phase === "contested" || leaving}
              whole={phase === "whole" || crossed}
              animate={!resting}
            />
          </motion.div>
        </div>

        <StripLabel
          left="This build"
          right={statusWord(phase)}
          short={shortStatusWord(phase)}
          emphasis={phase === "whole" || crossed}
          stamped={phase === "contested" || leaving}
          below
        />
      </div>

      <div className="mt-auto pt-4">
        <p className="min-h-[2.75rem] text-[13px] leading-snug text-fd-foreground">
          {caption.lead}
          <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">
            {caption.detail}
          </span>
        </p>
      </div>

      {/* Announced at rest, rather than on every frame of a run. */}
      <p className="sr-only" role="status">
        {phase === "installed"
          ? "Build succeeded. The rendered replacement set became the published set in one move, and no reader fetch received a mixture of the two."
          : phase === "discarded"
            ? "Build refused. Two catalog entries both compiled to empty-state.json, so rendering stopped before anything was written and every reader fetch received the same unchanged set."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

function statusWord(phase: Phase): string {
  if (phase === "rendering") return "rendering";
  if (phase === "whole") return "rendered, whole";
  if (phase === "installing") return "installing";
  if (phase === "installed") return "installed";
  if (phase === "contested") return "refusing";
  return "refused";
}

function shortStatusWord(phase: Phase): string {
  return phase === "whole" ? "whole" : statusWord(phase);
}

/**
 * One reader fetch, and the whole set it received.
 *
 * Item documents under a cap, which is the index that makes them a set rather
 * than a pile. There is no partial variant of this component and no prop that
 * could produce one, which is the strongest available guarantee that a partial
 * mark can never be drawn: the picture cannot express the state it denies.
 */
function Mark({
  documents,
  fresh,
  animate,
}: {
  documents: number;
  fresh: boolean;
  animate: boolean;
}) {
  return (
    <motion.span
      className="flex w-full flex-col items-stretch gap-[2px]"
      initial={animate ? { opacity: 0, transform: "translate3d(0,3px,0)" } : false}
      animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
      transition={ARRIVE}
    >
      <span
        className={cn(
          "mb-[2px] h-[4px] rounded-[1px] sm:mb-[3px] sm:h-[6px]",
          fresh ? "bg-brand" : "bg-fd-foreground/60",
        )}
      />
      {PIP_SLOTS.slice(0, documents).map((pip) => (
        <span
          key={pip}
          className={cn(
            "h-[5px] rounded-[1px] sm:h-[8px]",
            fresh ? "bg-brand/45" : "bg-fd-foreground/25",
          )}
        />
      ))}
    </motion.span>
  );
}

/**
 * The moment the published set changed, drawn as a boundary between two marks
 * rather than as anything that happens inside one. It has no width to speak of
 * and it is always in the layout, so the marks either side of it hold the same
 * positions before and after the crossing.
 */
function Seam({ shown }: { shown: boolean }) {
  return (
    <span className="relative flex w-px shrink-0 self-stretch justify-center">
      <span className={cn("w-px flex-1", shown ? "bg-fd-foreground/55" : "bg-transparent")} />
      {shown ? (
        <>
          <span className="absolute top-0 size-[3px] -translate-y-px rounded-full bg-fd-foreground/80" />
          <span className="absolute bottom-0 size-[3px] translate-y-px rounded-full bg-fd-foreground/80" />
        </>
      ) : null}
    </span>
  );
}

/**
 * What this build has rendered — held in memory, written nowhere.
 *
 * Its horizontal extent carries no time meaning, which is what keeps the plate
 * off the conveyor reading. Documents in name order, then the index that must be
 * exactly the rendered set, then the marker over both.
 */
function RenderedSet({
  items,
  rendered,
  contested,
  whole,
  animate,
}: {
  items: readonly string[];
  rendered: number;
  contested: boolean;
  whole: boolean;
  animate: boolean;
}) {
  const contestedSlot = items.indexOf(CONTESTED);

  return (
    <div
      className={cn(
        "flex h-full flex-col p-2 ring-inset transition-colors duration-300 motion-reduce:transition-none",
        whole ? "bg-brand/[0.07] ring-1 ring-brand/35" : "bg-transparent ring-0 ring-transparent",
      )}
    >
      <div className="grid grid-cols-2 gap-1">
        {items.map((name, position) => (
          <Slot
            key={name}
            name={`${name}.json`}
            state={
              contested && position === contestedSlot
                ? "contested"
                : contested && position > contestedSlot
                  ? "empty"
                  : position < rendered
                    ? "rendered"
                    : "empty"
            }
            animate={animate}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-1">
        {contested ? (
          // A division, not an overlap. Two catalog entries, each named by the
          // source that produced it, both compiling to the one filename above.
          <div className="rounded-md border border-fd-foreground/60 bg-fd-foreground/[0.06] px-1.5 py-1 font-mono text-[9px] leading-[1.5] sm:text-[10px]">
            <p className="text-fd-foreground">
              two entries claim <span className="font-semibold">{CONTESTED}.json</span>
            </p>
            {CLAIMS.map((claim) => (
              <p key={claim} className="truncate text-fd-foreground/70">
                {claim}
              </p>
            ))}
          </div>
        ) : (
          <>
            <Slot
              name="registry.json"
              note="the index, exactly this set"
              state={rendered >= RENDER_STEPS - 1 ? "rendered" : "empty"}
              animate={animate}
              wide
            />
            <Slot
              name=".manteen-kit-output.json"
              note="paths and hashes"
              state={rendered >= RENDER_STEPS ? "sealed" : "empty"}
              animate={animate}
              wide
            />
          </>
        )}
      </div>
    </div>
  );
}

/** One rendered document, or the position one would occupy. */
function Slot({
  name,
  note,
  state,
  animate = false,
  wide = false,
}: {
  name: string;
  note?: string;
  state: "rendered" | "empty" | "contested" | "sealed";
  animate?: boolean;
  wide?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-2 rounded-md border px-1.5 py-1 font-mono text-[9px] leading-[1.35] sm:text-[10px]",
        state === "empty" && "border-dashed bg-transparent text-fd-foreground/70",
        state === "rendered" && "border-fd-border bg-fd-background/50 text-fd-secondary-foreground",
        state === "sealed" && "border-brand/40 bg-brand/[0.07]",
        // Inverted rather than merely outlined. Below `sm` the "2 claims" badge
        // has no room and the filename must survive whole, so the contested slot
        // has to separate from both a rendered slot and a dashed one without
        // spending any horizontal space — and inversion also matches the REFUSING
        // stamp, so the two read as one statement rather than two treatments.
        state === "contested" && "border-fd-foreground bg-fd-foreground text-fd-background",
      )}
      style={state === "sealed" ? { color: BRAND_INK } : undefined}
    >
      <span className="truncate">{name}</span>
      {state === "contested" ? (
        <span className="hidden shrink-0 text-[9px] tracking-[0.08em] uppercase sm:inline">
          2 claims
        </span>
      ) : null}
      {note && wide ? (
        // Not `text-fd-muted-foreground`: measured 3.60 light / 3.72 dark over the
        // sealed panel's brand tint. A foreground alpha clears AA in both themes.
        <span className="hidden shrink-0 text-fd-foreground/70 sm:inline">{note}</span>
      ) : null}
    </div>
  );

  if (!animate || state === "empty" || state === "contested") return body;

  return (
    <motion.div
      // Landing, not fading in: a document is rendered at a position, so it
      // arrives with a short drop rather than materialising in place.
      initial={{ opacity: 0, transform: "translate3d(0,4px,0)" }}
      animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {body}
    </motion.div>
  );
}

/**
 * The settled strip after a successful run. The rendered set is gone from below
 * the line because it is above it now, so what remains is the record of what
 * went — which is more useful in the settled frame than the empty well the
 * rejected baseline left behind.
 */
function InstalledRecord() {
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <RecordRow
        name="item documents"
        note="all of them, or none of them"
        shortNote="all or none"
        emphasis
      />
      <RecordRow
        name="registry.json"
        note="the index, exactly this set"
        shortNote="the index"
        emphasis
      />
      <RecordRow
        name=".manteen-kit-output.json"
        note="every path, with its hash"
        shortNote="paths + hashes"
        emphasis
      />
      <p className="px-1.5 pt-1 font-mono text-[9px] leading-[1.5] text-fd-foreground/70 sm:text-[10px]">
        published together, in one move
      </p>
    </div>
  );
}

/** The settled strip after a refused run. Same mass, different conclusion. */
function RefusedRecord() {
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <RecordRow
        name={`${CONTESTED}.json`}
        note="claimed twice, by two entries"
        shortNote="claimed twice"
      />
      <RecordRow name="registry.json" note="never reached" />
      <RecordRow name=".manteen-kit-output.json" note="never reached" />
      <p className="px-1.5 pt-1 font-mono text-[9px] leading-[1.5] text-fd-foreground/70 sm:text-[10px]">
        nothing written, so nothing to undo
      </p>
    </div>
  );
}

function RecordRow({
  name,
  note,
  shortNote,
  emphasis = false,
}: {
  name: string;
  note: string;
  /** The note below `sm`, where the filename is the half that must survive. */
  shortNote?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-2 rounded-md border px-1.5 py-1 font-mono text-[9px] leading-[1.35] sm:text-[10px]",
        emphasis
          ? "border-brand/40 bg-brand/[0.07]"
          : "border-fd-border bg-fd-background/50 text-fd-foreground/75",
      )}
      style={emphasis ? { color: BRAND_INK } : undefined}
    >
      <span className="truncate">{name}</span>
      <span
        className={cn("shrink-0 text-[8px] sm:text-[9px]", emphasis ? "" : "text-fd-foreground/70")}
      >
        <span className="sm:hidden">{shortNote ?? note}</span>
        <span className="hidden sm:inline">{note}</span>
      </span>
    </div>
  );
}

/**
 * A strip's name and its state, in one line that has to survive 320px.
 *
 * Both halves carry a deliberate short form rather than relying on `truncate`: a
 * state line that reads "RENDERED, WHOL" is worse than one that reads "WHOLE",
 * and the cut is better chosen here than by whichever half happened to run out
 * of room first.
 */
function StripLabel({
  left,
  shortLeft,
  right,
  short,
  emphasis = false,
  stamped = false,
  below = false,
}: {
  left: string;
  /** The strip name below `sm`. Defaults to the long form when it already fits. */
  shortLeft?: string;
  right: string;
  /** The state word below `sm`. Defaults to the long form when it already fits. */
  short?: string;
  emphasis?: boolean;
  stamped?: boolean;
  below?: boolean;
}) {
  const state = (
    <>
      <span className="sm:hidden">{short ?? right}</span>
      <span className="hidden sm:inline">{right}</span>
    </>
  );

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 px-1 font-mono text-[10px] tracking-[0.12em] uppercase",
        below ? "pt-1.5" : "pb-1.5",
      )}
    >
      <span className="min-w-0 shrink truncate text-fd-muted-foreground">
        <span className="sm:hidden">{shortLeft ?? left}</span>
        <span className="hidden sm:inline">{left}</span>
      </span>
      {stamped ? (
        <span className="min-w-0 shrink-0 truncate bg-fd-foreground px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-fd-background">
          {state}
        </span>
      ) : (
        <span
          className="min-w-0 shrink-0 truncate"
          style={emphasis ? { color: BRAND_INK } : { color: "var(--color-fd-foreground)" }}
        >
          {state}
        </span>
      )}
    </div>
  );
}

/**
 * Reduced motion: both answers at once, complete, with no playback to choose
 * between them — so the two-position control is not rendered, since there is
 * nothing left for it to reveal.
 *
 * Nothing here is a motion component and nothing has a transition, so there is
 * no positional movement and no opacity crossfade. That is deliberate rather
 * than inherited: `reducedMotion: "user"` leaves opacity alone, so a truthful
 * still has to be built out of elements that never animate rather than out of
 * motion values set to nil.
 *
 * Both stills are complete: each carries its full band, its seam or its absence,
 * and its record. Neither is the animation paused at an arbitrary time.
 */
function StaticOutcomes() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-5">
      <StaticOutcome
        heading="Succeeds"
        state="new set"
        lead="The published set changed in one move."
        detail="Marks before the seam received the old set; marks after it receive the new one. None received a mixture."
        seam
        record={<InstalledRecord />}
      />
      <StaticOutcome
        heading="Refuses"
        state="unchanged"
        lead="Rendering refused, and nothing was written."
        detail="Two catalog entries both compiled to empty-state.json, so every mark across the run received the same unchanged set."
        seam={false}
        record={<RefusedRecord />}
      />
    </div>
  );
}

function StaticOutcome({
  heading,
  state,
  lead,
  detail,
  seam,
  record,
}: {
  heading: string;
  state: string;
  lead: string;
  detail: string;
  seam: boolean;
  record: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <StripLabel left={heading} right={state} emphasis={seam} />
      <div
        aria-hidden="true"
        className="min-w-0 rounded-t-xl border border-b-0 bg-fd-secondary px-2 pt-2"
      >
        <div className="flex h-[3.25rem] items-end justify-between gap-[3px] sm:h-[4.75rem] sm:gap-[5px]">
          {MARK_SLOTS.map((slot, index) => (
            <div key={slot} className="contents">
              {index === SEAM_AT ? <Seam shown={seam} /> : null}
              <div className="flex min-w-0 max-w-[30px] flex-1 items-end justify-center">
                <StaticMark
                  documents={seam && index >= SEAM_AT ? NEW_ITEMS.length : LIVE_ITEMS.length}
                  fresh={seam && index >= SEAM_AT}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="h-[2px] w-full bg-fd-foreground/70" />
      <div
        aria-hidden="true"
        className="min-w-0 rounded-b-xl border border-t-0 bg-fd-secondary p-2"
      >
        <div className="h-[5.5rem]">{record}</div>
      </div>
      <p className="px-1 pt-2 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}

/** The same mark, with no motion component behind it. */
function StaticMark({ documents, fresh }: { documents: number; fresh: boolean }) {
  return (
    <span className="flex w-full flex-col items-stretch gap-[2px]">
      <span
        className={cn(
          "mb-[2px] h-[4px] rounded-[1px] sm:mb-[3px] sm:h-[6px]",
          fresh ? "bg-brand" : "bg-fd-foreground/60",
        )}
      />
      {PIP_SLOTS.slice(0, documents).map((pip) => (
        <span
          key={pip}
          className={cn(
            "h-[5px] rounded-[1px] sm:h-[8px]",
            fresh ? "bg-brand/45" : "bg-fd-foreground/25",
          )}
        />
      ))}
    </span>
  );
}
