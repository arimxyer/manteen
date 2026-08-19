"use client";

import { Play, RotateCcw } from "lucide-react";
import { MotionConfig, motion, useInView } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The authoring dial: three Mantine coordinates turning into register around a
 * source file that never moves.
 *
 * Adapted from the Dial study, which stays untouched at
 * `src/app/prototypes/authoring-descriptor/volvelle.tsx` as the comparison
 * artifact.
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/**
 * The dial's geometry, in px on its design diameter.
 *
 * Every ring, readout and axis segment is placed from a radius rather than from
 * a hand-tuned percentage, because the three annuli, the graduation bands and
 * the hub share one budget: `CENTER` is 144px, and the bezel, three readouts and
 * the hub consume it exactly once. A percentage typed per element cannot be
 * checked against that budget.
 */
const PLATE = 288;
const CENTER = PLATE / 2;

/** Depth of the engraved graduation cut into each ring's rim. */
const TICK_BAND = 7;

/** Height of an engraved readout, including its registration rule. */
const READOUT = 18;

/** Half-height of the source hub. Nothing may cross this radius. */
const HUB_HALF = 35;

const onPlate = (px: number) => `${((px / PLATE) * 100).toFixed(3)}%`;
const onRing = (radius: number, px: number) => `${((px / (radius * 2)) * 100).toFixed(3)}%`;

/**
 * A graduation band, drawn as a conic repeat.
 *
 * `weight` is a line width in px at that radius converted to degrees — without
 * it, one angular pitch draws hairlines on the outer ring and wedges on the
 * inner one. `pitch` is likewise per ring so the ticks keep roughly constant arc
 * spacing: an instrument's scale is finer where the radius is larger.
 */
const graduation = (radius: number, pitch: number, weight: number, alpha: number) => {
  const width = (weight * 57.2958) / radius;
  return `repeating-conic-gradient(from ${(-width / 2).toFixed(3)}deg, color-mix(in oklab, var(--color-fd-foreground) ${alpha}%, transparent) 0deg ${width.toFixed(3)}deg, transparent ${width.toFixed(3)}deg ${pitch}deg)`;
};

/**
 * Keeps a graduation in the rim band only, so the ring face stays a clean field.
 *
 * `closest-side` is load-bearing. A bare `circle` sizes to farthest-corner, so
 * its ray is the half-diagonal and a stop written from `100%` lands at roughly a
 * third of the radius — the band comes out about three times deeper than asked
 * for and the graduation reads as spokes across the face.
 */
const rimMask = (depth: number) =>
  `radial-gradient(circle closest-side, transparent calc(100% - ${depth + 1}px), black calc(100% - ${depth}px))`;

/**
 * Each ring steps one notch toward the foreground as it goes inward.
 *
 * The step has to be tonal rather than hue-based to survive both themes: mixing
 * toward `fd-foreground` lightens in dark and darkens in light, so the ordering
 * reads the same way round in either.
 */
const ringFace = (step: number) =>
  `linear-gradient(152deg, color-mix(in oklab, var(--color-fd-card) ${97 - step * 3}%, var(--color-fd-foreground)) 0%, color-mix(in oklab, var(--color-fd-secondary) ${88 - step * 6}%, var(--color-fd-foreground)) 58%, color-mix(in oklab, var(--color-fd-secondary) ${94 - step * 5}%, var(--color-fd-foreground)) 100%)`;

/**
 * The instant every ring finishes its turn.
 *
 * Each ring's duration is derived as `LOCK_TIME - delay` rather than written
 * out, so "start staggered, register together" is enforced by arithmetic rather
 * than by three sums a later edit could silently break. Every post-lock beat is
 * likewise an offset from here, so the second half of the sequence moves as one
 * if the lock ever shifts.
 */
const LOCK_TIME = 1.12;

/**
 * The three authored coordinates, outermost first.
 *
 * Order is not decorative. The compatibility gate faces the consumer's project
 * and sits furthest out; the provider requirement wraps the source most tightly
 * and sits innermost — which is also the shortest declaration, and the innermost
 * ring has the least room to engrave. Every field and value is a real one, and
 * three of the five the copy card lists beside this illustration.
 */
const rings = [
  {
    radius: 135,
    start: -118,
    overshoot: 4,
    delay: 0.14,
    pitch: 5.625,
    number: "01",
    label: "mantine",
    value: ">=9 <10",
    lit: LOCK_TIME + 0.02,
  },
  {
    radius: 101,
    start: 92,
    overshoot: -3,
    delay: 0.26,
    pitch: 7.5,
    number: "02",
    label: "stylesApi",
    value: "3 selectors",
    lit: LOCK_TIME + 0.13,
  },
  {
    radius: 69,
    start: -68,
    overshoot: 3,
    delay: 0.38,
    pitch: 11.25,
    number: "03",
    label: "provider",
    value: "required",
    lit: LOCK_TIME + 0.24,
  },
] as const;

/**
 * The fixed part of the registration axis, as [outer, inner] radii.
 *
 * Drawn in segments rather than as one line, which would paint straight through
 * the readout text. The segments occupy exactly the gaps the readouts and the
 * rotating index blades leave, so the axis reads as continuous only once every
 * ring has registered — the completion is the payoff, not a decoration.
 */
const axis = [
  { from: 110, to: 101, delay: LOCK_TIME + 0.07 },
  { from: 76, to: 69, delay: LOCK_TIME + 0.18 },
  { from: 44, to: HUB_HALF, delay: LOCK_TIME + 0.29 },
] as const;

/**
 * `still` is the registered instrument with nothing in flight. `armed` is the
 * run's first frame held indefinitely; because it is literally frame one,
 * mounting a run against it cannot snap. `play` is the run.
 */
type Mode = "still" | "armed" | "play";

function Dial({ mode }: { mode: Mode }) {
  const rest = mode === "still";
  const playing = mode === "play";

  /** The value an element mounts at: its finished one only when nothing will run. */
  const from = <T,>(start: T, end: T) => (rest ? end : start);

  /** The value an element settles on: the start value only while a run is held. */
  const to = <T,>(start: T, end: T) => (rest || playing ? end : start);

  const enter = (delay: number, duration = 0.32) =>
    playing ? { delay, duration, ease: EASE_OUT } : { duration: 0 };

  /**
   * One turn, written once. A ring and the readout riding it must share an
   * identical schedule or the counter-rotation drifts and the word tips over
   * mid-arc.
   */
  const turn = (ring: (typeof rings)[number]) =>
    playing
      ? {
          delay: ring.delay,
          duration: LOCK_TIME - ring.delay,
          ease: [EASE_IN_OUT, EASE_OUT],
          times: [0, 0.84, 1],
        }
      : { duration: 0 };

  return (
    <>
      {/* The plate is capped against the CARD, not the viewport, and is square by
          aspect rather than by a held height — so the illustration cannot leave a
          gap or a clipped edge at any width. */}
      <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
        <div
          className="absolute inset-0 rounded-full border border-fd-foreground/12 shadow-[0_22px_50px_-32px_color-mix(in_oklab,var(--color-fd-foreground)_48%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_82%,var(--color-fd-foreground))]"
          style={{
            background:
              "radial-gradient(circle at 38% 27%, var(--color-fd-card) 0%, var(--color-fd-secondary) 63%, color-mix(in oklab, var(--color-fd-secondary) 88%, var(--color-fd-foreground)) 100%)",
          }}
        >
          {/* Bezel. Fixed, finely knurled, and the reference every ring turns
              against — so the answer's location is declared before anything moves
              rather than revealed after it stops. */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: graduation(CENTER, 3.75, 1, 26),
              maskImage: rimMask(6),
              WebkitMaskImage: rimMask(6),
            }}
          />
          <span className="absolute inset-[2.9%] rounded-full border border-fd-foreground/12 shadow-[inset_0_0_22px_color-mix(in_oklab,var(--color-fd-foreground)_7%,transparent)]" />

          {/* The bezel's index mark: the top of the registration axis. */}
          <span
            className="absolute left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[3px] border-x-transparent border-t-[5px] border-t-brand"
            style={{ top: onPlate(1.5) }}
          />

          {rings.map((ring, index) => {
            const size = onPlate(ring.radius * 2);
            const settled = "translate(-50%, -50%) rotate(0deg) scale(1)";
            const turned = `translate(-50%, -50%) rotate(${ring.start}deg) scale(0.985)`;
            const past = `translate(-50%, -50%) rotate(${ring.overshoot}deg) scale(1)`;

            /* The readout rides the ring but counter-rotates by the same angle,
               so it travels the arc and stays upright the whole way. Nothing that
               carries a word is ever drawn on its side. */
            const upright = (angle: number) => `translateX(-50%) rotate(${-angle}deg)`;

            return (
              <motion.div
                key={ring.label}
                initial={{ opacity: from(0.76, 1), transform: from(turned, settled) }}
                animate={{
                  opacity: to(0.76, 1),
                  transform: playing ? [turned, past, settled] : to(turned, settled),
                }}
                transition={turn(ring)}
                className="absolute top-1/2 left-1/2 rounded-full border border-fd-foreground/14"
                style={{
                  width: size,
                  height: size,
                  background: ringFace(index),
                  boxShadow: `0 7px 13px -10px color-mix(in oklab, var(--color-fd-foreground) 54%, transparent), inset 0 1px 0 color-mix(in oklab, var(--color-fd-card) 78%, var(--color-fd-foreground)), inset 0 0 ${10 + index * 6}px color-mix(in oklab, var(--color-fd-foreground) ${7 + index * 3}%, transparent)`,
                }}
              >
                {/* Minor graduation, then a longer major every 45 degrees. Two
                    weights is what separates a machined scale from hatching. */}
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: graduation(ring.radius, ring.pitch, 1, 30),
                    maskImage: rimMask(TICK_BAND),
                    WebkitMaskImage: rimMask(TICK_BAND),
                  }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: graduation(ring.radius, 45, 1.5, 46),
                    maskImage: rimMask(TICK_BAND + 4),
                    WebkitMaskImage: rimMask(TICK_BAND + 4),
                  }}
                />

                {/* The ring's index blade: the only thing whose motion has to be
                    read, so the only thing drawn in brand on the ring. The
                    sweeping ticks give the turn its speed, the blade gives it a
                    destination. */}
                <span
                  className="absolute top-0 left-1/2 w-px -translate-x-1/2 bg-brand"
                  style={{ height: onRing(ring.radius, TICK_BAND) }}
                />
                <span className="absolute top-0 left-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />

                <motion.span
                  initial={{ transform: from(upright(ring.start), upright(0)) }}
                  animate={{
                    transform: playing
                      ? [upright(ring.start), upright(ring.overshoot), upright(0)]
                      : to(upright(ring.start), upright(0)),
                  }}
                  transition={turn(ring)}
                  className="absolute left-1/2 flex items-baseline justify-center gap-[5px] font-mono whitespace-nowrap"
                  style={{ top: onRing(ring.radius, TICK_BAND), height: `${READOUT}px` }}
                >
                  {/* A three-step neutral ramp — ordinal, field name, declared
                      value — measured on the rendered ring faces rather than on
                      the card. Brand is absent here: at 8px on the inner ring's
                      face it measures 2.2:1 in dark and 2.5:1 in light, so it is
                      kept for the registration marks, the only things on the dial
                      whose colour carries meaning.

                      The ordinal is dropped below 400px. The plate is capped
                      against the card, so it holds a full 18rem down to about a
                      368px viewport and only shrinks past that; at 320px the
                      innermost ring is ~115px across and its readout is the one
                      that stops fitting inside its own face. The ordinal is the
                      only glyph here carrying neither a field name nor a declared
                      value, so it is what gives up the room. */}
                  <span className="text-[8px] text-fd-foreground/55 max-[400px]:hidden">
                    {ring.number}
                  </span>
                  <span className="text-[9px] tracking-[0.04em] text-fd-foreground/80">
                    {ring.label}
                  </span>
                  {/* Ligatures off: the mono face renders `>=` as a single `≥`,
                      and a range a reader might copy would then appear as a
                      character that is not in the descriptor. */}
                  <motion.span
                    initial={{ opacity: from(0.55, 1) }}
                    animate={{ opacity: to(0.55, 1) }}
                    transition={enter(ring.lit, 0.26)}
                    className="text-[10px] text-fd-foreground [font-variant-ligatures:none]"
                  >
                    {ring.value}
                  </motion.span>

                  {/* The registration rule, drawn under the coordinate at the
                      instant the axis strike crosses it — the reading is
                      confirmed, not announced. */}
                  <motion.span
                    initial={{ transform: from("scaleX(0)", "scaleX(1)") }}
                    animate={{ transform: to("scaleX(0)", "scaleX(1)") }}
                    transition={enter(ring.lit, 0.3)}
                    className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand/70 shadow-[0_1px_0_color-mix(in_oklab,var(--color-fd-card)_55%,transparent)]"
                  />
                </motion.span>
              </motion.div>
            );
          })}

          {axis.map((segment) => (
            <span
              key={segment.from}
              className="absolute left-1/2 z-20 w-px -translate-x-1/2 bg-fd-foreground/12"
              style={{
                top: onPlate(CENTER - segment.from),
                height: onPlate(segment.from - segment.to),
              }}
            >
              <motion.span
                initial={{ transform: from("scaleY(0)", "scaleY(1)") }}
                animate={{ transform: to("scaleY(0)", "scaleY(1)") }}
                transition={enter(segment.delay, 0.24)}
                className="absolute inset-0 origin-top bg-brand/65"
              />
            </span>
          ))}

          {/* The source. The only object on the dial — everything else is
              engraved into the instrument, which is the distinction the plate is
              making. */}
          <div className="absolute top-1/2 left-1/2 z-30 flex w-[29%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border border-brand/40 bg-fd-card px-2 py-2.5 text-center shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--color-fd-foreground)_52%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_80%,var(--color-fd-foreground))]">
            <span className="font-mono text-[8px] tracking-[0.14em] text-fd-muted-foreground uppercase">
              source
            </span>
            <span className="mt-1 font-mono text-[11px] text-fd-foreground">panel.tsx</span>
            <span className="mt-1.5 h-px w-5 bg-brand/55" />
            <span className="mt-1 font-mono text-[8px] text-brand">unchanged</span>
          </div>

          {/* The pivot, seated where the axis meets the source rather than at dead
              centre, which is where the filename is. */}
          <motion.span
            initial={{
              opacity: from(0, 1),
              transform: from("translate(-50%, -50%) scale(0.9)", "translate(-50%, -50%) scale(1)"),
            }}
            animate={{
              opacity: to(0, 1),
              transform: to("translate(-50%, -50%) scale(0.9)", "translate(-50%, -50%) scale(1)"),
            }}
            transition={enter(LOCK_TIME + 0.35, 0.26)}
            className="absolute left-1/2 z-40 size-2 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_11%,transparent)]"
            style={{ top: onPlate(CENTER - HUB_HALF) }}
          />
        </div>
      </div>

      {/* The boundary. Solid rule while the item is the author's, dashed once it
          is the kit's — the handoff is drawn, not only captioned.

          Both labels are nowrap and both rules bottom out at a min width, so the
          rail cannot silently absorb a narrow card. The two sides are grouped,
          each with its own rule, so the rail is one composition that wraps to two
          lines rather than a row of five siblings whose last member is the one
          pushed off the edge.

          Neither group may carry `min-w-0`. That is the usual reflex on a flex
          child and it defeats the arrangement: a group allowed to shrink past its
          own min-content never triggers the wrap, and the nowrap label inside
          overflows the group instead of the row. */}
      <motion.div
        initial={{ opacity: from(0, 1), transform: from("translateY(14%)", "translateY(0%)") }}
        animate={{ opacity: to(0, 1), transform: to("translateY(14%)", "translateY(0%)") }}
        transition={enter(LOCK_TIME + 0.46, 0.32)}
        className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 border-t pt-2.5 font-mono text-[9px] tracking-[0.1em] uppercase sm:gap-x-2.5"
      >
        <span className="flex flex-1 items-center gap-2 sm:gap-2.5">
          <span className="whitespace-nowrap text-fd-foreground">
            <span className="sm:hidden">authored · 3/3</span>
            <span className="hidden sm:inline">author declares · 3/3</span>
          </span>
          <span className="h-px min-w-3 flex-1 bg-fd-foreground/25" />
        </span>
        <span className="flex flex-1 items-center gap-2 sm:gap-2.5">
          <span className="text-fd-muted-foreground">→</span>
          <span className="min-w-3 flex-1 border-t border-dashed border-brand/50" />
          <span className="whitespace-nowrap text-brand">
            <span className="sm:hidden">kit · transport</span>
            <span className="hidden sm:inline">manteen-kit · transport</span>
          </span>
        </span>
      </motion.div>
    </>
  );
}

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The motion preference, resolved before the first client paint.
 *
 * `null` until the query has been read, and both the server render and the first
 * client render treat that as "show the finished dial and offer nothing". The
 * shared `usePrefersReducedMotion` reads the query in a passive effect, which
 * lands *after* paint — a reader who asked for less motion would be shown a frame
 * of the unregistered dial and a replay control that will never do anything.
 * Reading it in a layout effect is the whole difference, which is why this is not
 * the shared hook.
 */
function useMotionAllowed() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useBrowserLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowed(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return allowed;
}

/**
 * The card that carries the dial, and its one control.
 *
 * The illustration is the button. An explanation that plays once and rests still
 * has to be repeatable, and a labelled replay bar under the card puts transport
 * chrome where the reader is meant to be reading a declaration. The accessible
 * name, the title and the media icon all say what pressing does, so it is a
 * stated control rather than a mystery-meat target.
 *
 * A run is keyed, so a press remounts it and every element restarts from frame
 * one: ten presses in a second are ten clean runs with no interleaving, which a
 * timeline advanced by state cannot promise.
 *
 * Under reduced motion there is no control at all. A replay button on a card that
 * renders its finished state and will never move is an offer the card cannot
 * keep, so it is not made.
 */
export function AuthoringDial({ className }: { className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const inView = useInView(container, { once: true, amount: 0.5 });
  const allowed = useMotionAllowed();
  const [run, setRun] = useState(0);
  const descriptionId = useId();

  // The run is owned by visibility, not by arrival: once the query has resolved
  // in favour of motion, the dial takes up frame one and holds it until half of
  // the card is on screen, wherever that happens. `once` on the observer and the
  // `run` guard are what make it exactly one automatic play — a later press is
  // the only other way the sequence starts.
  useEffect(() => {
    if (allowed !== true || !inView || run > 0) return;
    setRun(1);
  }, [allowed, inView, run]);

  const mode: Mode = allowed !== true ? "still" : run > 0 ? "play" : "armed";
  const played = run > 0;
  const label = played
    ? "Replay the authoring dial animation"
    : "Play the authoring dial animation";
  const Icon = played ? RotateCcw : Play;

  const plate = (
    <div key={run} aria-hidden="true" className="contents">
      <Dial mode={mode} />
    </div>
  );

  return (
    // Alongside the explicit branch rather than instead of it: the branch owns
    // what the dial shows, and this covers any descendant transition the branch
    // does not reach.
    <MotionConfig reducedMotion="user">
      <div
        ref={container}
        className={cn(
          "flex min-w-0 flex-col justify-center rounded-2xl border bg-fd-card p-4 shadow-lg sm:p-6",
          className,
        )}
      >
        <p id={descriptionId} className="sr-only">
          {
            "An authoring dial. At its centre is an unchanged source file, panel.tsx. Three concentric rings carry the Mantine coordinates the author declares beside it: mantine, a compatibility range of >=9 <10; stylesApi, a surface of three selectors; and provider, required. Each ring turns until its index mark registers against the fixed axis at the top of the dial, and the axis reads as continuous only once all three have registered. None of these facts is inferred from the source. The rail beneath marks the handoff: the author declares all three, and manteen-kit owns how the finished item travels."
          }
        </p>

        {allowed === true ? (
          <button
            type="button"
            aria-label={label}
            aria-describedby={descriptionId}
            title={label}
            onClick={() => setRun((current) => current + 1)}
            className="group relative mx-auto block w-full max-w-md cursor-pointer rounded-2xl border-0 bg-transparent p-0 text-left transition-transform duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-fd-card focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {plate}

            {/* The smallest affordance that works: a dial with a REPLAY bar under
                it stops reading as an instrument. It rests legible rather than
                invisible so a touch reader can find it with no hover state to
                discover, and the focus ring on the illustration is what a
                keyboard reader gets instead. Hover is a pointer affordance, so
                like the rest of this page it exists only where a precise hovering
                pointer does. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 flex size-7 items-center justify-center rounded-full border bg-fd-card/85 text-fd-muted-foreground opacity-50 transition-[opacity,color] duration-150 ease-[var(--ease-out)] group-focus-visible:text-brand group-focus-visible:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-brand [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 motion-reduce:transition-none"
            >
              <Icon className={cn("size-3", !played && "translate-x-px")} />
            </span>
          </button>
        ) : (
          <div className="mx-auto w-full max-w-md">{plate}</div>
        )}
      </div>
    </MotionConfig>
  );
}
