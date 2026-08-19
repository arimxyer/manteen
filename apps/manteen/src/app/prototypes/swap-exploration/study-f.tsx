"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study F — Address and record.
 *
 * THE PRODUCT TRUTH, RESTATED BEFORE ANYTHING IS DRAWN
 *
 * A registry is a set that readers fetch. Publishing an update must never let a
 * reader observe a mixture. So the published set is never edited: a whole
 * prospective set is assembled somewhere else, and the published *address* is
 * bound to it in one indivisible act. If the prospective set cannot be completed
 * the whole thing is thrown away and the address keeps naming what it already
 * named.
 *
 * The load-bearing word there is *address*. What changes on a successful build
 * is not the contents of a place — it is which complete set a name resolves to.
 * That is why this plate animates a name and not a payload.
 *
 * WHY THIS IS NOT THE TWO-WINDOW REEL
 *
 * The rejected baseline drew two stacked windows and slid documents through a
 * clip: a conveyor. A conveyor has to be watched from end to end, which is why
 * slowing it down did not stop it feeling hurried — it had eleven beats to get
 * through, and a lower window that had nothing left to do once they were done.
 *
 * This plate is built on one geometric claim instead: **the frame has room for
 * exactly one published set.** At rest a single plate fills the frame. During a
 * build a second plate borrows half of it. Afterwards one plate fills the frame
 * again — the new set if the build succeeded, the original set if it refused.
 * The consolidation is the argument, not a cleanup, so neither outcome can leave
 * a spent panel behind: there is no "this build" area to go dead, because the
 * surviving plate is always the published one.
 *
 * The single move is the ADDRESS TAG travelling from the old plate to the
 * completed one while the two plates trade the frame. Nothing else crosses.
 *
 * THE RECORD, AND WHAT IT IS ALLOWED TO CLAIM
 *
 * Under the plates is a strip of readings of `/r`. Its axis is readings, not
 * milliseconds, and each tick asserts exactly one thing: that reading returned
 * one complete set. It does not claim anything about traffic that straddles the
 * exchange, because the guarantee this illustration is licensed to draw is about
 * a reading, not about a session.
 *
 * It earns its place three times over. It makes the invariant observable instead
 * of asserted. It gives the run a steady, legible clock that is independent of
 * the assembly beats, which is what actually fixes a narrative that reads as
 * hurried. And it keeps writing for a beat after the plates settle, so the run
 * ends on readers being served rather than on an animation stopping.
 *
 * The payoff is the boundary: two adjacent readings with zero width between them.
 * There is no third tint and no gradient, because there is nothing in between to
 * draw.
 *
 * REFUSAL IS STRUCTURAL
 *
 * No card is ever drawn on top of another card anywhere in this plate — the
 * earlier overlapping-duplicate treatment read as a rendering fault, and the
 * correction is to draw the *structure* that is wrong rather than to depict a
 * clash. A refusing build meets one output path with two claims on it, so that
 * path's row expands in place into one bordered block naming the path once and
 * its two claimants beneath it, and the plate's foot swaps the index and marker
 * rows for the diagnostic. The expansion is height-budgeted to consume exactly
 * the slot it steals, so the plate never reflows.
 *
 * WHAT IS REAL
 *
 * Item names are representative and no inventory count is asserted anywhere; a
 * set's size is a catalog fact, not an illustration fact. The order is the
 * compiler's — items by `localeCompare`, then `registry.json` once the index has
 * been checked against exactly the rendered set, then the output marker over all
 * of it. The refusal is `duplicate-rendered-item`: the authoring schema puts no
 * uniqueness constraint on item names, so two catalog entries can compile to one
 * filename. `renderOutput` throws on it *before* `writeStage` runs, which is why
 * the copy says nothing was staged and nothing was written — a stricter and more
 * accurate statement of the same refusal the concept brief specifies.
 */

/** Brand pulled toward the foreground, for brand-coloured text small enough to have to be read. */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/**
 * De-emphasised ink for text that sits on a plate rather than on the card.
 *
 * `--color-fd-muted-foreground` is calibrated against the page background and
 * measures below 4.5:1 once a tinted plate is under it — 3.85:1 on the sealed
 * marker row in light mode, which is the same defect the closing panel on the
 * home page has. Pulling muted a third of the way toward the foreground restores
 * the ratio in both themes while staying visibly quieter than a label.
 */
const MUTED_INK =
  "color-mix(in oklab, var(--color-fd-muted-foreground) 66%, var(--color-fd-foreground))";

/**
 * Fill for the address tag.
 *
 * Flat `--color-brand` under `--color-brand-foreground` measures 4.03:1 in light
 * mode, and the tag carries 9px text — the smallest type on the plate and the
 * one piece a reader has to be able to read, since the whole move is about which
 * plate is wearing it. Pulling brand toward the foreground darkens it in light
 * mode and lightens it in dark mode, which is the correct direction for the
 * fixed foreground colour in both.
 */
const ADDRESS_BG = "color-mix(in oklab, var(--color-brand) 76%, var(--color-fd-foreground))";

/** The published set. Representative item documents, in the compiler's sort order. */
const LIVE_ITEMS = ["data-table", "empty-state", "page-header", "stat-card"] as const;

/** The set this build renders: the same items, plus one the author added. */
const NEW_ITEMS = [...LIVE_ITEMS, "stats-grid"] as const;

/**
 * Slot budget for the prospective plate, in row heights. Both runs consume all
 * five: the successful one as five documents, the refusing one as one document
 * plus a two-height collision block plus two slots that were never reached.
 */
const SLOTS = NEW_ITEMS.length;

/** Documents, then the index, then the marker. */
const SUCCESS_STEPS = NEW_ITEMS.length + 2;

/** The path two catalog entries both compile to. */
const COLLIDING_PATH = "empty-state";

/**
 * One plate, in pixels rather than in a class, because the container has to be
 * able to animate between holding one plate and holding two and JavaScript owns
 * the orientation. A rem class and an animated pixel height would be two sources
 * of truth for the same box.
 */
// Measured, not estimated: head 20 + body 117 (five rows of ROW_H plus four 3px
// gaps) + foot 47 + 16 of padding + two 6px separations = 212, and the plate is
// given a few pixels of headroom over that so a rounding difference cannot clip
// the last document off the bottom of the set.
const PLATE_H = 220;
const GAP = 8;

/**
 * One row, and the reason it is fixed rather than flexed.
 *
 * The two plates hold different numbers of documents — that is the point of the
 * build — so rows that share out a plate's height come out visibly taller on the
 * shorter set. Two plates whose rows do not match read as two kinds of object,
 * which is the one thing this drawing cannot afford to say. A fixed row height
 * makes them the same object with a different number of rows, and the slack
 * falls harmlessly at the foot of the smaller set.
 */
const ROW_H = 21;

/** Readings of `/r`, and the reading the exchange falls between. */
const TICK_MS = 300;
const READINGS = Array.from({ length: 18 }, (_, index) => `reading-${index}`);

/** Stable identities for the unwritten positions, so a slot is not keyed by where it sits. */
const SLOT_IDS = ["slot-a", "slot-b", "slot-c", "slot-d", "slot-e"] as const;

type Outcome = "succeeds" | "refuses";

type Phase =
  | "open"
  | "rendering"
  | "complete"
  | "exchanging"
  | "published"
  | "colliding"
  | "refused"
  | "discarding"
  | "unchanged";

type Keyframe = { at: number; phase?: Phase; filled?: number };

/**
 * Both runs as data. Six beats rather than eleven, and the longest interval in
 * either timeline is the hold on a complete-but-unpublished set — that pause is
 * where the claim actually lands, because it is the frame in which a reader can
 * see a whole set that does not yet have the address.
 */
const TIMELINES: Record<Outcome, readonly Keyframe[]> = {
  succeeds: [
    { at: 700, phase: "rendering", filled: 1 },
    { at: 870, filled: 2 },
    { at: 1040, filled: 3 },
    { at: 1380, filled: 4 },
    { at: 1550, filled: 5 },
    { at: 1900, filled: 6 },
    { at: 2220, filled: 7 },
    { at: 2400, phase: "complete" },
    { at: 3850, phase: "exchanging" },
    { at: 4600, phase: "published" },
  ],
  refuses: [
    { at: 700, phase: "rendering", filled: 1 },
    { at: 870, filled: 2 },
    { at: 1240, phase: "colliding" },
    { at: 1900, phase: "refused" },
    { at: 3350, phase: "discarding" },
    { at: 4100, phase: "unchanged" },
  ],
};

const EXCHANGE_AT = 3850;

/** The first reading taken after the address moved. */
const BOUNDARY = Math.ceil(EXCHANGE_AT / TICK_MS);

/**
 * The one move, and every resize that participates in it.
 *
 * Deliberately overdamped — damping ratio ≈ 1.2 — because the frame trade is
 * driven by `flexGrow`, and a spring that overshoots hands the layout engine a
 * negative flex factor at exactly the moment the composition consolidates. It
 * also suits the claim: an indivisible act should arrive, not bounce.
 */
const MOVE = { type: "spring", stiffness: 120, damping: 26, mass: 1 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Caption = { lead: string; detail: string };

const CAPTIONS: Record<Phase, Caption> = {
  open: {
    lead: "The replacement is assembled away from the published set.",
    detail: "Nothing about the published set is edited while it is built.",
  },
  rendering: {
    lead: "The replacement is assembled away from the published set.",
    detail: "Documents in name order, then the index, then the marker over both.",
  },
  complete: {
    lead: "The replacement set is whole.",
    detail: "Only a whole set is allowed to take the published address.",
  },
  exchanging: {
    lead: "The address moves, once.",
    detail: "One reading returns the old complete set. The next returns the new one.",
  },
  published: {
    lead: "The published set is the new set.",
    detail: "No reading returned anything in between, because there was nothing in between.",
  },
  colliding: {
    lead: "Two catalog entries compile to one output path.",
    detail: "The set can never be complete, so the build stops on the spot.",
  },
  refused: {
    lead: "Two catalog entries compile to one output path.",
    detail: "The set can never be complete, so the build stops on the spot.",
  },
  discarding: {
    lead: "The incomplete replacement is discarded whole.",
    detail: "Nothing was staged and nothing was written.",
  },
  unchanged: {
    lead: "The published set was never touched.",
    detail: "Every reading returned the same complete set it would have returned anyway.",
  },
};

/**
 * The whole claim in text, for a reader who never sees the plate move. The
 * drawing is `aria-hidden`, because a strip of tick marks announces nothing.
 */
const SUMMARY =
  "Two builds of one registry. A build assembles a complete replacement set away from the " +
  "published set. When it succeeds, the published address moves to the completed set in a single " +
  "act, so one reading of the registry returns the old complete set and the next returns the new " +
  "complete set. When it refuses — here because two catalog entries compile to empty-state.json — " +
  "nothing is staged and nothing is written, and the published set is left exactly as it was. " +
  "Either way the frame holds exactly one published set.";

export function SwapStudyF({ reduceMotion, run }: InteropVariantProps) {
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  /** Presses of this plate's own control. The harness's `run` covers selection and replay. */
  const [presses, setPresses] = useState(0);

  if (reduceMotion) return <StaticBoth />;

  // Strict no-autoplay. A direct arrival — `run` still zero, nothing pressed —
  // mounts the settled still without playing. The harness server-renders a
  // placeholder behind its `clientReady` gate, so this is a client-side arrival
  // guarantee rather than a claim about the shipped HTML.
  const playing = run > 0 || presses > 0;

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
                layoutId="swap-f-outcome-pill"
                className="pointer-events-none absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{value}</span>
          </button>
        ))}
      </div>

      {/*
        Remounting on every run is what makes a run a cut. Selecting the other
        outcome from a settled frame must never spring the exchange backwards —
        that would draw the published set un-replacing itself, a rollback, in the
        one plate that exists to say a rollback never happens. A fresh mount
        cannot animate in reverse because it has no previous frame to leave.
      */}
      <SwapStage key={`${outcome}-${run}-${presses}`} outcome={outcome} playing={playing} />
    </div>
  );
}

function SwapStage({ outcome, playing }: { outcome: Outcome; playing: boolean }) {
  const wide = useWide();
  const settled: Phase = outcome === "succeeds" ? "published" : "unchanged";
  const [phase, setPhase] = useState<Phase>(playing ? "open" : settled);
  const [filled, setFilled] = useState(playing ? 0 : SUCCESS_STEPS);
  const [readings, setReadings] = useState(playing ? 0 : READINGS.length);

  useEffect(() => {
    if (!playing) return;
    const timers = TIMELINES[outcome].map((frame) =>
      setTimeout(() => {
        if (frame.phase !== undefined) setPhase(frame.phase);
        if (frame.filled !== undefined) setFilled(frame.filled);
      }, frame.at),
    );
    const ticker = setInterval(() => {
      setReadings((count) => {
        if (count + 1 >= READINGS.length) clearInterval(ticker);
        return Math.min(count + 1, READINGS.length);
      });
    }, TICK_MS);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearInterval(ticker);
    };
  }, [outcome, playing]);

  const addressed = phase === "exchanging" || phase === "published";
  const gone = phase === "discarding" || phase === "unchanged";
  const refused = phase === "refused" || gone;
  const colliding = phase === "colliding" || refused;

  // The frame holds one published set. During a build it lends half of itself.
  const liveGrow = addressed ? 0 : 1;
  const nextGrow = gone ? 0 : 1;
  const both = liveGrow > 0 && nextGrow > 0;
  // Stacked, the collapsed plate still leaves the row gap behind, so the frame
  // carries it in both states and the surviving plate is a full plate either way.
  // Measured: without this the consolidated narrow plate came out 8px short and
  // its last document sat exactly on the clip.
  const frameHeight = wide ? PLATE_H : both ? PLATE_H * 2 + GAP : PLATE_H + GAP;

  const caption = CAPTIONS[phase];
  const address = (
    <motion.span
      layoutId="swap-f-address"
      transition={MOVE}
      style={{ background: ADDRESS_BG }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[9px] leading-none tracking-[0.06em] text-brand-foreground"
    >
      <span className="size-1 rounded-full bg-brand-foreground/85" aria-hidden="true" />
      published /r
    </motion.span>
  );

  return (
    <>
      <div aria-hidden="true" className="flex min-w-0 flex-col">
        <motion.div
          className={cn("flex min-w-0 gap-2", wide ? "flex-row" : "flex-col")}
          initial={playing ? { height: PLATE_H } : false}
          animate={{ height: frameHeight }}
          transition={MOVE}
        >
          {/* The set that is published. It holds its documents, its index and its
              marker at every frame of both runs; the only thing it ever gives up
              is the address. */}
          <motion.div
            className="min-h-0 min-w-0 overflow-hidden"
            style={{ flexBasis: 0 }}
            initial={false}
            animate={{ flexGrow: liveGrow, opacity: liveGrow > 0 ? 1 : 0 }}
            transition={{ flexGrow: MOVE, opacity: { duration: 0.26, ease: EASE_OUT } }}
          >
            <Plate
              head={addressed ? <PlateLabel>replaced</PlateLabel> : address}
              state={addressed ? "replaced" : "complete"}
              rendered={LIVE_ITEMS}
              slots={LIVE_ITEMS.length}
              sealed
            />
          </motion.div>

          {/* The prospective set. Not a station upstream — the same kind of object
              as the plate beside it, in the same frame, drawn with the same
              component so the two can never drift into looking like different
              things. */}
          <motion.div
            // The receiving plate stops clipping exactly when the address starts
            // travelling toward it. The tag lives in this plate's subtree for the
            // whole move and is only drawn over the other one by a transform, so
            // a clipped wrapper cuts it in half in mid-flight — which reads as a
            // rendering fault in the one frame that carries the claim.
            className={cn("min-h-0 min-w-0", addressed ? "overflow-visible" : "overflow-hidden")}
            style={{ flexBasis: 0 }}
            initial={playing ? { flexGrow: 0, opacity: 0 } : false}
            animate={{ flexGrow: nextGrow, opacity: nextGrow > 0 ? 1 : 0 }}
            transition={{ flexGrow: MOVE, opacity: { duration: 0.26, ease: EASE_OUT } }}
          >
            <Plate
              head={addressed ? address : <PlateLabel>prospective set</PlateLabel>}
              state={stateWord(phase)}
              rendered={
                outcome === "succeeds"
                  ? NEW_ITEMS.slice(0, Math.min(filled, NEW_ITEMS.length))
                  : LIVE_ITEMS.slice(0, colliding ? 1 : Math.min(filled, 2))
              }
              slots={SLOTS}
              provisional={!addressed}
              sealed={addressed}
              indexWritten={filled >= SUCCESS_STEPS - 1}
              markerWritten={filled >= SUCCESS_STEPS}
              collision={colliding ? COLLIDING_PATH : null}
              refused={refused}
              animateRows={playing}
            />
          </motion.div>
        </motion.div>

        <Record
          shown={readings}
          boundary={outcome === "succeeds" ? BOUNDARY : null}
          revealed={addressed}
          settled={phase === "unchanged"}
          animateTicks={playing}
        />
      </div>

      <div className="mt-auto pt-4">
        {/*
          Reserved per band, from measurement rather than from one desktop
          reading. The caption is the only element in the plate whose height is
          set by wrapping, so an unreserved one moves the card underneath the
          illustration mid-run without the frame having changed at all. Measured
          tallest lead+detail pair: 71px below 640 (231px card at 320), 36px from
          640 to 1023 where the card is full width, and 53px from 1024 where the
          two-column grid narrows it again — which is why this is not monotonic
          and why a single value cannot cover it.
        */}
        <p className="min-h-[4.5rem] text-[13px] leading-snug text-fd-foreground sm:min-h-[2.75rem] lg:min-h-[3.5rem]">
          {caption.lead}
          <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">
            {caption.detail}
          </span>
        </p>
      </div>

      {/* Announced at rest, rather than on every frame of a run. */}
      <p className="sr-only" role="status">
        {phase === "published"
          ? "Build succeeded. The published address moved to the completed replacement set in one act."
          : phase === "unchanged"
            ? "Build refused. Two catalog entries compiled to empty-state.json, nothing was staged or written, and the published set is unchanged."
            : ""}
      </p>
      <p className="sr-only">{SUMMARY}</p>
    </>
  );
}

function stateWord(phase: Phase): string {
  if (phase === "open" || phase === "rendering") return "rendering";
  // Deliberately the same word the published plate carries. During the hold both
  // plates read "complete" and only one of them has the address, which is the
  // sentence the plate is trying to say.
  if (phase === "complete" || phase === "exchanging" || phase === "published") return "complete";
  return "refused";
}

/**
 * Orientation is read once and then owned by JavaScript.
 *
 * The frame animates between holding one plate and holding two, and in a column
 * that is a height change while in a row it is not. A Tailwind breakpoint and an
 * animated pixel height would disagree with each other on the way through; this
 * keeps one source of truth. The harness only mounts a variant after its own
 * client gate, so `matchMedia` in the initializer cannot mismatch a server
 * render.
 */
function useWide() {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 640px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}

function PlateLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="truncate font-mono text-[9px] tracking-[0.14em] uppercase"
      style={{ color: MUTED_INK }}
    >
      {children}
    </span>
  );
}

/**
 * One set, at one moment. The published plate and the prospective plate are the
 * same component with different props, because they are the same kind of thing —
 * which is the whole argument.
 */
function Plate({
  head,
  state,
  rendered,
  slots,
  sealed = false,
  provisional = false,
  indexWritten = false,
  markerWritten = false,
  collision = null,
  refused = false,
  animateRows = false,
}: {
  head: React.ReactNode;
  state: string;
  /** Documents that exist at this moment. */
  rendered: readonly string[];
  /** Total row heights the body budgets for. */
  slots: number;
  /** A published set arrives whole and never animates in. */
  sealed?: boolean;
  /** Not yet real: outlined rather than filled. */
  provisional?: boolean;
  indexWritten?: boolean;
  markerWritten?: boolean;
  collision?: string | null;
  refused?: boolean;
  animateRows?: boolean;
}) {
  // The collision block stands two rows tall and pays for itself out of the slot
  // budget, so a refusal never reflows the plate it happens in.
  const used = rendered.length + (collision ? 2 : 0);
  const empty = Math.max(0, slots - used);

  return (
    <div
      className={cn(
        // A container rather than a breakpoint: a plate's width here is set by
        // how much of the frame it currently holds, not by the viewport, so the
        // foot notes have to answer to the plate. Keyed to the viewport they
        // stayed on at half width and truncated the filename beside them, which
        // put the label second to its own annotation.
        "@container flex h-full w-full min-w-0 flex-col rounded-xl border p-2 transition-colors duration-300",
        provisional
          ? "border-dashed border-fd-border bg-fd-background/70"
          : "border-solid bg-fd-secondary",
        sealed && !provisional && "border-brand/35",
      )}
    >
      <div className="flex h-5 shrink-0 items-center justify-between gap-2">
        {head}
        <span
          className="min-w-0 truncate font-mono text-[9px] tracking-[0.1em] uppercase"
          style={{
            color: sealed ? BRAND_INK : "var(--color-fd-secondary-foreground)",
          }}
        >
          {state}
        </span>
      </div>

      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-[3px] overflow-hidden">
        {rendered.map((name) => (
          <Row
            key={name}
            label={`${name}.json`}
            raised={provisional}
            animate={animateRows && !sealed}
          />
        ))}
        {collision ? <Collision path={collision} animate={animateRows} /> : null}
        {SLOT_IDS.slice(0, empty).map((id) => (
          <span
            key={id}
            style={{ height: ROW_H }}
            className="shrink-0 rounded-md border border-dashed border-fd-border"
          />
        ))}
      </div>

      <div className="mt-1.5 flex shrink-0 flex-col gap-[3px]">
        {refused ? (
          <Refusal />
        ) : (
          <>
            <Row
              label="registry.json"
              note="the index, exactly this set"
              tone={sealed || indexWritten ? "written" : "empty"}
              raised={provisional}
              animate={animateRows && !sealed}
              fixed
            />
            <Row
              label=".manteen-kit-output.json"
              note="every emitted path, hashed"
              tone={sealed || markerWritten ? "sealed" : "empty"}
              raised={provisional}
              animate={animateRows && !sealed}
              fixed
            />
          </>
        )}
      </div>
    </div>
  );
}

/** One document, or one of the two rows the plate's foot always holds. */
function Row({
  label,
  note,
  tone = "written",
  raised = false,
  animate = false,
  fixed = false,
}: {
  label: string;
  note?: string;
  tone?: "written" | "empty" | "sealed";
  /** Sitting on the darker prospective fill, so the row lifts instead of insetting. */
  raised?: boolean;
  animate?: boolean;
  /** A foot row sizes to its own content; a body row takes one slot of the set. */
  fixed?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full min-w-0 items-center justify-between gap-2 rounded-md border px-1.5 font-mono text-[9px] leading-none sm:text-[10px]",
        fixed ? "py-[5px]" : "py-1",
        tone === "empty" && "border-dashed border-fd-border text-fd-muted-foreground",
        tone === "written" && "border-fd-border text-fd-secondary-foreground",
        tone === "written" && (raised ? "bg-fd-secondary" : "bg-fd-background/60"),
        tone === "sealed" && "border-brand/40 bg-brand/[0.08]",
      )}
      style={tone === "sealed" ? { color: BRAND_INK } : undefined}
    >
      <span className="truncate">{label}</span>
      {note && tone !== "empty" ? (
        <span className="hidden shrink-0 @[19rem]:inline" style={{ color: MUTED_INK }}>
          {note}
        </span>
      ) : null}
    </div>
  );

  const wrapper = "min-h-0 shrink-0";
  const size = fixed ? undefined : { height: ROW_H };
  if (!animate || tone === "empty")
    return (
      <div className={wrapper} style={size}>
        {body}
      </div>
    );

  return (
    // Rendered at a position, so it arrives with a short settle rather than
    // materialising in place.
    <motion.div
      className={wrapper}
      style={size}
      initial={{ opacity: 0, transform: "translate3d(0,3px,0)" }}
      animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {body}
    </motion.div>
  );
}

/**
 * One output path with two claims on it.
 *
 * Drawn as a structure rather than as a clash: the path is named once, and the
 * two catalog entries that both want it are listed beneath it. Nothing is
 * stacked on top of anything, which is the defect this replaces — an overlap
 * reads as a rendering fault, and a reader cannot tell a deliberate one from a
 * broken one.
 */
function Collision({ path, animate }: { path: string; animate: boolean }) {
  return (
    <motion.div
      // Exactly the two row heights it takes away from the set, so a refusal
      // never reflows the plate it happens in.
      style={{ height: ROW_H * 2 + 3 }}
      className="flex shrink-0 flex-col justify-center rounded-md border-2 border-fd-foreground/60 bg-fd-foreground/[0.06] px-1.5 py-1"
      initial={animate ? { opacity: 0, transform: "translate3d(0,3px,0)" } : false}
      animate={{ opacity: 1, transform: "translate3d(0,0,0)" }}
      transition={{ duration: 0.26, ease: EASE_OUT }}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[9px] leading-none text-fd-foreground sm:text-[10px]">
          {path}.json
        </span>
        <span className="shrink-0 font-mono text-[8px] tracking-[0.08em] text-fd-foreground uppercase">
          2 claims · 1 path
        </span>
      </div>
      {/* Measured: header 12 + 4 + these two lines fills the block's 41px content
          box exactly at 1.5. Tightened so the budget has slack rather than none —
          text crossing this border is the exact failure this block replaces. */}
      <div className="mt-1 flex flex-col gap-px pl-1 font-mono text-[8px] leading-[1.35] text-fd-foreground">
        <span className="truncate">├ catalog item {path}</span>
        <span className="truncate">└ catalog item {path}</span>
      </div>
    </motion.div>
  );
}

/** The plate's foot when the build refused: the two rows that were never written. */
function Refusal() {
  return (
    <div className="rounded-md border-2 border-fd-foreground/60 bg-fd-foreground/[0.06] px-1.5 py-[5px]">
      {/* The diagnostic code is the fact; it drops a step at 320px rather than
          truncating, because half a code names nothing. */}
      <p className="truncate font-mono text-[8px] leading-none tracking-[0.08em] text-fd-foreground uppercase sm:text-[9px]">
        refused · duplicate-rendered-item
      </p>
      <p className="mt-1 truncate font-mono text-[8px] leading-none text-fd-foreground">
        nothing staged, nothing written
      </p>
    </div>
  );
}

/**
 * Readings of `/r`.
 *
 * The axis is readings, not milliseconds. Every tick is the same height because
 * every reading returned a complete set; the only thing a tick encodes is which
 * complete set that was. There is no third tint, no gradient and no gap at the
 * boundary — two adjacent readings with nothing between them is what the
 * guarantee looks like when it is drawn honestly.
 */
function Record({
  shown,
  boundary,
  revealed,
  settled,
  animateTicks,
}: {
  shown: number;
  /** Index of the first reading taken after the address moved, or null. */
  boundary: number | null;
  revealed: boolean;
  settled: boolean;
  animateTicks: boolean;
}) {
  return (
    <div className="mt-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 px-0.5 font-mono text-[8px] tracking-[0.1em] text-fd-muted-foreground uppercase sm:text-[9px]">
        <span className="truncate">each reading of /r</span>
        <span className="shrink-0">one complete set</span>
      </div>
      <div className="mt-1.5 flex h-6 items-stretch gap-[3px]">
        {READINGS.map((id, index) => {
          if (index >= shown) {
            return <span key={id} className="flex-1" />;
          }
          const isNew = boundary !== null && index >= boundary;
          const tick = (
            <span
              className={cn(
                "block h-full w-full rounded-[2px]",
                isNew ? "bg-brand" : "bg-fd-foreground/25",
              )}
            />
          );
          if (!animateTicks) {
            return (
              <span key={id} className="flex-1">
                {tick}
              </span>
            );
          }
          return (
            <motion.span
              key={id}
              className="flex-1 origin-bottom"
              initial={{ opacity: 0, transform: "scaleY(0.3)" }}
              animate={{ opacity: 1, transform: "scaleY(1)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              {tick}
            </motion.span>
          );
        })}
      </div>
      <div className="relative mt-1 flex h-4 gap-[3px]">
        {boundary === null ? (
          <span className="flex-1 text-center font-mono text-[8px] leading-none tracking-[0.08em] text-fd-muted-foreground uppercase">
            {settled ? "the same complete set throughout" : ""}
          </span>
        ) : (
          READINGS.map((id, index) => (
            <span key={id} className="relative flex-1">
              {index === boundary && revealed ? (
                <span className="absolute top-0 -left-[2px] flex -translate-x-1/2 flex-col items-center">
                  <span className="h-1.5 w-px" style={{ background: BRAND_INK }} />
                  <span
                    className="mt-[2px] font-mono text-[8px] leading-none tracking-[0.08em] whitespace-nowrap uppercase"
                    style={{ color: BRAND_INK }}
                  >
                    one move
                  </span>
                </span>
              ) : null}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Reduced motion: both answers at once, at their end states, with no playback to
 * choose between them — so the two-position control is not rendered here, since
 * there is nothing left for it to reveal. No positional entrance and no
 * crossfade either; a truthful still has to be built out of elements that never
 * animate rather than out of motion values set to nil.
 */
function StaticBoth() {
  return (
    <div className="flex min-h-[26rem] w-full min-w-0 flex-col justify-center gap-6">
      <StaticOutcome
        heading="Succeeds"
        state="complete"
        items={NEW_ITEMS}
        boundary={BOUNDARY}
        lead="The published address moved to the completed set, once."
        detail="One reading of the registry returned the old complete set and the next returned the new one. There was nothing in between."
      />
      <StaticOutcome
        heading="Refuses"
        state="unchanged"
        items={LIVE_ITEMS}
        boundary={null}
        lead="Two catalog entries compiled to one output path."
        detail="Nothing was staged and nothing was written, and every reading returned the same complete set it would have returned anyway."
      />
    </div>
  );
}

function StaticOutcome({
  heading,
  state,
  items,
  boundary,
  lead,
  detail,
}: {
  heading: string;
  state: string;
  items: readonly string[];
  boundary: number | null;
  lead: string;
  detail: string;
}) {
  return (
    <section className="min-w-0">
      <p className="mb-1.5 px-0.5 font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
        {heading}
      </p>
      <div aria-hidden="true" style={{ height: PLATE_H }}>
        <Plate
          head={
            <span
              style={{ background: ADDRESS_BG }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[9px] leading-none tracking-[0.06em] text-brand-foreground"
            >
              <span className="size-1 rounded-full bg-brand-foreground/85" aria-hidden="true" />
              published /r
            </span>
          }
          state={state}
          rendered={items}
          slots={items.length}
          sealed
        />
      </div>
      <div aria-hidden="true">
        <Record
          shown={READINGS.length}
          boundary={boundary}
          revealed={boundary !== null}
          settled
          animateTicks={false}
        />
      </div>
      <p className="px-0.5 pt-3 text-[13px] leading-snug text-fd-foreground">
        {lead}
        <span className="mt-0.5 block text-[12px] text-fd-muted-foreground">{detail}</span>
      </p>
    </section>
  );
}
