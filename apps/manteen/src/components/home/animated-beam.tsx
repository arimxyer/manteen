"use client";

import { motion } from "motion/react";
import { type RefObject, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A wire between two elements, with a pulse that travels along it.
 *
 * Ported from Magic UI's `animated-beam` — MIT, fetched from their registry at
 * `https://magicui.design/r/animated-beam.json`, which is the same shadcn
 * interchange contract this project compiles to. Three things are theirs and are
 * kept exactly:
 *
 *   - **The path is measured, not authored.** Both endpoints are read with
 *     `getBoundingClientRect` relative to a container, so the wire follows the
 *     layout instead of encoding it. A `ResizeObserver` re-measures.
 *   - **The pulse is a moving gradient, not a moving shape.** Two stops slide
 *     across a `linearGradient` in user space, so a single stroked path reads as
 *     something travelling along it.
 *   - **`curvature` bends the quadratic control point**, which is what lets one
 *     wire arc over a node that sits between its endpoints.
 *
 * Two things are ours, and both are the difference between an ambient effect and
 * a step in an explanation:
 *
 *   - **`play` gates the pulse.** Theirs repeats forever by default; a wire that
 *     pulses at rest says "data is flowing" continuously, which is decoration.
 *     Here the wire is always drawn — the topology is true whether or not
 *     anything is moving along it — and only pulses when a step says it should.
 *   - **Colour comes from the theme.** `--color-brand` rather than a hard-coded
 *     pair, so the wire is the same accent as everything else on the page and
 *     follows the light/dark swap for free.
 *
 * Remounting restarts the pulse. A caller driving a sequence should key the beam
 * by its step.
 */
export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 1.8,
  delay = 0,
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
  play?: boolean;
  pathWidth?: number;
}) {
  // `useId()` is NOT usable as a fragment identifier as-is. React returns it
  // wrapped in delimiters — `:r0:` on 18, `«r0»` on 19 — and neither survives a
  // `url(#…)` reference: the paint server fails to resolve, the stroke falls back
  // to none, and the beam renders as nothing at all with no error anywhere. The
  // upstream component has this shape and it is why a straight port drew wires
  // and never a pulse.
  const id = `beam-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [pathD, setPathD] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

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

      const startX = a.left - box.left + a.width / 2;
      const startY = a.top - box.top + a.height / 2;
      const endX = b.left - box.left + b.width / 2;
      const endY = b.top - box.top + b.height / 2;
      const controlY = startY - curvature;

      setPathD(`M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`);
    };

    const observer = new ResizeObserver(updatePath);
    if (containerRef.current) observer.observe(containerRef.current);
    updatePath();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, curvature]);

  const gradient = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"] };

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
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{ x1: gradient.x1, x2: gradient.x2, y1: ["0%", "0%"], y2: ["0%", "0%"] }}
              // Linear, where theirs is easeOutExpo. That ease is right for a
              // beam that loops forever — it gives each pass a departing snap.
              // Played once as a step in an explanation it is wrong twice over:
              // the pulse covers most of the wire in the first fraction of the
              // duration, so the part a reader is meant to watch is a blink, and
              // a packet that decelerates does not read as a packet. Constant
              // speed reads as one thing travelling from here to there.
              transition={{ delay, duration, ease: "linear" }}
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
