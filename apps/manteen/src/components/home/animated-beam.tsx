"use client";

import { motion } from "motion/react";
import { type RefObject, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A wire between two elements, with a pulse that travels along it.
 *
 * Ported from Magic UI's `animated-beam` — MIT, fetched from their registry at
 * `https://magicui.design/r/animated-beam.json`, which is the same shadcn
 * interchange contract this project compiles to. Two things are theirs and are
 * the reason to port rather than to draw:
 *
 *   - **The path is measured, not authored.** Both endpoints are read with
 *     `getBoundingClientRect` relative to a container, so the wire follows the
 *     layout instead of encoding it, and a `ResizeObserver` re-measures. That is
 *     what lets the same diagram be rearranged without touching a coordinate.
 *   - **The pulse is a moving gradient, not a moving shape.** Stops slide across
 *     a `linearGradient` in user space, so one stroked path reads as something
 *     travelling along it.
 *
 * Three things are ours.
 *
 * **`play` gates the pulse.** Theirs repeats forever by default; a wire that
 * pulses at rest says "data is flowing" continuously, which is decoration. Here
 * the wire is always drawn — what connects to what is true whether or not
 * anything is moving — and it only pulses when a beat says so.
 *
 * **The gradient axis follows the wire.** Theirs sweeps horizontally, in
 * percentages of the viewport, which is correct for a row of nodes and silently
 * wrong for anything else: a vertical wire has both endpoints at one x, so its
 * whole length lights at once instead of a pulse travelling down it. Here the
 * axis is computed from the measured endpoints in absolute user units and swept
 * along the segment, so the pulse travels at any angle. The band leads with its
 * bright end, which is what makes it read as a head with a tail rather than as a
 * glowing stripe.
 *
 * **`useId()` is sanitised before it becomes a fragment identifier.** React wraps
 * it in delimiters — `:r0:` on 18, `«r0»` on 19 — and neither survives a
 * `url(#…)` reference: the paint server fails to resolve, the stroke falls back
 * to none, and the beam renders as nothing at all with no error anywhere. A
 * straight port draws its wires and never a pulse.
 *
 * Remounting restarts the pulse. A caller driving a sequence should key the beam
 * by its beat.
 */
export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 1.2,
  delay = 0,
  repeat = 1,
  repeatDelay = 0.25,
  play = false,
  pathWidth = 1.5,
}: {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  /** Extra passes after the first. `Infinity` is a marquee — use it deliberately. */
  repeat?: number;
  repeatDelay?: number;
  play?: boolean;
  pathWidth?: number;
}) {
  const id = `beam-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [pathD, setPathD] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ends, setEnds] = useState({ sx: 0, sy: 0, ex: 0, ey: 0 });

  useEffect(() => {
    const updatePath = () => {
      const container = containerRef.current;
      const from = fromRef.current;
      const to = toRef.current;
      if (!container || !from || !to) return;

      const box = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();

      setSize({ width: box.width, height: box.height });

      const sx = a.left - box.left + a.width / 2;
      const sy = a.top - box.top + a.height / 2;
      const ex = b.left - box.left + b.width / 2;
      const ey = b.top - box.top + b.height / 2;

      setEnds({ sx, sy, ex, ey });
      setPathD(`M ${sx},${sy} Q ${(sx + ex) / 2},${sy - curvature} ${ex},${ey}`);
    };

    const observer = new ResizeObserver(updatePath);
    if (containerRef.current) observer.observe(containerRef.current);
    updatePath();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, curvature]);

  // The pulse is a band of this fraction of the segment, swept from just before
  // one end to just past the other. `reverse` swaps which end it starts at; the
  // drawn path is untouched, because a wire has no direction and only its
  // traffic does.
  const BAND = 0.4;
  const [sx, sy] = reverse ? [ends.ex, ends.ey] : [ends.sx, ends.sy];
  const [ex, ey] = reverse ? [ends.sx, ends.sy] : [ends.ex, ends.ey];
  const at = (t: number) => ({ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t });

  const head = { from: at(0), to: at(1 + BAND) };
  const tail = { from: at(-BAND), to: at(1) };

  return (
    <svg
      fill="none"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none absolute top-0 left-0 transform-gpu", className)}
      aria-hidden="true"
    >
      {/* The wire itself, always drawn. What connects to what is a fact about
          the model rather than about the moment. */}
      <path
        d={pathD}
        stroke="var(--color-fd-muted-foreground)"
        strokeWidth={pathWidth}
        strokeOpacity={0.35}
        strokeLinecap="round"
      />

      {play ? (
        <>
          <path
            d={pathD}
            stroke={`url(#${id})`}
            strokeWidth={pathWidth + 0.5}
            strokeLinecap="round"
          />
          <defs>
            <motion.linearGradient
              id={id}
              className="transform-gpu"
              gradientUnits="userSpaceOnUse"
              initial={{ x1: head.from.x, y1: head.from.y, x2: tail.from.x, y2: tail.from.y }}
              animate={{
                x1: [head.from.x, head.to.x],
                y1: [head.from.y, head.to.y],
                x2: [tail.from.x, tail.to.x],
                y2: [tail.from.y, tail.to.y],
              }}
              // Linear, where theirs is easeOutExpo. That ease suits a beam that
              // loops forever — it gives each pass a departing snap. Played as a
              // step in an explanation it is wrong twice over: most of the travel
              // lands in the first fraction of the duration, so the part worth
              // watching is a blink, and a packet that decelerates does not read
              // as a packet. Constant speed reads as one thing going somewhere.
              transition={{ delay, duration, repeat, repeatDelay, ease: "linear" }}
            >
              <stop stopColor="var(--color-brand)" stopOpacity="0" />
              <stop stopColor="var(--color-brand)" />
              <stop offset="32.5%" stopColor="var(--color-brand)" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
            </motion.linearGradient>
          </defs>
        </>
      ) : null}
    </svg>
  );
}
