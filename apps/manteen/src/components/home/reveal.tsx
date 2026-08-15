"use client";

import { useInView } from "motion/react";
import { type ReactNode, useRef } from "react";
import styles from "@/components/home/entrance.module.css";
import { cn } from "@/lib/cn";

/**
 * A section settling into place the first time it is scrolled to.
 *
 * This takes only the trigger from `motion` and leaves the animation to CSS, which is
 * the opposite of the obvious arrangement and is deliberate — see the note in
 * `entrance.module.css` for what animating it in JavaScript actually did to the lift.
 * The trigger is the half that genuinely needs JavaScript, and `useInView` is a viewport
 * observer with the `once` semantics already written.
 *
 * `once` matters more than it looks: a section that re-animates every time it re-enters
 * the viewport turns an entrance into a fidget, and it is the difference between this
 * reading as considered and reading as decoration.
 *
 * Children arrive from server components and stay server-rendered — the boundary is this
 * wrapper alone, which is why sections holding RSC-only pieces can still be wrapped.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  /* A section is announced once a sixth of it has arrived, so the reveal is finishing as
     the reader reaches it rather than starting when they already have. */
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <div ref={ref} className={cn(styles.reveal, inView && styles.revealed, className)}>
      {children}
    </div>
  );
}
