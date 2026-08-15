import type { CSSProperties, ReactNode } from "react";
import styles from "@/components/home/entrance.module.css";
import { cn } from "@/lib/cn";

/**
 * One step of the hero's entrance: it fades and lifts into place on load.
 *
 * Deliberately not a client component, and deliberately not `motion`. The whole
 * animation is a CSS keyframe on a timer, so the hero stays server-rendered and ships
 * no JavaScript for it — the entrance is already running while a client bundle would
 * still be arriving. `Reveal` is the counterpart for anything below the fold, where the
 * trigger is a viewport intersection and JavaScript is unavoidable.
 *
 * Give the wrapper the spacing that positioned the child, not the child. It becomes the
 * flex item, so `mt-auto` left on the child would no longer push anything, and a margin
 * left on the child would collapse through this element rather than sit inside it.
 */
export function Rise({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds after load. Steps read in the order they are staggered. */
  delay?: number;
}) {
  return (
    <div
      className={cn(styles.rise, className)}
      style={{ "--rise-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
