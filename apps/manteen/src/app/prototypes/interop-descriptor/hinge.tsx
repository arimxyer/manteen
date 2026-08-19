"use client";

import type { Variants } from "motion/react";
import { MotionConfig, motion, useAnimationControls } from "motion/react";
import { useCallback, useId, useLayoutEffect, useState } from "react";
import type { InteropVariantProps } from "./types";

/**
 * Hinge — enrichment fails in two directions, on purpose.
 *
 * The subject of this plate is THE DOCUMENT the client fetched, not the project
 * it is being installed into. That distinction is the whole reason this concept
 * and Phase can coexist: Phase reads a version off the consumer's disk and
 * branches on what it finds there; this reads `meta.mantine` off the wire item
 * and branches on what it can parse. Neither draws the other's picture — Phase
 * owns a gate seam with a verdict column, and there is deliberately no column
 * anywhere below.
 *
 * Everything on the plate is transcribed from the implementation rather than
 * invented:
 *
 *   packages/cli/src/plan/validate-item.ts  `readMeta` splits ajv's errors by
 *     `instancePath`, so `/requires` blocks and `/stylesApi/<Component>` only
 *     degrades. Per-key granularity is the mechanism, not a convention.
 *   packages/cli/src/schema/manteen-item-meta.schema.json
 *     `requires`   -> string, minLength 1
 *     `stylesApi`  -> object whose values are arrays of strings
 *     the object itself is `additionalProperties: true`
 *   packages/cli/src/gates/styles-api.ts  emits one `styles-api` INFO
 *     diagnostic per item, `Component: sel, sel` with selectors in declaration
 *     order. That report is exactly what is lost when the field drops.
 *   docs/contracts/client-build-plan.md  the refusal table grades both codes:
 *     `meta-invalid-requires`  error, NOT forceable, exit 1
 *     `meta-degraded`          warn, exit 0
 *
 * The one thing this plate refuses to draw is a mark that travels and is then
 * stopped. `meta-invalid-requires` is non-forceable, so the gate aggregator sets
 * `plan.ok` false and `apply()` returns BEFORE phase 2 — no write is attempted,
 * not a write that fails. So the write rule in the held lane never extends at
 * all. A stopped mark would teach a partial attempt that does not exist.
 */

/**
 * The controls object `useAnimationControls` hands back. motion 13 does not
 * export its name, so it is recovered from the hook rather than re-declared —
 * a hand-written shape here would drift the moment the library's did.
 */
type LaneControls = ReturnType<typeof useAnimationControls>;

/* -------------------------------------------------------------------------- */
/* The invariant                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Canonical id, files and dependencies — drawn ONCE, above both lanes.
 *
 * That placement is the argument. The brief's invariant is that the files, the
 * dependencies and the destinations are identical in both outcomes; drawing them
 * once makes that a property of the picture instead of a claim the picture makes
 * about itself. Two copies could disagree. One cannot.
 */
const ITEM_ID = "@acme/release-panel";
const CORE = [
  { key: "files", value: "@ui/release-panel.tsx" },
  { key: "dependencies", value: "@mantine/core@^9" },
] as const;

/**
 * The four keys this client's meta schema names, plus one it does not.
 *
 * `cssLayer` is deliberately fictional and labelled as such. The fact being
 * drawn is *that the client has never heard of it* — `meta.mantine` is
 * `additionalProperties: true`, so an unknown key is ignored rather than
 * refused, and a newer manteen-kit therefore cannot break an older manteen. Any
 * real key would defeat the drawing by being recognisable. The brief expected
 * this clause to end up in the caption; it is drawn here and captioned as well,
 * because it is the one fact on the plate that is true in BOTH directions and
 * that is easiest to state next to the keys it sits beside.
 */
const META_KEYS = [
  { name: "requires", known: true },
  { name: "provider", known: true },
  { name: "stylesApi", known: true },
  { name: "themeFragment", known: true },
  { name: "cssLayer", known: false },
] as const;

/* -------------------------------------------------------------------------- */
/* The two directions                                                          */
/* -------------------------------------------------------------------------- */

type FieldId = "stylesApi" | "requires";
type Mode = "drop" | "hold";

interface Lane {
  id: FieldId;
  mode: Mode;
  /** The control names the FIELD, never the failure. */
  control: string;
  /** What arrived on the wire, malformed in the smallest way the schema catches. */
  literal: string;
  /** ajv's own pointer, which is what `readMeta` buckets on. */
  pointer: string;
  code: string;
  grade: string;
  /** The consequence, in the client's terms. Never a count of what did not happen. */
  outcome: string;
  /** The single concrete thing this direction costs or protects. */
  detail: string;
}

const LANES: readonly [Lane, Lane] = [
  {
    id: "stylesApi",
    mode: "drop",
    control: '"stylesApi" unreadable',
    // Schema-legal shape, illegal value: `stylesApi` accepts an object whose
    // values are arrays of strings, so a bare string is one ajv error at
    // `/stylesApi/ReleasePanel` — bucketed under `stylesApi`, not the root, which
    // is why only this field goes.
    literal: '"stylesApi": { "ReleasePanel": "root, title" }',
    pointer: "/stylesApi/ReleasePanel must be array",
    code: "meta-degraded",
    grade: "warn · exit 0",
    outcome: "installed without it",
    detail: "styles-api report never prints — ReleasePanel: root, title, body, action",
  },
  {
    id: "requires",
    mode: "hold",
    // The brief's own example, and it is the sharp one: this document passes the
    // kit's wire validator untouched, because the interchange schema declares
    // `meta` as `additionalProperties: true`. Nothing upstream can catch it,
    // which is precisely why the client ships a second schema.
    control: '"requires" unreadable',
    literal: '"requires": 12345',
    pointer: "/requires must be string",
    code: "meta-invalid-requires",
    grade: "error · exit 1 · not forceable",
    outcome: "nothing written",
    detail: "the version gate had nothing to check, so it kept a v9-only item off a v8 project",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Track height, leaf length and pivot inset are one system, because a rotated
 * element's BOUNDING BOX is what escapes a container — not the element's own
 * height. Both extremes are measured against `TRACK_H / 2` rather than nudged:
 *
 *   raised   -90deg  ->  LEAF_LEN            = 20px   up   (< 24px)
 *   dropped  +68deg  ->  20·sin68 + 7·cos68  ≈ 21.2px down (< 24px)
 *
 * Nothing here is clipped, and nothing may be: the plate carries no
 * `overflow-hidden`, so a geometry mistake shows as an overflow that can be
 * measured rather than as a silently amputated leaf. The retrospective records
 * exactly that failure on a neighbouring study.
 */
const TRACK_H = "3rem";
const LEAF_LEN = "1.25rem";
const LEAF_THICK = "0.4375rem";
const PIVOT_X = "1.75rem";
const DROP_ANGLE = 68;
const HOLD_ANGLE = -90;

/**
 * Brand pulled toward the foreground for text that has to be READ.
 *
 * Same measurement as the neighbouring studies: plain `text-brand` over a card
 * is under AA at these sizes in light mode, and the words carrying it here are
 * diagnostic codes. The mix moves toward whichever pole is high-contrast in the
 * active theme, so one value serves both rather than trading one for the other.
 */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";

/* -------------------------------------------------------------------------- */
/* Choreography                                                                */
/* -------------------------------------------------------------------------- */

/** motion's own `BezierDefinition`, spelled locally so the factory below can
 *  take an easing as a parameter without widening it to `number[]` — which the
 *  transition type rejects. */
type Bezier = readonly [number, number, number, number];

const EASE_OUT: Bezier = [0.23, 1, 0.32, 1];
/** Slow to break, decisive to finish. A lever is not a spring. */
const EASE_LEVER: Bezier = [0.36, 0, 0.12, 1];
/**
 * The same lever, landing against a stop: the curve passes its target and
 * returns, so the raised guard arrives with weight.
 *
 * This is an EASING and not a keyframe list, and that is not a style choice —
 * see `laneMotion`. A `resolved` variant containing an array resolves to its
 * FIRST entry when a component takes it as `initial`, which silently turns the
 * settled state into the start of the animation.
 */
const EASE_LAND: Bezier = [0.34, 1.5, 0.64, 1];

/**
 * One factory, both directions, and reduced motion folded in at the source.
 *
 * Reduced motion is handled HERE rather than by `MotionConfig` alone, because
 * `reducedMotion="always"` deliberately leaves opacity untouched — a plate that
 * relied on it would still crossfade.
 *
 * EVERY `resolved` target below is a scalar, and that is a hard rule rather than
 * a preference. `resolved` is what an unplayed lane takes as its `initial`, and
 * motion resolves a keyframe ARRAY to its first entry — so an array here does
 * not describe the settled state, it describes the start of the animation, and
 * the lane silently plays on arrival. Measured: an overshoot written as
 * `rotate: [0, -94, -90]` left the held lane rotating up from flat on a direct
 * URL, which is precisely the autoplay this plate must not have. Overshoot is
 * expressed as `EASE_LAND` instead, and the pulse below as a scalar that starts
 * lit and goes out.
 */
function laneMotion(mode: Mode, reduceMotion: boolean) {
  const at = (delay: number, duration: number, ease: Bezier = EASE_OUT) =>
    reduceMotion ? { duration: 0 } : { delay, duration, ease };

  /**
   * The client reading the field. A ring rather than a colour change: the read
   * is an event with an end, and a colour that stayed would imply the field is
   * still being looked at while the rest of the run continues.
   *
   * It is lit in `pending` and out in `resolved` — the direction that makes the
   * settled value a plain zero. A lane that never plays therefore shows no ring
   * at all, and a lane that is settled by an interruption puts it out rather
   * than flashing it.
   */
  const read: Variants = {
    pending: { opacity: 1, transition: { duration: 0 } },
    resolved: { opacity: 0, transition: at(0.3, 0.24) },
  };

  /**
   * The leaf. One element, one pivot, and the ROTATION SIGN is the entire
   * semantic difference between the two outcomes — away from the path, or across
   * it. Everything else on the plate is a consequence of this one number.
   */
  const leaf: Variants = {
    pending: { rotate: 0, opacity: 1, transition: { duration: 0 } },
    resolved:
      mode === "drop"
        ? { rotate: DROP_ANGLE, opacity: 0.42, transition: at(0.24, 0.46, EASE_LEVER) }
        : // The raised guard passes its stop and returns. Same resting value as
          // a reduced-motion snap, because the overshoot lives in the curve.
          { rotate: HOLD_ANGLE, opacity: 1, transition: at(0.24, 0.52, EASE_LAND) },
  };

  /** Where the leaf used to lie. Drop only: the field was dropped, and the
   *  outline is the plate saying so without a strike-through or a cross. */
  const ghost: Variants = {
    pending: { opacity: 0, transition: { duration: 0 } },
    resolved: { opacity: mode === "drop" ? 1 : 0, transition: at(0.5, 0.26) },
  };

  /** The raised leaf's shoulder — a soft brand halo, so the barrier reads as a
   *  guard holding rather than as an object breaking. Hold only. */
  const shoulder: Variants = {
    pending: { opacity: 0, transition: { duration: 0 } },
    resolved: { opacity: mode === "hold" ? 1 : 0, transition: at(0.6, 0.3) },
  };

  /**
   * The write. It extends from the hinge to the destination in the drop lane and
   * it does not exist in the held lane — see the module header. The dashed base
   * rail underneath is drawn in both, unchanged, because the destination is part
   * of the invariant: the path is identical, only the writing differs.
   */
  const write: Variants = {
    pending: { scaleX: 0, transition: { duration: 0 } },
    resolved: { scaleX: mode === "drop" ? 1 : 0, transition: at(0.86, 0.46) },
  };

  /** Held: two short brackets against the raised leaf. Hold only. */
  const holdMark: Variants = {
    pending: { opacity: 0, transition: { duration: 0 } },
    resolved: { opacity: mode === "hold" ? 1 : 0, transition: at(0.9, 0.26) },
  };

  /** Destination slots. Both lanes draw both slots at the same positions with the
   *  same labels; only the fill differs. */
  const slot = (index: number): Variants => ({
    pending: { opacity: 0, scale: 0.55, transition: { duration: 0 } },
    resolved:
      mode === "drop"
        ? { opacity: 1, scale: 1, transition: at(1.06 + index * 0.12, 0.24) }
        : { opacity: 0, scale: 0.55, transition: { duration: 0 } },
  });

  const verdict: Variants = {
    pending: { opacity: 0, y: reduceMotion ? 0 : 5, transition: { duration: 0 } },
    resolved: { opacity: 1, y: 0, transition: at(1.34, 0.3) },
  };

  return { read, leaf, ghost, shoulder, write, holdMark, slot, verdict };
}

/* -------------------------------------------------------------------------- */

export function HingeVariant({ reduceMotion, run }: InteropVariantProps) {
  const [field, setField] = useState<FieldId>(LANES[0].id);
  /** Bumped on every activation, including reselection, which is what makes
   *  pressing the already-selected field a replay rather than a no-op. */
  const [reselect, setReselect] = useState(0);
  const dropControls = useAnimationControls();
  const holdControls = useAnimationControls();
  const groupName = useId();

  /**
   * The single thing that decides whether anything moves, and it is DERIVED
   * rather than remembered.
   *
   * `run` arrives at zero on a direct URL and is incremented only by an explicit
   * picker selection or harness replay; `reselect` is this plate's own field
   * control. Either being non-zero means a reader asked for this, and nothing
   * else does — so arrival is never a play command.
   *
   * The obvious alternative, comparing this render's inputs against the previous
   * effect's, is wrong here and measurably so: React's development StrictMode
   * runs an effect, tears it down, and runs it AGAIN with identical inputs.
   * History-based logic reads that second pass as "nothing changed" and snaps the
   * lane to its settled state a frame after starting it, so the plate looks
   * exactly like a plate that refuses to animate. Measured: 182 recorded frames
   * across a picker selection, one distinct state. A derived rule is idempotent,
   * so the second pass simply restarts the same run.
   *
   * A NUMBER rather than a boolean, and that is the second measured lesson. Both
   * counters only ever climb, so their sum is the identity of the ask — and the
   * effect below has to re-run on a repeat ask that changes nothing else.
   * Reselecting the already-checked field changes neither `field` nor a boolean
   * that is already true, so a boolean here stops reselection replaying while
   * every other interaction keeps working. Measured that way once, at one
   * distinct frame state across a reselection that should have swept 33.
   */
  const cue = reduceMotion ? 0 : run + reselect;

  /**
   * Layout effect, not effect: on a replay the selected lane is `set` back to
   * `pending` before it plays, and doing that after paint shows one frame of the
   * settled plate first. The harness only mounts a variant once `clientReady` is
   * true, so this component never renders on the server and the layout effect has
   * nothing to warn about.
   *
   * `reduceMotion` is a dependency because it can change WHILE a run is playing —
   * the harness subscribes to the media query and passes the resolved value down,
   * so a leaf caught mid-rotation must be settled rather than left there.
   */
  useLayoutEffect(() => {
    const selected = field === "stylesApi" ? dropControls : holdControls;
    const other = field === "stylesApi" ? holdControls : dropControls;

    if (reduceMotion) {
      selected.set("resolved");
      other.set("resolved");
      return;
    }

    // The unselected lane is ANIMATED to its settled state rather than snapped
    // there. It is normally already settled, so this costs nothing — but if it
    // was mid-run when the reader switched, it resolves from its current values
    // instead of cutting. That is the interruption behaviour, and it is one line.
    void other.start("resolved");

    // Arrival is not a play command. A direct URL mounts at `run === 0` with no
    // reselection behind it and gets the complete two-lane composition with
    // nothing running.
    if (cue === 0) {
      selected.set("resolved");
      return;
    }

    selected.set("pending");
    void selected.start("resolved");
  }, [cue, field, reduceMotion, dropControls, holdControls]);

  const activate = useCallback((next: FieldId) => {
    setField(next);
    setReselect((value) => value + 1);
  }, []);

  return (
    // The harness resolves the media query before mounting and passes the result
    // explicitly, so the captured baseline is deterministic. `always` is belt to
    // the factory's braces — it suppresses transforms; the factory is what
    // suppresses the fades `always` leaves alone.
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      <section className="relative flex min-w-0 flex-col">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
              Enrichment hinge / interop
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">One hinge. Two directions.</h2>
          </div>
          <p className="shrink-0 text-right font-mono text-[9px] leading-tight tracking-[0.1em] uppercase">
            <span className="block text-fd-muted-foreground">read off the document</span>
            <span className="mt-0.5 block text-brand">meta.mantine</span>
          </p>
        </header>

        {/* The control names the FIELD. Naming the failure instead would make the
            plate a picker of two errors; naming the field makes it a picker of
            two things that protect different amounts, which is the claim.

            Real radios, and the reason is not only that they are the semantic
            element. The harness listens for bare ArrowLeft/ArrowRight on
            `document` to move between prototypes and bails only when the event
            target is an INPUT — so a native radio group keeps its own arrow keys
            without this file reaching for `stopImmediatePropagation` against a
            listener it does not own.

            Both handlers are wired on purpose. `change` does not fire when the
            already-checked radio is clicked, and reselection has to replay; the
            browser dispatches `click` and `change` for one interaction inside a
            single task, so React batches them into one render and the lane
            replays once rather than twice. */}
        <fieldset className="mt-4 min-w-0 border-0 p-0">
          <legend className="sr-only">Which enrichment field the client cannot read</legend>
          <div className="flex flex-wrap gap-1.5">
            {LANES.map((lane) => (
              <label key={lane.id} className="cursor-pointer">
                <input
                  type="radio"
                  name={groupName}
                  className="peer sr-only"
                  checked={lane.id === field}
                  onChange={() => activate(lane.id)}
                  onClick={() => activate(lane.id)}
                />
                <span className="block rounded-full border border-fd-border px-3 py-1.5 font-mono text-[10px] text-fd-foreground/70 transition-colors duration-150 ease-[var(--ease-out)] [font-variant-ligatures:none] peer-checked:border-brand/60 peer-checked:bg-brand/10 peer-checked:text-fd-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-fd-card motion-reduce:transition-none">
                  {lane.control}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ---------------------------------------------------------------- */}
        {/* The invariant, drawn once                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-4 rounded-xl border bg-fd-secondary px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <code className="min-w-0 font-mono text-[11px] break-all text-fd-foreground">
              {ITEM_ID}
            </code>
            <span className="font-mono text-[8px] tracking-[0.14em] text-fd-foreground/70 uppercase">
              one document · both directions
            </span>
          </div>

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {CORE.map((entry) => (
              <div key={entry.key} className="contents">
                <dt className="font-mono text-[9px] text-fd-foreground/70">{entry.key}</dt>
                <dd className="min-w-0 font-mono text-[9px] break-all text-fd-foreground [font-variant-ligatures:none]">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t pt-2.5">
            <span className="mr-1 font-mono text-[8px] tracking-[0.14em] text-fd-foreground/70 uppercase">
              meta.mantine
            </span>
            {META_KEYS.map((key) => (
              <code
                key={key.name}
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${
                  key.known
                    ? "border border-fd-border bg-fd-background/60 text-fd-foreground"
                    : "border border-dashed border-fd-foreground/35 text-fd-foreground/70"
                }`}
              >
                {key.name}
              </code>
            ))}
            {/* Drawn, then said. The dashed key above is the picture; this line is
                the only place the reader learns that the dash means "the schema
                does not name it", which no outline can carry on its own. */}
            <span className="basis-full font-mono text-[8px] leading-tight text-fd-foreground/70">
              dashed: a key this client&apos;s schema does not name — ignored in both directions
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          {LANES.map((lane) => (
            <LaneRow
              key={lane.id}
              lane={lane}
              reduceMotion={reduceMotion}
              controls={lane.mode === "drop" ? dropControls : holdControls}
              selected={lane.id === field}
              plays={cue > 0}
            />
          ))}
        </div>

        <p className="mt-4 border-t pt-3 text-sm text-fd-muted-foreground">
          The affordance can fall away because losing it costs a report. The gate cannot, because
          losing it costs the check — so it holds the install and writes nothing. Same files, same
          dependencies, same destinations either way.
        </p>

        <p className="sr-only">
          One registry item, {ITEM_ID}, with the same interchange core in both directions: one file
          at at-ui slash release-panel dot tsx and one dependency, at-mantine slash core caret 9.
          Above the two directions, the meta dot mantine block lists the four keys this
          client&apos;s schema names — requires, provider, stylesApi and themeFragment — and one key
          it does not name, which is ignored rather than refused in both directions, so a newer
          manteen-kit does not break an older manteen. In the first direction the stylesApi field
          arrives unreadable. The hinged leaf rotates down and away from the write path, a dashed
          outline marks where it was, the write then runs and both destinations are filled. The
          diagnostic is meta-degraded, a warning at exit code 0: the item installs without that
          field, and the Styles API report that would have listed ReleasePanel root, title, body and
          action is never printed. In the second direction the requires field arrives unreadable.
          The same leaf rotates the other way, up and across the write path, and stands there as a
          barrier. No write is attempted at all — the diagnostic is meta-invalid-requires, an error
          at exit code 1 that cannot be forced, and the destinations stay unwritten in their
          original positions. The version gate had nothing to check, so it kept a version-9-only
          item off a version-8 project. One mechanism, one pivot, and the direction of rotation is
          chosen by what the field protects.
        </p>
      </section>
    </MotionConfig>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One direction.
 *
 * Both lanes carry the same weight on purpose. The held lane is not dimmed, not
 * struck through, and never labelled with a count of what did not happen — its
 * core is intact and untouched, and "nothing written" is the protection rather
 * than the damage. Dimming it would say the opposite of what the plate is for.
 */
function LaneRow({
  lane,
  reduceMotion,
  controls,
  selected,
  plays,
}: {
  lane: Lane;
  reduceMotion: boolean;
  controls: LaneControls;
  selected: boolean;
  plays: boolean;
}) {
  const m = laneMotion(lane.mode, reduceMotion);

  return (
    <motion.div
      animate={controls}
      // `initial` is read once, at mount, and it is where strict no-autoplay is
      // actually enforced: unless the reader asked for this mount, EVERY lane —
      // including the selected one — paints its complete outcome in the first
      // frame. Both outcomes are therefore on screen at all times, and the still
      // is truthful before anything has moved.
      initial={selected && plays ? "pending" : "resolved"}
      variants={{ pending: {}, resolved: {} }}
      className={`min-w-0 rounded-xl border px-3.5 pt-2.5 pb-3 ${
        selected ? "border-brand/45 bg-fd-secondary/70" : "border-fd-border bg-fd-secondary/30"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
        <div className="relative min-w-0 -my-1 py-1">
          <code className="font-mono text-[10px] break-all text-fd-foreground [font-variant-ligatures:none]">
            {lane.literal}
          </code>
          {/* The read, as an event, and it is inset-0 rather than bled outward.
              Measured at 320px: a `-inset-x-1.5` ring put 6px of scrollWidth past
              its container's clientWidth in BOTH lanes — an absolutely positioned
              child still counts as overflow, and an ancestor with
              `overflow-hidden` would have hidden the fact rather than fixed it.
              The breathing room it wanted is taken vertically, where negative
              margin costs no horizontal room. */}
          <motion.span
            variants={m.read}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-md border border-brand/70"
          />
        </div>
        <code className="shrink-0 font-mono text-[8px] whitespace-nowrap text-fd-foreground/70">
          {lane.pointer}
        </code>
      </div>

      {/* ---- the mechanism ---- */}
      <div className="mt-1 flex min-w-0 items-center gap-2" aria-hidden="true">
        <div className="relative min-w-0 flex-1" style={{ height: TRACK_H }}>
          {/* The destination path. Dashed, drawn in both lanes, never animated:
              where the bytes would go is part of the invariant, so it must not
              look like something the drop lane earned. */}
          <span
            style={{ left: PIVOT_X }}
            className="absolute top-1/2 right-0 border-t border-dashed border-fd-foreground/30"
          />

          {/* The write itself, over that path. Absent in the held lane — not
              stopped, absent. */}
          <motion.span
            variants={m.write}
            style={{ left: PIVOT_X }}
            // Two pixels, not one. Measured against the settled desktop frame: a
            // hairline over a dashed base of the same weight left the written and
            // the unwritten lane looking alike at 570px of card, which is the one
            // comparison this plate exists to make. It stayed legible at 320
            // either way, so the narrow layout would never have caught it.
            className="absolute top-1/2 right-0 h-0.5 origin-left -translate-y-1/2 rounded-full bg-brand"
          />

          {/* Where the leaf lay before it was resolved. */}
          <motion.span
            variants={m.ghost}
            style={{
              left: PIVOT_X,
              width: LEAF_LEN,
              height: LEAF_THICK,
              transform: "translateY(-50%)",
            }}
            className="absolute top-1/2 rounded-[2px] border border-dashed border-fd-foreground/40"
          />

          {/* The shoulder behind a raised leaf: a guard has mass. */}
          <motion.span
            variants={m.shoulder}
            style={{
              left: PIVOT_X,
              width: "0.75rem",
              height: LEAF_LEN,
              transform: "translate(-0.1875rem, -100%)",
              background:
                "linear-gradient(to top, color-mix(in oklab, var(--color-brand) 26%, transparent), transparent)",
            }}
            className="absolute top-1/2 rounded-[3px]"
          />

          {/* THE LEAF. `transformOrigin` is the pivot and it is the left-centre of
              this box, which sits exactly on the rail — so the rotation is about a
              point on the path rather than about the leaf's own middle. */}
          <motion.span
            variants={m.leaf}
            style={{
              left: PIVOT_X,
              width: LEAF_LEN,
              height: LEAF_THICK,
              y: "-50%",
              transformOrigin: "0% 50%",
            }}
            className="absolute top-1/2 rounded-[2px] bg-fd-foreground"
          />

          {/* The pivot. Small, solid, and present in both lanes at the same point,
              because "one mechanism" is a claim about this dot. */}
          <span
            style={{ left: PIVOT_X }}
            className="absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fd-foreground"
          />

          {/* Held. Two short brackets against the standing leaf — contact
              registered on the barrier, not on anything that arrived. */}
          <motion.span
            variants={m.holdMark}
            style={{ left: `calc(${PIVOT_X} + 0.5rem)`, top: "calc(50% + 0.45rem)" }}
            className="absolute font-mono text-[7px] leading-none tracking-[0.1em] whitespace-nowrap text-fd-foreground/70 uppercase"
          >
            held
          </motion.span>
        </div>

        {/* The destinations. Same two slots, same order, same labels in both
            lanes; only the fill differs. */}
        <div className="shrink-0 rounded-md border border-fd-border bg-fd-background/50 px-1.5 py-1">
          {CORE.map((entry, index) => (
            <div key={entry.key} className="flex items-center gap-1">
              {/* Hollow is the destination; filled is the destination written.
                  Both lanes draw both slots at the same size in the same order,
                  so the only difference a reader can see is the fill — which is
                  the invariant and the consequence in one glyph. Sized up from
                  7px after the settled desktop frame showed a 1px fill inside a
                  7px square reading as the same mark in both lanes. */}
              <span className="relative flex size-[9px] items-center justify-center rounded-[2px] border border-fd-foreground/45">
                <motion.span
                  variants={m.slot(index)}
                  className="absolute inset-[1.5px] rounded-[1px] bg-brand"
                />
              </span>
              <span className="font-mono text-[7px] leading-none text-fd-foreground/70">
                {index === 0 ? "file" : "deps"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- the consequence ---- */}
      {/* A footer, deliberately: a right-hand verdict column is Phase's device and
          two plates that both draw one read as one plate twice. The diagnostic
          CODE leads, because the code is the implementation-real fact and the
          severity words are Phase's vocabulary. */}
      <motion.div variants={m.verdict} className="mt-1 min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[9px] leading-tight">
          <code style={{ color: BRAND_INK }} className="[font-variant-ligatures:none]">
            {lane.code}
          </code>
          <span className="text-fd-foreground/70">{lane.grade}</span>
          <span className="text-fd-foreground">{lane.outcome}</span>
        </p>
        <p className="mt-0.5 font-mono text-[8px] leading-tight text-fd-foreground/70">
          {lane.detail}
        </p>
      </motion.div>
    </motion.div>
  );
}
