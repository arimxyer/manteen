"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/**
 * The dial's geometry, in px on its design diameter.
 *
 * Every ring, engraved readout and axis segment is placed from a radius rather
 * than from a hand-tuned percentage, because the three annuli, the graduation
 * bands and the hub all have to share one budget: `CENTER` is 144px, and the
 * bezel, three readouts and the hub consume it exactly once. A percentage typed
 * per element cannot be checked against that budget, and the previous layout
 * failed precisely there — the innermost readout wrapped, outgrew its fixed
 * height and landed on top of the source hub.
 */
const PLATE = 288;
const CENTER = PLATE / 2;

/**
 * The plate is capped against its container, not the viewport.
 *
 * A `86vw` cap measures the wrong thing: the constraint is the card's own
 * content box, which is narrower than the viewport at every width. Below about
 * 400px the plate stayed at its full 18rem, overflowed the column and was
 * silently trimmed on both sides by the card's `overflow-hidden` — a clipped
 * circle, with nothing reporting an error.
 */

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
 * `weight` is a line width in px at that radius, converted to degrees — without
 * it a single angular pitch draws hairlines on the outer ring and wedges on the
 * inner one. `pitch` is likewise chosen per ring so the ticks keep roughly
 * constant arc spacing: an instrument's scale is finer where the radius is
 * larger, never the other way round.
 */
const graduation = (radius: number, pitch: number, weight: number, alpha: number) => {
  const width = (weight * 57.2958) / radius;
  return `repeating-conic-gradient(from ${(-width / 2).toFixed(3)}deg, color-mix(in oklab, var(--color-fd-foreground) ${alpha}%, transparent) 0deg ${width.toFixed(3)}deg, transparent ${width.toFixed(3)}deg ${pitch}deg)`;
};

/**
 * Keeps a graduation in the rim band only, so the ring face stays a clean field.
 *
 * `closest-side` is load-bearing. A bare `circle` sizes to farthest-corner, so
 * its ray is the half-diagonal and a stop written as `calc(50% - 7px)` lands at
 * roughly a third of the radius — the band comes out about three times deeper
 * than asked for and the graduation reads as spokes across the face. Sized to
 * closest-side the ray is exactly the radius, and the stop is written from its
 * outer end.
 */
const rimMask = (depth: number) =>
  `radial-gradient(circle closest-side, transparent calc(100% - ${depth + 1}px), black calc(100% - ${depth}px))`;

/**
 * Each ring steps one notch toward the foreground as it goes inward.
 *
 * The step has to be tonal rather than hue-based to survive both themes: mixing
 * toward `fd-foreground` lightens in dark and darkens in light, so the ordering
 * reads the same way round in either. The previous faces differed by 2%, which
 * is invisible in dark and completely invisible in light.
 */
const ringFace = (step: number) =>
  `linear-gradient(152deg, color-mix(in oklab, var(--color-fd-card) ${97 - step * 3}%, var(--color-fd-foreground)) 0%, color-mix(in oklab, var(--color-fd-secondary) ${88 - step * 6}%, var(--color-fd-foreground)) 58%, color-mix(in oklab, var(--color-fd-secondary) ${94 - step * 5}%, var(--color-fd-foreground)) 100%)`;

/**
 * The instant every ring finishes its turn.
 *
 * Each ring's duration is derived as `LOCK_TIME - delay` rather than written
 * out, so "start staggered, register together" is enforced by the arithmetic
 * instead of by three sums a later edit could silently break. Every post-lock
 * beat is likewise an offset from here, so the whole second half of the
 * sequence moves as one if the lock ever shifts.
 */
const LOCK_TIME = 1.12;

/**
 * The three authored coordinates, outermost first.
 *
 * Order is not decorative. The compatibility gate faces the consumer's project
 * and sits furthest out; the provider requirement wraps the source most tightly
 * and sits innermost — which is also the shortest declaration, and the
 * innermost ring is the one with the least room to engrave.
 *
 * Only the start of each turn is written here; its duration is derived from
 * `LOCK_TIME`, so the rings start staggered and register together. That is the
 * dial's best idea and it is preserved exactly.
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
 * It is drawn in segments rather than as one line for a reason the previous
 * version demonstrated: a single line spanning bezel to hub is painted straight
 * through the readout text. The segments occupy exactly the gaps the readouts
 * and the rotating index blades leave, so the axis only becomes continuous once
 * every ring has registered — the completion is the payoff, not a decoration.
 */
const axis = [
  { from: 110, to: 101, delay: LOCK_TIME + 0.07 },
  { from: 76, to: 69, delay: LOCK_TIME + 0.18 },
  { from: 44, to: HUB_HALF, delay: LOCK_TIME + 0.29 },
] as const;

export function VolvelleVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.32) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  /** Reduced motion rests on the registered dial, so every start value is its end value. */
  const from = (start: string, end: string) => (reduceMotion ? end : start);

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Authoring volvelle / 07
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            A coordinate system for source.
          </h2>
        </div>
        <span className="hidden font-mono text-[10px] whitespace-nowrap text-brand sm:inline">
          MANTINE-NATIVE
        </span>
      </header>

      <div className="relative mx-auto mt-3 h-[21rem] w-full max-w-md" aria-hidden="true">
        <div
          className="absolute top-0 left-1/2 aspect-square w-[18rem] max-w-full -translate-x-1/2 rounded-full border border-fd-foreground/12 shadow-[0_22px_50px_-32px_color-mix(in_oklab,var(--color-fd-foreground)_48%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_82%,var(--color-fd-foreground))]"
          style={{
            background:
              "radial-gradient(circle at 38% 27%, var(--color-fd-card) 0%, var(--color-fd-secondary) 63%, color-mix(in oklab, var(--color-fd-secondary) 88%, var(--color-fd-foreground)) 100%)",
          }}
        >
          {/* Bezel. Fixed, finely knurled, and the reference every ring turns
              against — so the answer's location is declared before anything
              moves rather than revealed after it stops. */}
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
            className="absolute left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-brand"
            style={{ top: onPlate(1.5) }}
          />

          {rings.map((ring, index) => {
            const size = onPlate(ring.radius * 2);
            const settled = "translate(-50%, -50%) rotate(0deg) scale(1)";
            const turned = `translate(-50%, -50%) rotate(${ring.start}deg) scale(0.985)`;
            const past = `translate(-50%, -50%) rotate(${ring.overshoot}deg) scale(1)`;

            /* The readout rides the ring but counter-rotates by the same angle,
               so it travels the arc and stays upright the whole way. That is the
               one change that makes a label legible before, during and after the
               turn; nothing that carries a word is ever drawn on its side. */
            const upright = (angle: number) => `translateX(-50%) rotate(${-angle}deg)`;

            return (
              <motion.div
                key={ring.label}
                initial={{
                  opacity: reduceMotion ? 1 : 0.76,
                  transform: from(turned, settled),
                }}
                animate={{
                  opacity: 1,
                  transform: reduceMotion ? settled : [turned, past, settled],
                }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        delay: ring.delay,
                        duration: LOCK_TIME - ring.delay,
                        ease: [EASE_IN_OUT, EASE_OUT],
                        times: [0, 0.84, 1],
                      }
                }
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

                {/* The ring's index blade. It is the only thing whose motion has
                    to be read, so it is the only thing drawn in brand on the
                    ring — the sweeping ticks give the turn its speed, the blade
                    gives it a destination. */}
                <span
                  className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-brand"
                  style={{ height: onRing(ring.radius, TICK_BAND) }}
                />
                <span className="absolute left-1/2 top-0 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />

                <motion.span
                  initial={{ transform: from(upright(ring.start), upright(0)) }}
                  animate={{
                    transform: reduceMotion
                      ? upright(0)
                      : [upright(ring.start), upright(ring.overshoot), upright(0)],
                  }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          delay: ring.delay,
                          duration: LOCK_TIME - ring.delay,
                          ease: [EASE_IN_OUT, EASE_OUT],
                          times: [0, 0.84, 1],
                        }
                  }
                  className="absolute left-1/2 flex items-baseline justify-center gap-[5px] font-mono whitespace-nowrap"
                  style={{ top: onRing(ring.radius, TICK_BAND), height: `${READOUT}px` }}
                >
                  {/* A three-step neutral ramp — ordinal, field name, declared
                      value — measured on the rendered ring faces rather than on
                      the card. Brand is deliberately absent here: at 8px on the
                      inner ring's face it measures 2.2:1 in dark and 2.5:1 in
                      light, so it is kept for the registration marks, which are
                      the only things on the dial whose colour carries meaning. */}
                  <span className="text-[8px] text-fd-foreground/55">{ring.number}</span>
                  <span className="text-[9px] tracking-[0.04em] text-fd-foreground/80">
                    {ring.label}
                  </span>
                  {/* Ligatures off: the mono face renders `>=` as a single `≥`,
                      and the range a reader might copy would then appear as a
                      character that is not in the descriptor. */}
                  <motion.span
                    initial={{ opacity: reduceMotion ? 1 : 0.55 }}
                    animate={{ opacity: 1 }}
                    transition={enter(ring.lit, 0.26)}
                    className="text-[10px] text-fd-foreground [font-variant-ligatures:none]"
                  >
                    {ring.value}
                  </motion.span>

                  {/* The registration rule. It draws under the coordinate at the
                      instant the axis strike crosses it — the reading is
                      confirmed, not announced. */}
                  <motion.span
                    initial={{ transform: from("scaleX(0)", "scaleX(1)") }}
                    animate={{ transform: "scaleX(1)" }}
                    transition={enter(ring.lit, 0.3)}
                    className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand/70 shadow-[0_1px_0_color-mix(in_oklab,var(--color-fd-card)_55%,transparent)]"
                  />
                </motion.span>
              </motion.div>
            );
          })}

          {/* The fixed segments of the axis. Each sits in a gap the readouts and
              blades leave, so the axis is drawn beside the words, never over
              them, and reads as continuous only once every ring has registered. */}
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
                animate={{ transform: "scaleY(1)" }}
                transition={enter(segment.delay, 0.24)}
                className="absolute inset-0 origin-top bg-brand/65"
              />
            </span>
          ))}

          {/* The source. The only object on the dial — everything else is
              engraved into the instrument, which is the whole distinction the
              plate is making. */}
          <div className="absolute top-1/2 left-1/2 z-30 flex w-[29%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border border-brand/40 bg-fd-card px-2 py-2.5 text-center shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--color-fd-foreground)_52%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_80%,var(--color-fd-foreground))]">
            <span className="font-mono text-[8px] tracking-[0.14em] text-fd-muted-foreground uppercase">
              source
            </span>
            <span className="mt-1 font-mono text-[11px] text-fd-foreground">panel.tsx</span>
            <span className="mt-1.5 h-px w-5 bg-brand/55" />
            <span className="mt-1 font-mono text-[8px] text-brand">unchanged</span>
          </div>

          {/* The pivot, seated where the axis meets the source rather than at
              dead centre — which is where the filename is, and where the
              previous dot struck it out. */}
          <motion.span
            initial={{
              opacity: reduceMotion ? 1 : 0,
              transform: from("translate(-50%, -50%) scale(0.9)", "translate(-50%, -50%) scale(1)"),
            }}
            animate={{ opacity: 1, transform: "translate(-50%, -50%) scale(1)" }}
            transition={enter(LOCK_TIME + 0.35, 0.26)}
            className="absolute left-1/2 z-40 size-2 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_11%,transparent)]"
            style={{ top: onPlate(CENTER - HUB_HALF) }}
          />
        </div>

        {/* The boundary. Solid rule while the item is the author's; dashed once
            it is the kit's — the handoff is drawn, not only captioned.

            Both labels are nowrap and the two rules bottom out at their min
            width, so the rail cannot absorb a narrow card: it needs 351px and
            gets 293px at a 390px viewport, and the surplus leaves by the right
            edge where the card's `overflow-hidden` trims it. Nothing reports
            that — `scrollWidth` on the document is clean precisely because the
            section clipped it — so the rail carries its own compact wording
            below `sm` rather than relying on a layout check to catch it.

            The two sides are also grouped, each with its own rule, so the rail
            is one composition that wraps to two lines when a line cannot hold
            both — rather than a row of five siblings whose last member is the
            one pushed off the edge. Nothing is scaled down to make it fit: the
            authored side keeps its solid rule and the kit side its dashed one
            at every width, stacked if need be.

            Neither group may carry `min-w-0`. That is the usual reflex on a
            flex child, and here it defeats the whole arrangement: a group
            allowed to shrink past its own min-content never triggers the wrap,
            and the nowrap label inside simply overflows the group instead of
            the row — the same clipped edge, one level deeper. */}
        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0,
            transform: from("translateY(14%)", "translateY(0%)"),
          }}
          animate={{ opacity: 1, transform: "translateY(0%)" }}
          transition={enter(LOCK_TIME + 0.46, 0.32)}
          className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-2 gap-y-2 border-t pt-2.5 font-mono text-[9px] tracking-[0.1em] uppercase sm:gap-x-2.5"
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
      </div>

      <motion.p
        initial={{
          opacity: reduceMotion ? 1 : 0,
          transform: from("translateY(8%)", "translateY(0%)"),
        }}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={enter(LOCK_TIME + 0.62, 0.32)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        The source never moves. Authors turn the Mantine coordinates into register around it —
        declared, not inferred. <code className="font-mono text-fd-foreground">manteen-kit</code>{" "}
        owns how the finished item travels, and consumer aliases decide where it lands.
      </motion.p>

      <p className="sr-only">
        An authoring dial. At its centre is an unchanged source file, panel.tsx. Three concentric
        rings carry the Mantine coordinates the author declares beside it: a compatibility range of
        &gt;=9 &lt;10, a Styles API surface of three selectors, and a required MantineProvider. Each
        ring turns until its index blade registers against the fixed axis at the top of the dial,
        and the axis reads as continuous only once all three have registered. None of these facts is
        inferred from the source. manteen-kit owns how the finished item travels, and the
        consumer&#39;s aliases decide where it lands.
      </p>
    </section>
  );
}
