"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "./types";

/**
 * Swap — the published set is never half-replaced.
 *
 * The claim is a *publisher* claim, and no neighbouring illustration makes it:
 * Dial answers who owns what, Cast answers how one authored file reaches two
 * roots, Phase answers what the client does with a version reading, Gauge
 * answers where a project sits, and the production `InteropStages` answers what
 * one item's field set looks like at three stages. None of them answers "can a
 * reader ever fetch my registry mid-update". This one does, and it answers it in
 * the only way that is honest: by running a build that refuses.
 *
 * WHAT IS DRAWN, AND WHY IT IS NOT A PIPELINE
 *
 * Two windows of identical width, identical grid and identical rows, stacked in
 * one instrument. The upper one is the published set; the lower one is the same
 * shape this build renders into. That is what the prospective copy actually is —
 * a sibling of the destination, in the same parent, with the same contents — so
 * it is drawn as a second copy in the same place rather than as a station
 * upstream. There is no arrow anywhere on the plate, and no word from the
 * filesystem: "stage", "journal", "backup" and "rename" are the mechanism, and
 * the mechanism is not the guarantee.
 *
 * The guarantee is drawn by the CLIP. Each window shows exactly one body height.
 * During the exchange the outgoing set travels up and out through the top while
 * the completed set travels up and in from the bottom, on one spring, in
 * lockstep, so the two clipped halves always sum to one full body. There is no
 * frame in which the published window holds a partial set — which is precisely
 * what a reader fetching `/r` mid-build would have to see for the claim to be
 * false.
 *
 * WHAT IS REAL
 *
 * The cards are representative rather than an inventory: no count is asserted
 * anywhere on the plate, because a set's size is a volatile fact that belongs in
 * the catalog and not in an illustration. What is fixed is the *shape* — item
 * documents, then an index that must be exactly the rendered set, then the
 * ownership marker that records each emitted path with its hash — and the
 * *order*, which is the compiler's: `renderOutput` walks items sorted by
 * `localeCompare`, writes `registry.json` after the loop once the index has been
 * checked against the rendered set, and builds the marker last.
 *
 * The refusal is real and was run rather than reasoned about. The authoring
 * schema puts no uniqueness constraint on item names, so two catalog entries can
 * compile to one filename; `renderOutput` then throws `duplicate-rendered-item`.
 * Against a temporary catalog with an already-published output directory that
 * build returned `{"ok": false, "mutated": false}`, the destination's
 * `registry.json` kept the same SHA-256 across the refusal, and no staging,
 * backup or journal sibling was left behind. The plate draws assembly stopping
 * mid-set, which is the concept brief's specified transform; the implementation
 * is in fact stricter still, refusing before anything is written at all.
 *
 * WHAT DOES NOT MOVE
 *
 * The published window. Not its documents, not its marker, not its position, and
 * not its state line — in either outcome, for every frame up to the single
 * exchange. An animation on the invariant would be the one thing that could make
 * this plate lie, so the invariant's cards have no entrance at all.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/**
 * Body height, and the reason it is a hard height rather than a floor.
 *
 * The exchange uses percentage `translate3d`, which resolves against the
 * animating element's own box. Both bodies are `absolute inset-0` inside a well
 * of this height, so `-100%` is exactly one window and the outgoing and incoming
 * halves meet at a seam with no measurement, at any width, in any font. A
 * `min-h` would let one body outgrow the other and open a gap in the middle of
 * the one move the whole plate exists to make.
 *
 * Content is budgeted to fit: at the narrow size the body is 144px of rows
 * inside 152px of well, and at `sm` 149px inside 164px.
 */
const WELL = "h-[9.5rem] sm:h-[10.25rem]";

/** The set that is published. Representative item documents, in the compiler's sort order. */
const LIVE_ITEMS = ["data-table", "empty-state", "faq-simple", "page-header", "stat-card"] as const;

/** The set this build renders: the same items, plus one the author added. */
const NEW_ITEMS = [...LIVE_ITEMS, "stats-grid"] as const;

/**
 * The refusing build renders the same names, because its new item was pasted
 * with a name already in use — so the second `empty-state` collides with the
 * first rather than claiming a position of its own. Sorted by name the two land
 * back to back, which is why the run stops on the third document and the
 * remaining items, the index and the marker are never written.
 */
const COLLIDING_SLOT = LIVE_ITEMS.indexOf("empty-state");

/** Item documents, then the index, then the marker: the compiler's own order. */
const SUCCESS_STEPS = NEW_ITEMS.length + 2;

type Outcome = "succeeds" | "refuses";

type Phase =
  | "assembling"
  | "colliding"
  | "refused"
  | "discarding"
  | "discarded"
  | "complete"
  | "exchanging"
  | "installed";

type Keyframe = { at: number; phase?: Phase; landed?: number };

/**
 * Both runs as data rather than as a chain of callbacks. A keyframe list can be
 * re-entered from the top at any moment, which is what makes reselection a
 * replay and an outcome switch mid-run harmless: every visual target is derived
 * from `phase` and `landed`, so an interruption retargets springs in flight
 * instead of unwinding a sequence.
 */
const TIMELINES: Record<Outcome, readonly Keyframe[]> = {
  succeeds: [
    { at: 420, landed: 1 },
    { at: 620, landed: 2 },
    { at: 820, landed: 3 },
    { at: 1020, landed: 4 },
    { at: 1220, landed: 5 },
    { at: 1420, landed: 6 },
    { at: 1640, landed: 7 },
    { at: 1860, landed: 8 },
    { at: 2000, phase: "complete" },
    // The complete set holds long enough to be read before the exchange.
    { at: 2900, phase: "exchanging" },
    { at: 3550, phase: "installed" },
  ],
  refuses: [
    { at: 420, landed: 1 },
    { at: 680, landed: 2 },
    { at: 1050, phase: "colliding" },
    { at: 1350, phase: "refused" },
    // Refusal is an explanatory hold, not a transient error flash.
    { at: 2500, phase: "discarding" },
    { at: 2950, phase: "discarded" },
  ],
};

/** One spring for the exchange, shared by all three bodies so the move is one move. */
const EXCHANGE = { type: "spring", stiffness: 240, damping: 30, mass: 0.9 } as const;

/**
 * Starting a run is a cut, not a move, and this is the correction that mattered
 * most on this plate.
 *
 * Recorded frames caught it: selecting Refuses from a settled Succeeds sprang the
 * exchange in reverse over ~0.8s, so the published window visibly *un-replaced*
 * itself — a rollback, drawn in the one place the illustration exists to say a
 * rollback never happens. The exchange is therefore the only direction that gets
 * the spring; returning to the pre-run state is instantaneous, because it is a
 * new run beginning rather than anything the published set did.
 */
const CUT = { duration: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Caption = { lead: string; detail: string };

const CAPTIONS: Record<Phase, Caption> = {
  assembling: {
    lead: "A complete replacement assembles beside the published set.",
    detail: "Documents in name order, then the index, then the marker over both.",
  },
  complete: {
    lead: "The replacement is whole.",
    detail: "Only this complete set can take the published location.",
  },
  exchanging: {
    lead: "The complete sets exchange in one move.",
    detail: "A reader gets the old set or the new set. There is no partial state.",
  },
  installed: {
    lead: "The complete sets exchange in one move.",
    detail: "A reader gets the old set or the new set. There is no partial state.",
  },
  colliding: {
    lead: "One output path has two claims.",
    detail: "The build stops before the remaining documents, index or marker are written.",
  },
  refused: {
    lead: "One output path has two claims.",
    detail: "The build stops before the remaining documents, index or marker are written.",
  },
  discarding: {
    lead: "The incomplete replacement is discarded whole.",
    detail: "The published set stays complete and unchanged.",
  },
  discarded: {
    lead: "The incomplete replacement is discarded whole.",
    detail: "The published set stays complete and unchanged.",
  },
};

/**
 * The complete claim in text, for a reader who never sees the plate move. Both
 * outcomes stated once — the drawing is marked `aria-hidden` because a grid of
 * animated cards announces nothing useful on its own.
 */
const SUMMARY =
  "Two builds of one registry. When the build succeeds, the complete replacement set exchanges " +
  "with the published set in a single move, so no reader can fetch a partly updated set. When " +
  "the build refuses — here because two items compile to empty-state.json — the incomplete " +
  "replacement is discarded whole and the published set is left exactly as it was.";

export function SwapVariant({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);
  const settled: Phase = outcome === "succeeds" ? "installed" : "discarded";

  // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed —
  // is the selected outcome already at rest, so the frame that ships in the HTML
  // states its result without ever having played. Only a reader's own selection
  // or replay puts the plate in motion.
  const [phase, setPhase] = useState<Phase>(run > 0 ? "assembling" : settled);
  const [landed, setLanded] = useState(run > 0 ? 0 : SUCCESS_STEPS);

  useEffect(() => {
    if (reduceMotion) return;
    if (run === 0 && presses === 0) {
      setPhase(settled);
      setLanded(outcome === "succeeds" ? SUCCESS_STEPS : 0);
      return;
    }
    setPhase("assembling");
    setLanded(0);
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.landed !== undefined) setLanded(frame.landed);
      }, frame.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [outcome, presses, run, reduceMotion, settled]);

  if (reduceMotion) return <StaticPair />;

  const resting = run === 0 && presses === 0;
  const exchanged = phase === "exchanging" || phase === "installed";
  const leaving = phase === "discarding" || phase === "discarded";
  const staged = outcome === "refuses" ? LIVE_ITEMS : NEW_ITEMS;
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
                layoutId="swap-outcome-pill"
                className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="flex min-w-0 flex-col gap-2">
        {/* The invariant. Its label sits above, so the two windows stay adjacent
            and the hand-off between them reads as one object crossing a seam. */}
        <div className="min-w-0">
          <FrameLabel
            left="Published"
            right={exchanged ? "new set, complete" : leaving ? "unchanged" : "complete set"}
            short={exchanged ? "new set" : leaving ? "unchanged" : "complete"}
            emphasis={exchanged}
          />
          <div className={cn("relative overflow-hidden rounded-xl border bg-fd-secondary", WELL)}>
            {/* The set that is published. The only value it ever animates is the
                one that carries it out. */}
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{
                transform: exchanged ? "translate3d(0,-100%,0)" : "translate3d(0,0%,0)",
              }}
              transition={exchanged ? EXCHANGE : CUT}
            >
              <SetBody items={LIVE_ITEMS} filled={LIVE_ITEMS.length} sealed />
            </motion.div>
            {/* Its replacement, waiting exactly one window below the sill. */}
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{
                transform: exchanged ? "translate3d(0,0%,0)" : "translate3d(0,100%,0)",
              }}
              transition={exchanged ? EXCHANGE : CUT}
            >
              <SetBody items={NEW_ITEMS} filled={NEW_ITEMS.length} sealed />
            </motion.div>
          </div>
        </div>

        {/* The transform. Same width, same grid, same rows — a second copy of the
            window above it rather than a stage before it. */}
        <div className="min-w-0">
          <div className={cn("relative overflow-hidden rounded-xl border bg-fd-secondary", WELL)}>
            <motion.p
              className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-fd-muted-foreground"
              initial={false}
              animate={{ opacity: phase === "installed" || phase === "discarded" ? 1 : 0 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
            >
              {phase === "discarded"
                ? "Discarded. Nothing was written."
                : "Installed. The replacement copy is gone."}
            </motion.p>
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{
                transform: exchanged
                  ? "translate3d(0,-100%,0) scale(1)"
                  : leaving
                    ? "translate3d(0,6%,0) scale(0.965)"
                    : "translate3d(0,0%,0) scale(1)",
                opacity: leaving ? 0 : 1,
              }}
              transition={{
                transform: exchanged
                  ? EXCHANGE
                  : leaving
                    ? { duration: 0.42, ease: EASE_OUT }
                    : CUT,
                opacity: { duration: 0.42, ease: EASE_OUT },
              }}
            >
              <SetBody
                items={staged}
                filled={Math.min(landed, staged.length)}
                slots
                indexFilled={landed >= SUCCESS_STEPS - 1}
                markerFilled={landed >= SUCCESS_STEPS}
                collidingSlot={
                  phase === "colliding" || phase === "refused" || phase === "discarding"
                    ? COLLIDING_SLOT
                    : null
                }
                complete={phase === "complete" || exchanged}
                animateCells={!resting}
              />
            </motion.div>
          </div>
          <FrameLabel
            left="This build"
            right={statusWord(phase)}
            short={shortStatusWord(phase)}
            emphasis={phase === "complete" || phase === "exchanging"}
            stamped={phase === "refused" || leaving}
            below
          />
        </div>
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
          ? "Build succeeded. The complete replacement set exchanged with the published set in one move."
          : phase === "discarded"
            ? "Build refused. Two items compiled to empty-state.json, the incomplete replacement was discarded, and the published set is unchanged."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </div>
  );
}

function statusWord(phase: Phase): string {
  if (phase === "assembling" || phase === "colliding") return "rendering";
  if (phase === "complete") return "replacement complete";
  if (phase === "exchanging") return "installing";
  if (phase === "installed") return "installed";
  return "refused";
}

function shortStatusWord(phase: Phase): string {
  return phase === "complete" ? "complete" : statusWord(phase);
}

/**
 * A window's name and its state, in one line that has to survive 320px.
 *
 * Both halves carry a deliberate short form rather than relying on `truncate`:
 * measured at 320px the long pairing clipped its own container, and a state line
 * that reads "REPLACEMENT COMPLET" is worse than one that reads "COMPLETE". The
 * cut is chosen here, at the two widths it happens, instead of by whichever half
 * happened to run out of room.
 */
function FrameLabel({
  left,
  right,
  short,
  emphasis = false,
  stamped = false,
  below = false,
}: {
  left: string;
  right: string;
  /** The state word below `sm`. Defaults to `right` when it already fits. */
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
 * One set, at one moment. The published window and the build window render the
 * same component with different props, because they are the same kind of thing —
 * that is the plate's whole argument, and duplicating the markup would let the
 * two drift into looking like different objects.
 */
function SetBody({
  items,
  filled,
  slots = false,
  sealed = false,
  indexFilled = false,
  markerFilled = false,
  collidingSlot = null,
  complete = false,
  animateCells = false,
}: {
  items: readonly string[];
  filled: number;
  /** Draw the unwritten positions. Only the prospective copy has them; a published set has no gaps. */
  slots?: boolean;
  /** A published set arrives whole — index and marker included — and never animates in. */
  sealed?: boolean;
  indexFilled?: boolean;
  markerFilled?: boolean;
  collidingSlot?: number | null;
  complete?: boolean;
  animateCells?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col p-2 transition-colors duration-300",
        complete ? "bg-brand/[0.05]" : "bg-transparent",
      )}
    >
      <div className="grid grid-cols-2 gap-1">
        {items.map((name, position) => {
          const present = sealed || position < filled;
          const collided = collidingSlot === position;
          if (!present && !slots) return null;
          return (
            <div key={name} className="relative">
              <Cell
                name={`${name}.json`}
                state={collided ? "refused" : present ? "written" : "empty"}
                animate={animateCells}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <Cell
          name="registry.json"
          note="the index, exactly this set"
          state={sealed || indexFilled ? "written" : "empty"}
          animate={animateCells}
          wide
        />
        <Cell
          name=".manteen-kit-output.json"
          note="paths and hashes"
          state={sealed || markerFilled ? "sealed" : "empty"}
          animate={animateCells}
          wide
        />
      </div>
    </div>
  );
}

/** One document, or the position one would occupy. */
function Cell({
  name,
  note,
  state,
  animate = false,
  wide = false,
}: {
  name: string;
  note?: string;
  state: "written" | "empty" | "refused" | "sealed";
  animate?: boolean;
  wide?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full min-w-0 items-baseline justify-between gap-2 rounded-md border px-1.5 py-1 font-mono text-[9px] leading-[1.35] sm:text-[10px]",
        state === "empty" && "border-dashed bg-transparent text-fd-muted-foreground",
        state === "written" && "border-fd-border bg-fd-background/50 text-fd-secondary-foreground",
        state === "sealed" && "border-brand/40 bg-brand/[0.07]",
        state === "refused" && "border-fd-foreground/70 bg-fd-foreground/[0.07] text-fd-foreground",
      )}
      style={state === "sealed" ? { color: BRAND_INK } : undefined}
    >
      <span className="truncate">{name}</span>
      {state === "refused" ? (
        <>
          <span className="shrink-0 text-[8px] tracking-[0.08em] uppercase sm:hidden">
            2 claims
          </span>
          <span className="hidden shrink-0 text-[9px] tracking-[0.05em] uppercase sm:inline">
            2 claims · 1 path
          </span>
          <span className="absolute -top-1 right-2 flex items-end gap-0.5" aria-hidden="true">
            <span className="h-1.5 w-2 rounded-t-sm border border-b-0 border-fd-foreground/70 bg-fd-secondary" />
            <motion.span
              className="h-1.5 w-2 rounded-t-sm border border-b-0 border-fd-foreground/70 bg-fd-secondary"
              initial={animate ? { opacity: 0, transform: "translate3d(0,-7px,0)" } : false}
              animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            />
          </span>
        </>
      ) : null}
      {note && wide ? (
        <span className="hidden shrink-0 text-fd-muted-foreground sm:inline">{note}</span>
      ) : null}
    </div>
  );

  if (!animate || state === "empty" || state === "refused") return body;

  return (
    <motion.div
      // Landing, not fading in: a document is written at a position, so it
      // arrives with a short drop rather than materialising in place.
      initial={{ opacity: 0, transform: "translate3d(0,4px,0)" }}
      animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
      transition={{ duration: 0.24, ease: EASE_OUT }}
    >
      {body}
    </motion.div>
  );
}

/**
 * Reduced motion: both answers at once, at their end states, with no playback to
 * choose between them — so the two-position control is not rendered here, since
 * there is nothing left for it to reveal. No crossfade either; `reducedMotion:
 * "user"` deliberately leaves opacity alone, so a truthful still has to be built
 * out of elements that never animate rather than out of motion values set to nil.
 */
function StaticPair() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-4">
      <StaticOutcome
        heading="Succeeds"
        state="new set, complete"
        shortState="new set"
        lead="Exchanged in one move."
        detail="The complete replacement took the published location in a single move. A reader mid-build got the old set or the new one."
        items={NEW_ITEMS}
        emphasis
      />
      <StaticOutcome
        heading="Refuses"
        state="unchanged"
        shortState="unchanged"
        lead="The published set was never touched."
        detail="Two items compiled to empty-state.json, so the incomplete replacement was discarded whole and nothing was written."
        items={LIVE_ITEMS}
      />
    </div>
  );
}

function StaticOutcome({
  heading,
  state,
  shortState,
  lead,
  detail,
  items,
  emphasis = false,
}: {
  heading: string;
  state: string;
  shortState: string;
  lead: string;
  detail: string;
  items: readonly string[];
  emphasis?: boolean;
}) {
  return (
    <section className="min-w-0">
      <FrameLabel left={heading} right={state} short={shortState} emphasis={emphasis} />
      <div className={cn("overflow-hidden rounded-xl border bg-fd-secondary", WELL)}>
        <SetBody items={items} filled={items.length} sealed />
      </div>
      <p className="px-1 pt-2 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}
