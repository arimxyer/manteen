/**
 * Class strings the home page's sections share.
 *
 * They live here rather than beside any one section because every one of them
 * has several consumers — a card class copied into six files drifts in five of
 * them, and nothing type-checks the intent. Anything used by exactly one
 * section stays in that section's file.
 */

export const primaryButton =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-medium tracking-tight text-brand-foreground transition-colors hover:bg-brand-hover";

export const secondaryButton =
  "group inline-flex items-center justify-center gap-2 rounded-full border bg-fd-secondary px-5 py-3 font-medium tracking-tight text-fd-secondary-foreground transition-colors hover:bg-fd-accent";

/**
 * The trailing arrow on anything that leads somewhere. It nudges toward where it points
 * on hover, which is why every one of those three classes above opens a `group`.
 *
 * `motion-safe` rather than an unconditional transform: the nudge is decoration, and a
 * reader who asked for less motion is not asking to lose the arrow, only its travel.
 */
export const arrowIcon =
  "size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5";

export const card = "rounded-2xl border bg-fd-card p-6 text-sm shadow-lg";

/**
 * Each band owns its own two-column grid. A shared outer grid would scope a
 * band's `row-start` to the page rather than to the band, which silently
 * overlaps neighbours.
 */
export const band = "grid grid-cols-1 gap-10 lg:grid-cols-2";

export const h2 = "text-3xl font-medium tracking-tight lg:text-4xl";
export const h3 = "text-xl font-medium tracking-tight lg:text-2xl";

export const textLink =
  "group inline-flex items-center gap-1.5 font-medium text-brand transition-opacity hover:opacity-70";
