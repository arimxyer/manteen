"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * The rail's domain, in majors.
 *
 * It is a chosen fiction and worth naming as one: semver is not a linear scale,
 * so a patch has no representable width here. `9.4.2` is therefore *placed* at
 * 9.4 and *printed* in full beside the needle — the reader takes the exact
 * version from the readout, never by measuring it off the rail.
 */
const DOMAIN = { min: 8, max: 11 } as const;

const span = (from: number, to: number) =>
  `${(((to - from) / (DOMAIN.max - DOMAIN.min)) * 100).toFixed(3)}%`;

/** Distance from the rail's origin, as a percentage of its own width. */
const at = (version: number) => span(DOMAIN.min, version);

const BAND = { from: 9, to: 10 } as const;

/**
 * The consumer's side is the one thing on this plate that cannot be transcribed
 * from the repository — there is no real project to read — so it is invented
 * here and nowhere else. Everything the author declares (`>=9 <10`, `provider`,
 * `@mantine/core@^9`, the Styles API selectors) is the registry's own vocabulary.
 */
const INSTALLED = { display: "9.4.2", position: 9.4 } as const;

/**
 * The counterfactual, shown at rest rather than played.
 *
 * It earns its place because the band is only legible as a *gate* if something
 * visibly fails it, and it costs no time and no control: it is simply already
 * on the rail, muted and hollow, from the beat the envelope resolves.
 */
const REFUSED = { display: "10.1", position: 10.1 } as const;

const TICKS = [
  { version: 8, label: null },
  { version: 9, label: "9" },
  { version: 10, label: "10" },
  { version: 11, label: null },
] as const;

const DECLARED: [string, string][] = [
  ["requires", "MantineProvider"],
  ["packages", "@mantine/core@^9"],
];

const SELECTORS = ["root", "body", "actions"] as const;

export function OperatingEnvelopeVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.42) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  /** Reduced motion rests on the resolved plate, so every start value is its end value. */
  const from = (start: string, end: string) => (reduceMotion ? end : start);

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Operating envelope / 04
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">ReleasePanel</h2>
        </div>
        <span className="font-mono text-[10px] text-brand">DECLARED, NOT INFERRED</span>
      </header>

      <motion.div
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={enter(0.06, 0.3)}
        className="mx-auto mt-6 w-full max-w-md overflow-hidden rounded-xl border bg-fd-secondary shadow-inner"
        aria-hidden="true"
      >
        <div className="flex items-baseline justify-between border-b px-4 py-2 font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
          <span>Operating range</span>
          <span className="text-fd-foreground">mantine</span>
        </div>

        <div className="px-6 pt-4 pb-3">
          {/* One 5.5rem box holds the whole gauge, so the rail, the band, the
              needle and the ticks share a single coordinate space and no two of
              them can drift apart at a breakpoint. */}
          <div className="relative h-[5.5rem]">
            {/* Rail. */}
            <div className="absolute inset-x-0 top-[3.5rem] h-px bg-fd-border" />

            {/* The declared band straddles the rail. Its left edge is solid and
                its right edge dashed because `>=9` is inclusive and `<10` is
                not — but the distinction is never left to that drawing alone:
                the caption below prints the range as written. */}
            <motion.div
              initial={{ opacity: reduceMotion ? 1 : 0, transform: from("scaleX(0)", "scaleX(1)") }}
              animate={{ opacity: 1, transform: "scaleX(1)" }}
              transition={enter(0.4, 0.46)}
              // Tailwind has no per-side border-STYLE utility, so the open edge is
              // set here. `border-r-dashed` silently does nothing, and the failure
              // is invisible: the edge just renders solid and the range reads as
              // inclusive at both ends.
              style={{
                left: at(BAND.from),
                width: span(BAND.from, BAND.to),
                borderRightStyle: "dashed",
              }}
              className="absolute top-[2.875rem] h-[1.25rem] origin-left border-r-2 border-l-2 border-brand/70 bg-brand/10"
            />

            {TICKS.map((tick) => (
              <div key={tick.version}>
                <span
                  style={{ left: at(tick.version) }}
                  className="absolute top-[3.5rem] h-2 w-px -translate-x-1/2 bg-fd-border"
                />
                {tick.label === null ? null : (
                  <span
                    style={{ left: at(tick.version) }}
                    className="absolute top-[4.6rem] -translate-x-1/2 font-mono text-[10px] text-fd-muted-foreground"
                  >
                    {tick.label}
                  </span>
                )}
              </div>
            ))}

            {/* The version this plate refuses. Hollow, muted and outside the
                dashed edge — present from the resolve beat so the band reads as
                a gate, and never animated into position, which would cost the
                sequence a second act. */}
            <motion.span
              initial={{ opacity: reduceMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={enter(1.5, 0.3)}
              style={{ left: at(REFUSED.position) }}
              className="absolute top-[3.5rem] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-fd-muted-foreground/70 bg-fd-secondary"
            />

            {/* The needle. It sweeps the rail from the domain's origin and comes
                to rest inside the band; only the stem and the point travel, so
                nothing wide is in motion and nothing is clipped on the way. */}
            <motion.div
              initial={{
                transform: from("translateX(0.000%)", `translateX(${at(INSTALLED.position)})`),
              }}
              animate={{ transform: `translateX(${at(INSTALLED.position)})` }}
              transition={enter(0.86, 0.55)}
              className="absolute inset-y-0 left-0 w-full"
            >
              <span className="absolute top-[2rem] left-0 h-[1.5rem] w-px -translate-x-1/2 bg-brand/45" />
              <span className="absolute top-[3.5rem] left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_12%,transparent)]" />
            </motion.div>

            {/* The readout resolves after the needle settles, which is the order
                an instrument reads in: the pointer moves, then the value is
                legible. It is positioned rather than carried, so it never
                overhangs the plate mid-sweep. */}
            <motion.div
              initial={{ opacity: reduceMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={enter(1.34, 0.3)}
              style={{ left: at(INSTALLED.position) }}
              className="absolute top-0 w-44 -translate-x-1/2 text-center"
            >
              <span className="block font-mono text-[9px] tracking-[0.12em] text-fd-muted-foreground uppercase">
                your project
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-fd-foreground">
                @mantine/core {INSTALLED.display}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] text-brand">within range</span>
            </motion.div>
          </div>

          {/* Ligatures off, and not cosmetically: the mono face renders `>=` as a
              single `≥` glyph, so the range a reader might copy would appear as a
              character that is not in the file. */}
          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={enter(0.72, 0.3)}
            className="mt-3 flex items-baseline justify-between gap-3 font-mono text-[10px] [font-variant-ligatures:none]"
          >
            <span className="text-brand">&quot;mantine&quot;: &quot;&gt;=9 &lt;10&quot;</span>
            <span className="text-fd-muted-foreground">{REFUSED.display} · outside the range</span>
          </motion.div>
        </div>

        <motion.dl
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={enter(1.5, 0.32)}
          className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t px-4 py-3 font-mono text-[10px]"
        >
          {DECLARED.map(([term, detail]) => (
            <div key={term} className="contents">
              <dt className="tracking-[0.12em] text-fd-muted-foreground uppercase">{term}</dt>
              <dd className="text-fd-foreground">{detail}</dd>
            </div>
          ))}
        </motion.dl>

        {/* The exposed Styles API, drawn as a pinout: the one part of the plate
            that faces outward, hanging off the rule the way a part's pins do. */}
        <div className="border-t px-4 pt-3 pb-4">
          <p className="font-mono text-[10px] tracking-[0.12em] text-fd-muted-foreground uppercase">
            exposes
          </p>
          <div className="mt-2 flex items-start gap-6">
            {SELECTORS.map((selector, index) => (
              <motion.span
                key={selector}
                initial={{
                  opacity: reduceMotion ? 1 : 0,
                  transform: from("scaleY(0)", "scaleY(1)"),
                }}
                animate={{ opacity: 1, transform: "scaleY(1)" }}
                transition={enter(1.62 + index * 0.06, 0.28)}
                className="flex origin-top flex-col items-center gap-1"
              >
                <span className="h-3 w-px bg-brand/50" />
                <span className="font-mono text-[10px] text-fd-foreground">{selector}</span>
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={enter(1.76, 0.32)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        Authored Mantine facts give the surrounding source precise meaning — a range the client can
        measure a project against before it writes a file.
      </motion.p>

      <p className="sr-only">
        A spec plate for the ReleasePanel item. The author declares a Mantine compatibility range of
        greater than or equal to 9 and less than 10, drawn as a band on a version rail. A project
        running @mantine/core {INSTALLED.display} is measured against it and falls within range,
        while {REFUSED.display} sits outside the range and is refused. The plate also carries the
        facts the author declared alongside it: the item requires a MantineProvider, needs
        @mantine/core version ^9, and exposes the root, body and actions Styles API selectors. None
        of these are inferred from the source; each is written in the registry catalog.
      </p>
    </section>
  );
}
