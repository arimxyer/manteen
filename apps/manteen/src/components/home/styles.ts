/**
 * Class strings the home page's sections share.
 *
 * They live here rather than beside any one section because every one of them
 * has several consumers — a card class copied into six files drifts in five of
 * them, and nothing type-checks the intent. Anything used by exactly one
 * section stays in that section's file.
 */

export const primaryButton =
  "home-primary-button home-directional-link inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-medium tracking-tight text-brand-foreground transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100";

export const secondaryButton =
  "home-secondary-button inline-flex items-center justify-center gap-2 rounded-full border bg-fd-secondary px-5 py-3 font-medium tracking-tight text-fd-secondary-foreground transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100";

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
  "home-text-link home-directional-link inline-flex items-center gap-1.5 font-medium text-brand transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";
