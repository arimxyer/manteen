"use client";

import { Play, RotateCcw } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useInView } from "motion/react";
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
const graduation = (
  radius: number,
  pitch: number,
  weight: number,
  alpha: number,
  tint = "var(--color-fd-foreground)",
) => {
  const width = (weight * 57.2958) / radius;
  return `repeating-conic-gradient(from ${(-width / 2).toFixed(3)}deg, color-mix(in oklab, ${tint} ${alpha}%, transparent) 0deg ${width.toFixed(3)}deg, transparent ${width.toFixed(3)}deg ${pitch}deg)`;
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

/** The measured duration budget the original coordinated sweep was tuned against. */
const TURN_TIME = 1.12;

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
    duration: TURN_TIME - 0.14,
    pitch: 5.625,
    label: "mantine",
    value: ">=9 <10",
  },
  {
    radius: 101,
    start: 92,
    overshoot: -3,
    duration: TURN_TIME - 0.26,
    pitch: 7.5,
    label: "stylesApi",
    value: "3 selectors",
  },
  {
    radius: 69,
    start: -68,
    overshoot: 3,
    duration: TURN_TIME - 0.38,
    pitch: 11.25,
    label: "provider",
    value: "required",
  },
] as const;

type DialStoryPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The narration, as three field chapters and one resolved ending.
 *
 * Each field owns two consecutive phases: its ring turns while the caption
 * reserve is empty, then its caption appears over the registered ring. That
 * alternation is the causal grammar of the illustration: movement earns a page
 * of explanation, the page clears, and only then may the next ring move.
 *
 * The field name and declared value lead each caption in the same mono face as
 * the ring engraving, so the caption and the resolved coordinate are visibly
 * one statement rather than parallel labels a reader has to associate.
 *
 * Every claim here is the shipped behaviour, not a paraphrase of the ring:
 * `mantine` is checked against the consumer's installed `@mantine/core` before
 * anything is written, `stylesApi` is an author assertion about the public
 * `classNames` surface and explicitly not about internal module class names,
 * and a missing `MantineProvider` is a warning raised at install.
 */
const STORY: readonly {
  lead: string;
  mono: boolean;
  detail: string;
}[] = [
  {
    lead: "mantine >=9 <10",
    mono: true,
    detail: "is checked against the project's installed Mantine before any file is written.",
  },
  {
    lead: "stylesApi 3 selectors",
    mono: true,
    detail: "names which parts consumers may restyle through classNames. Nothing else is public.",
  },
  {
    lead: "provider required",
    mono: true,
    detail: "says the source needs MantineProvider, so a project without one is warned at install.",
  },
  {
    lead: "Registered",
    mono: false,
    detail: "Three declarations on one axis, and panel.tsx never changed to carry any of them.",
  },
] as const;

/**
 * The stroke shared by the caption's rail and the leader that continues it.
 *
 * The rail is a 1px CSS `border-l` on the caption; the leader is an SVG stroke.
 * They are one line on screen, so the width has to be one number: this is it,
 * used as the stroke width and as the half-offset that centres the stroke on
 * the border box. Changing `border-l` on the caption without changing this
 * puts the two halves of the same line back out of register.
 */
const RAIL_STROKE = 1;

/**
 * The leader's dash, as a nominal dash and gap.
 *
 * Nominal because the pattern is refitted per run — see `fitDash`. The ratio is
 * what is fixed; the period stretches by a few percent so the corner lands
 * where it has to.
 */
const LEADER_DASH = 4;
const LEADER_PERIOD = 9;

/**
 * A dash pattern for a leader whose vertical run is `rise` px long.
 *
 * The leader is one path, drawn from the caption's rail upward and then across
 * to the readout, so its dash phase is continuous by construction — nothing is
 * stitched. That leaves two positions the eye actually checks, and a fixed
 * `4 5` satisfies only the first of them:
 *
 *   - the joint with the rail, which is the path's own start, so a dash always
 *     begins exactly there and the two halves of the line meet with no gap;
 *   - the 90-degree turn, which with a fixed period lands wherever `rise`
 *     happens to leave it, and a corner that lands in a gap reads as a break
 *     rather than as a turn.
 *
 * So the period is stretched — by under 5% at any real height — until the
 * corner sits at the centre of a dash. `rise` is a whole number of periods plus
 * half a dash; solving that for the period is the whole function. The
 * horizontal run then continues in the same phase and ends under the terminal
 * dot, which is why only the vertical leg is fitted.
 */
const fitDash = (rise: number) => {
  const half = LEADER_DASH / (2 * LEADER_PERIOD);
  if (!Number.isFinite(rise) || rise < LEADER_PERIOD * 2) {
    return `${LEADER_DASH} ${LEADER_PERIOD - LEADER_DASH}`;
  }
  const periods = Math.max(1, Math.round(rise / LEADER_PERIOD - half));
  const period = rise / (periods + half);
  const dash = (period * LEADER_DASH) / LEADER_PERIOD;
  return `${dash.toFixed(3)} ${(period - dash).toFixed(3)}`;
};

const FINAL_PHASE: DialStoryPhase = 6;
const CAPTION_HOLD = 2100;
const MOTION_SETTLE = 260;

/**
 * One cancellable timer advances one phase. Motion phases are only as long as
 * their ring's measured turn plus a small settling breath; caption phases all
 * receive the same reading time. No caption can begin before its own ring has
 * finished, because the boundary is represented once, here.
 */
const PHASE_HOLDS = [
  rings[0].duration * 1000 + MOTION_SETTLE,
  CAPTION_HOLD,
  rings[1].duration * 1000 + MOTION_SETTLE,
  CAPTION_HOLD,
  rings[2].duration * 1000 + MOTION_SETTLE,
  CAPTION_HOLD,
  0,
] as const;

/**
 * The fixed part of the registration axis, as [outer, inner] radii.
 *
 * Drawn in segments rather than as one line, which would paint straight through
 * the readout text. The segments occupy exactly the gaps the readouts and the
 * rotating index blades leave, so the axis reads as continuous only once every
 * ring has been read — the completion is the payoff, not a decoration.
 *
 * Segment `i` is the run between readout `i` and whatever the reading reaches
 * next, so it is drawn when that caption clears and the next ring begins. The
 * last one arrives at the source on the closing phase. The line the reader
 * watches being traced is the same line the captions are walking down; there is
 * no second timeline that could disagree with them.
 *
 * Every ring owns two phases. Segment `i` therefore lands on phase `i * 2 + 2`:
 * after its caption clears and at the instant the next movement begins. The last
 * segment lands on the resolved phase instead.
 */
const axis = [
  { from: 110, to: 101 },
  { from: 76, to: 69 },
  { from: 44, to: HUB_HALF },
] as const;

/**
 * `still` is the registered instrument with nothing in flight. `armed` is the
 * run's first frame held indefinitely; because it is literally frame one,
 * mounting a run against it cannot snap. `play` is the run.
 */
type Mode = "still" | "armed" | "play";

function Dial({ mode, storyPhase }: { mode: Mode; storyPhase: DialStoryPhase }) {
  const leaderRoot = useRef<HTMLDivElement>(null);
  const readouts = useRef<Array<HTMLSpanElement | null>>([]);
  const captionBox = useRef<HTMLDivElement>(null);
  const [leaderPath, setLeaderPath] = useState<{
    key: string;
    path: string;
    dash: string;
    start: readonly [number, number];
  } | null>(null);
  const rest = mode === "still";
  const playing = mode === "play";

  /**
   * The beat the plate is drawing. A plate that will never move is always on
   * the last one, so reduced motion and the server render get the settled
   * instrument without the player having to know that.
   */
  const phase = rest ? FINAL_PHASE : storyPhase;

  /** Even phases move a ring; odd phases read the ring that just settled. */
  const moving = phase < FINAL_PHASE && phase % 2 === 0 ? phase / 2 : -1;
  const reading = phase < FINAL_PHASE && phase % 2 === 1 ? (phase - 1) / 2 : -1;

  /**
   * One measured path from the caption's rail to the readout being read.
   *
   * A single path is important here. Splitting the route across the plate and
   * caption boxes made dash phases restart at every corner, so the connector
   * looked broken even when its CSS borders technically met.
   *
   * The caption end is the caption's own left rule, not the lead word inside
   * it. That is the design: the rail and the leader are one line, solid where
   * the sentence owns it and dashed where it is pointing, and they are drawn
   * collinear on `RAIL_STROKE` so the change of character is the only change at
   * the joint. Anchoring on the lead word instead put a 1.5px dashed stroke
   * half a pixel off a 1px solid border for the caption's full height, which is
   * the doubled line this replaces.
   *
   * Measuring the caption's container rather than the lead span also removes a
   * race: the caption swaps under `mode="wait"`, so on the frame this effect
   * runs the incoming lead span may not be mounted yet, while the container it
   * lands in never unmounts.
   */
  useLayoutEffect(() => {
    if (reading < 0) {
      setLeaderPath(null);
      return;
    }

    const root = leaderRoot.current;
    const readout = readouts.current[reading];
    const caption = captionBox.current;
    if (!root || !readout || !caption) return;

    const measure = () => {
      const rootBox = root.getBoundingClientRect();
      const readoutBox = readout.getBoundingClientRect();
      const captionRect = caption.getBoundingClientRect();

      const start = [
        readoutBox.left - rootBox.left - 7,
        readoutBox.top - rootBox.top + readoutBox.height / 2,
      ] as const;

      // The rail's centreline, and one stroke into the rail rather than exactly
      // onto its top edge. Both ends are fractional CSS pixels, so butting them
      // would risk a hairline of card showing through the joint; a stroke of
      // overlap in the same colour at the same width cannot be seen, and is not
      // the overlap this change is about.
      const railX = captionRect.left - rootBox.left + RAIL_STROKE / 2;
      const foot = captionRect.top - rootBox.top + RAIL_STROKE;

      setLeaderPath({
        key: rings[reading].label,
        start,
        dash: fitDash(foot - start[1]),
        path: `M ${railX} ${foot} L ${railX} ${start[1]} L ${start[0]} ${start[1]}`,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(readout);
    observer.observe(caption);
    return () => observer.disconnect();
  }, [reading]);

  /** The value an element mounts at: its finished one only when nothing will run. */
  const from = <T,>(start: T, end: T) => (rest ? end : start);

  /**
   * A change the narration causes, rather than one the run schedules. React
   * owns which beat is current and Motion only explains the change it makes,
   * so these carry no delay from the start of the run and cannot drift out of
   * step with the sentence on screen.
   */
  const beat = (delay = 0) => (rest ? { duration: 0 } : { delay, duration: 0.34, ease: EASE_OUT });

  /**
   * One turn, written once. A ring and the readout riding it must share an
   * identical schedule or the counter-rotation drifts and the word tips over
   * mid-arc.
   */
  const turn = (ring: (typeof rings)[number], active: boolean) =>
    playing && active
      ? {
          duration: ring.duration,
          ease: [EASE_IN_OUT, EASE_OUT],
          times: [0, 0.84, 1],
        }
      : { duration: 0 };

  return (
    <>
      <div ref={leaderRoot} className="relative">
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

              /* A chapter first moves one ring, then holds that same ring while
               its caption is read. Earlier rings stay registered; later rings
               stay visibly out of register. */
              const active = playing && moving === index;
              const held = reading === index;
              const registered = rest || phase > index * 2;
              const focused = active || held;
              const attention = rest || phase === FINAL_PHASE || focused ? 1 : 0.42;

              return (
                <motion.div
                  key={ring.label}
                  initial={{ opacity: from(0.76, 1), transform: from(turned, settled) }}
                  animate={{
                    opacity: active || registered ? 1 : 0.76,
                    transform: active ? [turned, past, settled] : registered ? settled : turned,
                  }}
                  transition={turn(ring, active)}
                  className="absolute top-1/2 left-1/2 rounded-full border border-fd-foreground/14"
                  style={{
                    width: size,
                    height: size,
                    background: ringFace(index),
                    boxShadow: `0 7px 13px -10px color-mix(in oklab, var(--color-fd-foreground) 54%, transparent), inset 0 1px 0 color-mix(in oklab, var(--color-fd-card) 78%, var(--color-fd-foreground)), inset 0 0 ${10 + index * 6}px color-mix(in oklab, var(--color-fd-foreground) ${7 + index * 3}%, transparent)`,
                  }}
                >
                  {/* The ring the narration is reading has its own scale redrawn
                    in brand, over the graduation already engraved there. A scale
                    is the part of a ring that does the measuring, so lighting it
                    says which quantity is being read; a halo drawn around the
                    ring would only say which ring, and would say it with an
                    element the instrument does not otherwise contain. */}
                  <motion.span
                    aria-hidden="true"
                    initial={false}
                    animate={{ opacity: held ? 1 : 0 }}
                    transition={beat()}
                    className="pointer-events-none absolute inset-0 rounded-full"
                  >
                    {/* Both engraved bands, each at its own depth. Lighting only
                      the minor one reads as the ticks having got brighter;
                      lighting the pair reads as the scale. */}
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: graduation(
                          ring.radius,
                          ring.pitch,
                          1,
                          72,
                          "var(--color-brand)",
                        ),
                        maskImage: rimMask(TICK_BAND),
                        WebkitMaskImage: rimMask(TICK_BAND),
                      }}
                    />
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: graduation(ring.radius, 45, 1.5, 92, "var(--color-brand)"),
                        maskImage: rimMask(TICK_BAND + 4),
                        WebkitMaskImage: rimMask(TICK_BAND + 4),
                      }}
                    />
                  </motion.span>

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
                    destination.

                    It is exempt from the focus treatment below. The blade is the
                    length of axis that runs through this ring's rim, so dimming
                    it on a beat about another ring would cut a gap into the line
                    the narration had just finished tracing. */}
                  <span
                    className="absolute top-0 left-1/2 w-px -translate-x-1/2 bg-brand"
                    style={{ height: onRing(ring.radius, TICK_BAND) }}
                  />
                  <span className="absolute top-0 left-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />

                  <motion.span
                    ref={(node) => {
                      readouts.current[index] = node;
                    }}
                    initial={{ transform: from(upright(ring.start), upright(0)), opacity: 1 }}
                    animate={{
                      transform: active
                        ? [upright(ring.start), upright(ring.overshoot), upright(0)]
                        : registered
                          ? upright(0)
                          : upright(ring.start),
                      opacity: attention,
                    }}
                    transition={{ transform: turn(ring, active), opacity: beat() }}
                    className="absolute left-1/2 flex items-baseline justify-center gap-[5px] font-mono whitespace-nowrap"
                    style={{ top: onRing(ring.radius, TICK_BAND), height: `${READOUT}px` }}
                  >
                    {/* Field and value are the two authored facts the story needs.
                      A sequence number would introduce a second mapping system
                      already expressed by the order of the motion, and would
                      disappear at the narrow width where mapping help matters
                      most. */}
                    <span className="text-[9px] tracking-[0.04em] text-fd-foreground/80">
                      {ring.label}
                    </span>
                    {/* Ligatures off: the mono face renders `>=` as a single `≥`,
                      and a range a reader might copy would then appear as a
                      character that is not in the descriptor. */}
                    <motion.span
                      initial={{ opacity: from(0.55, 1) }}
                      animate={{ opacity: registered ? 1 : 0.55 }}
                      transition={beat()}
                      className="text-[10px] text-fd-foreground [font-variant-ligatures:none]"
                    >
                      {ring.value}
                    </motion.span>

                    {/* The registration rule arrives with this ring's caption, so
                      the sentence appears only after the coordinate has earned
                      its place on the fixed axis. */}
                    <motion.span
                      initial={false}
                      animate={{
                        transform: registered ? "scaleX(1)" : "scaleX(0)",
                        opacity: held ? 1 : 0.7,
                      }}
                      transition={beat()}
                      className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand shadow-[0_1px_0_color-mix(in_oklab,var(--color-fd-card)_55%,transparent)]"
                    />
                  </motion.span>
                </motion.div>
              );
            })}

            {axis.map((segment, index) => (
              <span
                key={segment.from}
                className="absolute left-1/2 z-20 w-px -translate-x-1/2 bg-fd-foreground/12"
                style={{
                  top: onPlate(CENTER - segment.from),
                  height: onPlate(segment.from - segment.to),
                }}
              >
                <motion.span
                  initial={false}
                  animate={{
                    transform: phase >= index * 2 + 2 ? "scaleY(1)" : "scaleY(0)",
                  }}
                  transition={beat()}
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
              initial={false}
              animate={{
                opacity: phase >= FINAL_PHASE ? 1 : 0,
                transform:
                  phase >= FINAL_PHASE
                    ? "translate(-50%, -50%) scale(1)"
                    : "translate(-50%, -50%) scale(0.9)",
              }}
              transition={beat(0.2)}
              className="absolute left-1/2 z-40 size-2 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_11%,transparent)]"
              style={{ top: onPlate(CENTER - HUB_HALF) }}
            />
          </div>
        </div>

        <DialCaption boxRef={captionBox} phase={phase} />

        <AnimatePresence initial={false}>
          {leaderPath ? (
            <motion.svg
              key={leaderPath.key}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="pointer-events-none absolute inset-0 z-50 size-full overflow-visible"
            >
              {/* Butt caps, not round: a round cap adds half a stroke at the
                foot and would push the dash into the rail past the overlap the
                measurement chose. `d` and the dash are plain attributes — only
                opacity is animated, so nothing here asks Motion to interpolate
                a path. */}
              <path
                d={leaderPath.path}
                fill="none"
                stroke="var(--color-brand)"
                strokeDasharray={leaderPath.dash}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                strokeWidth={RAIL_STROKE}
              />
              {/* The only terminal. The caption end has none: it does not stop
                there, it becomes the rail. */}
              <circle
                cx={leaderPath.start[0]}
                cy={leaderPath.start[1]}
                r="3"
                fill="var(--color-brand)"
                stroke="var(--color-fd-card)"
                strokeWidth="2"
              />
            </motion.svg>
          ) : null}
        </AnimatePresence>
      </div>

      {/* The boundary, and the closing beat's whole content. Solid rule while
          the item is the author's, dashed once it is the kit's — the handoff is
          drawn, so the caption beside it never has to say it in words as well.

          It waits for the last coordinate to have been read. Arriving during a
          field chapter would assert a finished declaration over an instrument
          the reader has not been through yet; arriving here, it is the sentence
          after the last one.

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
        initial={false}
        animate={{
          opacity: phase >= FINAL_PHASE ? 1 : 0,
          transform: phase >= FINAL_PHASE ? "translateY(0%)" : "translateY(14%)",
        }}
        transition={beat(0.34)}
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

/**
 * The narration, immediately beneath the instrument it explains.
 *
 * A motion phase intentionally renders no caption. Once its ring settles, the
 * following reading phase leads with that field's name and declared value in
 * the mono face and ligature setting engraved on the ring. The sentence then
 * continues out of it, making the caption a consequence of the movement rather
 * than simultaneous commentary over it.
 *
 * `mode="wait"` runs the exit before the entrance, so each half gets its own
 * 180ms rather than making one swap feel twice as long.
 *
 * The height is held even while the page is blank so the card cannot resize as
 * motion and prose alternate. It is set from the tallest caption measured at
 * the narrowest width rather than from the longest source string.
 */
function DialCaption({
  phase,
  boxRef,
}: {
  phase: DialStoryPhase;
  boxRef: RefObject<HTMLDivElement | null>;
}) {
  const beat =
    phase === 1
      ? STORY[0]
      : phase === 3
        ? STORY[1]
        : phase === 5
          ? STORY[2]
          : phase === FINAL_PHASE
            ? STORY[3]
            : null;
  return (
    <div ref={boxRef} className="relative mt-5 min-h-[6.5rem] min-w-0 sm:min-h-[3.75rem]">
      <AnimatePresence mode="wait" initial={false}>
        {beat ? (
          <motion.div
            key={beat.lead}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute inset-0 flex items-center border-l border-brand pl-3"
          >
            <p className="text-sm leading-snug">
              {beat.mono ? (
                <span className="font-mono text-[13px] text-brand-hover [font-variant-ligatures:none]">
                  {beat.lead}
                </span>
              ) : (
                <span className="font-medium text-brand-hover">{beat.lead}.</span>
              )}{" "}
              <span className="text-fd-foreground">{beat.detail}</span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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
  const [storyPhase, setStoryPhase] = useState<DialStoryPhase>(0);
  const descriptionId = useId();

  // The run is owned by visibility, not by arrival: once the query has resolved
  // in favour of motion, the dial takes up frame one and holds it until half of
  // the card is on screen, wherever that happens. `once` on the observer and the
  // `run` guard are what make it exactly one automatic play — a later press is
  // the only other way the sequence starts.
  useEffect(() => {
    if (allowed !== true || !inView || run > 0) return;
    setStoryPhase(0);
    setRun(1);
  }, [allowed, inView, run]);

  // One timer at a time, holding the beat that is currently on screen, rather
  // than a fan of absolute offsets laid down at the start of the run. A beat's
  // the phase table is then the only place its duration is written, and a press
  // landing mid-narration cancels exactly one pending advance — which is why
  // `run` is a dependency here even though nothing reads it: without it, a replay
  // from the phase already showing would leave the previous timer standing.
  useEffect(() => {
    if (allowed !== true || run === 0) return;

    const hold = PHASE_HOLDS[storyPhase];
    if (hold === 0) return;

    const timer = window.setTimeout(() => {
      setStoryPhase((current) => Math.min(current + 1, FINAL_PHASE) as DialStoryPhase);
    }, hold);

    return () => window.clearTimeout(timer);
  }, [allowed, run, storyPhase]);

  const mode: Mode = allowed !== true ? "still" : run > 0 ? "play" : "armed";
  const played = run > 0;
  const label = played
    ? "Replay the authoring dial animation"
    : "Play the authoring dial animation";
  const Icon = played ? RotateCcw : Play;

  const plate = (
    <div key={run} aria-hidden="true" className="contents">
      <Dial mode={mode} storyPhase={storyPhase} />
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
            "An authoring dial. At its centre is an unchanged source file, panel.tsx. Three concentric rings carry the Mantine coordinates the author declares beside it, and none of them is inferred from the source. One at a time, a ring turns into register and its explanation appears before the next ring may move. The outer ring is mantine, a compatibility range of >=9 <10, which is checked against the project's installed Mantine before any file is written. The middle ring is stylesApi, a surface of three selectors: the parts consumers may restyle through classNames, while internal class names stay private. The inner ring is provider, required, so a project with no MantineProvider is warned at install. The axis traces from the outermost coordinate down to the source as those chapters resolve, reading as continuous only once all three have been read. The rail beneath marks the handoff: the author declares all three, and manteen-kit owns how the finished item travels."
          }
        </p>

        {allowed === true ? (
          <button
            type="button"
            aria-label={label}
            aria-describedby={descriptionId}
            title={label}
            onClick={() => {
              setStoryPhase(0);
              setRun((current) => current + 1);
            }}
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
