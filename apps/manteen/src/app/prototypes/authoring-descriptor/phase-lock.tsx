"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/**
 * Variant 06 answers a different question from variant 04, deliberately.
 *
 * 04 (Operating envelope) is a *range*: one continuous rail, a declared band, and
 * a project placed inside or outside it. It answers "where does my project sit".
 * Drawing that twice — which is what this plate used to do, with a second version
 * rail stacked under the first — produced two pictures of one idea.
 *
 * 06 is the *gate*, and its subject is the branch, not the number. The authored
 * range never moves; what varies is what the client can actually read off a real
 * project, and each reading has its own outcome. Taken from the implementation
 * rather than paraphrased (`packages/cli/src/gates/mantine-version.ts`, D11):
 *
 *   found + satisfied     -> silence
 *   found + unsatisfied   -> `mantine-version-mismatch`, error, exit 1, forceable
 *   not-installed         -> `mantine-version-unknown`, warn, exit 0
 *   no-node-modules       -> `mantine-version-unknown`, warn, exit 0
 *   undeterminable        -> `mantine-version-unknown`, warn, exit 0
 *
 * So: five readings, one refusal, and that refusal is the only outcome a consumer
 * can override. The three indeterminate readings are drawn as three rows sharing
 * one verdict rather than collapsed into one row, because D11 names collapsing
 * them as actively wrong — under Yarn PnP the packages ARE installed, and a plate
 * that said "not installed" there would teach the reader the client's own
 * rejected alternative.
 */

/** The one authored fact on this plate. Everything else is a project condition. */
const DECLARED = ">=9 <10";

type Reading = {
  /** What the client read, in the client's own words. */
  state: string;
  /** Why this reading exists at all. Distinct per state — see D11. */
  note?: string;
  delay: number;
};

/**
 * The gate determined a version. Only these two readings reach a comparison, and
 * only the second one can stop the run.
 */
const DETERMINED: readonly Reading[] = [
  { state: "9.4.2", delay: 0.9 },
  { state: "10.1.0", delay: 1.03 },
] as const;

/**
 * No version to compare. Three different projects, three different remedies, one
 * shared verdict — which is exactly why they are three rows under one bracket
 * rather than one row.
 */
const UNDETERMINED: readonly Reading[] = [
  { state: "not installed", note: "the run installs it", delay: 1.27 },
  { state: "no node_modules", note: "nothing installed yet", delay: 1.37 },
  { state: "Yarn PnP", note: "packages kept in zips", delay: 1.47 },
] as const;

/** Travel time for a mark crossing its track, shared so the rows read as one instrument. */
const TRAVEL = 0.5;
/** A verdict resolves as its mark lands, not after it — the landing IS the cause. */
const LANDS = 0.42;

/**
 * Column geometry. The seam, every track's end, and the right-hand column all
 * derive from ONE number, so the gate cannot drift away from the tracks it gates
 * at any breakpoint. `MARK_OVERRUN` is how far past the seam a mark that was not
 * stopped comes to rest — the entire pass/refuse distinction is positional, so it
 * has to be a real measurement rather than a nudge.
 */
const VERDICT_COLUMN = "8rem";

/**
 * Brand, pulled toward the foreground for text that has to be READ rather than
 * merely seen.
 *
 * Measured: plain `text-brand` on this plate is 3.59:1 in light mode at 9px —
 * under AA, and the words carrying it here are a verdict and the authored range
 * itself. The mix moves toward whichever pole is high-contrast in the active
 * theme (ink in light, near-white in dark), so one value fixes both rather than
 * trading one theme's legibility for the other's.
 */
const BRAND_INK = "color-mix(in oklab, var(--color-brand) 78%, var(--color-fd-foreground))";
const MARK_OVERRUN = "1rem";

export function PhaseLockVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.34) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Phase comparator / 06
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">Only one reading can refuse.</h2>
        </div>
        <div className="text-right font-mono text-[9px] tracking-[0.1em] uppercase">
          <span className="block text-fd-muted-foreground">compatibility gate</span>
          <span className="mt-0.5 block text-brand">@mantine/core</span>
        </div>
      </header>

      <motion.div
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={enter(0.06, 0.3)}
        className="mx-auto mt-5 w-full max-w-md overflow-hidden rounded-xl border bg-fd-secondary shadow-inner"
        aria-hidden="true"
      >
        <div className="flex items-baseline justify-between border-b px-4 py-2 font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
          <span>Version gate</span>
          <span className="text-fd-foreground">5 readings</span>
        </div>

        {/* The padding lives on the outer box and the positioning on the inner one,
            so `right: VERDICT_COLUMN` measures from the same edge the rows' verdict
            column does. Positioning off a padded box puts the gate one padding-width
            away from the tracks it gates — and the drawing still looks plausible. */}
        <div className="px-4 pt-3 pb-4">
          <div className="relative">
            {/* The seam. It does not exist before the declaration does: it is drawn
              downward out of the chip, which is the causal claim this plate is
              making — the gate is the authored range, extended. */}
            <motion.span
              initial={{ transform: resting(reduceMotion, "scaleY(0)", "scaleY(1)") }}
              animate={{ transform: "scaleY(1)" }}
              transition={{
                delay: reduceMotion ? 0 : 0.52,
                duration: reduceMotion ? 0 : 0.54,
                ease: EASE_IN_OUT,
              }}
              style={{ right: VERDICT_COLUMN }}
              className="absolute top-[2.1rem] bottom-1 z-0 w-px origin-top translate-x-1/2 bg-brand/70 shadow-[0_0_14px_color-mix(in_oklab,var(--color-brand)_30%,transparent)]"
            />

            {/* The declaration, centred on the seam. Ligatures off, and not
              cosmetically: the mono face renders `>=` as a single `≥` glyph, so
              the range a reader might copy would appear as a character that is
              not in the file. */}
            <div className="relative h-[3.25rem]">
              <motion.span
                initial={{ opacity: reduceMotion ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={enter(0.26, 0.3)}
                className="absolute top-2 left-0 font-mono text-[8px] tracking-[0.12em] text-fd-muted-foreground uppercase"
              >
                the author
                <br />
                declares
              </motion.span>

              <motion.span
                initial={{
                  opacity: reduceMotion ? 1 : 0,
                  transform: resting(reduceMotion, "translate(50%, -18%)", "translate(50%, 0%)"),
                }}
                animate={{ opacity: 1, transform: "translate(50%, 0%)" }}
                transition={enter(0.26, 0.38)}
                style={{ right: VERDICT_COLUMN, color: BRAND_INK }}
                className="absolute top-1.5 border border-brand/55 bg-fd-card px-2 py-1 font-mono text-[10px] shadow-sm [font-variant-ligatures:none]"
              >
                &quot;requires&quot;: &quot;{DECLARED}&quot;
              </motion.span>
            </div>

            <GroupLabel delay={0.78} reduceMotion={reduceMotion} label="version read from disk" />

            {DETERMINED.map((reading, index) => (
              <Row
                key={reading.state}
                reading={reading}
                reduceMotion={reduceMotion}
                refused={index === 1}
              >
                {index === 0 ? (
                  <Verdict
                    delay={reading.delay + LANDS}
                    reduceMotion={reduceMotion}
                    word="satisfies"
                    detail="nothing printed"
                  />
                ) : (
                  <Verdict
                    delay={reading.delay + LANDS + 0.06}
                    reduceMotion={reduceMotion}
                    word="refuses"
                    detail="exit 1 · --force"
                    stamped
                  />
                )}
              </Row>
            ))}

            <GroupLabel delay={1.15} reduceMotion={reduceMotion} label="no version to read" />

            {/* The three indeterminate readings share one verdict, so they share one
              bracket. Drawing three copies of `warns · exit 0` would make the
              plate's strongest fact — that a whole class of readings cannot stop
              anything — read as three coincidences. */}
            <div className="relative">
              {UNDETERMINED.map((reading) => (
                <Row key={reading.state} reading={reading} reduceMotion={reduceMotion} dashed />
              ))}

              <div
                style={{ width: VERDICT_COLUMN }}
                className="absolute inset-y-0 right-0 flex items-center"
              >
                <motion.span
                  initial={{ transform: resting(reduceMotion, "scaleY(0)", "scaleY(1)") }}
                  animate={{ transform: "scaleY(1)" }}
                  transition={enter(1.91, 0.3)}
                  style={{ marginLeft: MARK_OVERRUN }}
                  className="w-px origin-center self-stretch bg-brand/50"
                />
                <Verdict
                  delay={1.99}
                  reduceMotion={reduceMotion}
                  word="warns"
                  detail="exit 0 · continues"
                  plain
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.p
        initial={{
          opacity: reduceMotion ? 1 : 0,
          transform: resting(reduceMotion, "translateY(10%)", "translateY(0%)"),
        }}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={enter(2.16, 0.34)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        You declare the range once. The client refuses only where it can prove a conflict — and that
        single refusal is the one outcome a consumer can override.
      </motion.p>

      <p className="sr-only">
        A comparator plate for the authored Mantine compatibility range greater than or equal to 9
        and less than 10. The range is declared once, and a vertical gate line is drawn down from
        it. Five readings of a real project are measured against that gate. Where the installed
        version is read from disk, 9.4.2 satisfies the range and the gate prints nothing, while
        10.1.0 conflicts with it and is stopped: that reading is an error, exits 1, and is the only
        outcome that can be overridden with the force flag. Where there is no version to read —
        Mantine not installed, no node_modules directory, or Yarn Plug and Play keeping packages in
        zip archives — all three readings share one verdict: the gate warns, exits 0, and cannot
        refuse. Each of those three has its own remedy, so they are reported separately and never
        collapsed into one. The authored range never changes across the five readings; only what the
        project can say back does.
      </p>
    </section>
  );
}

function GroupLabel({
  label,
  delay,
  reduceMotion,
}: {
  label: string;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.p
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : 0.3,
        ease: EASE_OUT,
      }}
      // The reservation is the invariant, not the look: a group label is the one
      // element wide enough to reach the gate column, and at narrow widths it
      // would otherwise pass behind the gate line instead of stopping short of it.
      style={{ paddingRight: VERDICT_COLUMN }}
      className="mt-3 mb-1.5 font-mono text-[8px] tracking-[0.14em] text-fd-muted-foreground uppercase"
    >
      {label}
    </motion.p>
  );
}

/**
 * One reading: its evidence on the left, its track through the gate, its verdict
 * on the right.
 *
 * The whole grammar of the plate is in where a mark comes to rest. A mark that
 * was not stopped rests `MARK_OVERRUN` PAST the seam; the one mark the gate
 * refuses rests flush against it, behind an opaque stop bar that appears on
 * contact. The gate is a thin line everywhere and becomes a wall in exactly one
 * place — the place where it can prove a conflict.
 */
function Row({
  reading,
  reduceMotion,
  refused = false,
  dashed = false,
  children,
}: {
  reading: Reading;
  reduceMotion: boolean;
  refused?: boolean;
  dashed?: boolean;
  children?: ReactNode;
}) {
  const travel = {
    delay: reduceMotion ? 0 : reading.delay,
    duration: reduceMotion ? 0 : TRAVEL,
    ease: EASE_OUT,
  };

  return (
    <div className="relative flex items-center py-1">
      <motion.div
        initial={{
          opacity: reduceMotion ? 1 : 0,
          transform: reduceMotion ? "translateX(0%)" : "translateX(-8%)",
        }}
        animate={{ opacity: 1, transform: "translateX(0%)" }}
        transition={{
          delay: reduceMotion ? 0 : reading.delay - 0.1,
          duration: reduceMotion ? 0 : 0.3,
          ease: EASE_OUT,
        }}
        className="w-[7rem] shrink-0 pr-3 text-right"
      >
        <span className="block font-mono text-[9px] leading-tight text-fd-foreground">
          {reading.state}
        </span>
        {reading.note === undefined ? null : (
          // Not `text-fd-muted-foreground`: measured 4.22:1 over this plate in
          // light mode, under AA at 7px. These two lines carry the remedy and the
          // exit code, so they are the last text on the plate that may be soft.
          <span className="mt-0.5 block font-mono text-[7px] leading-tight text-fd-foreground/70">
            {reading.note}
          </span>
        )}
      </motion.div>

      {/* The track. Solid where the client has a fact; dashed where it has none.
          It fades in with its own reading rather than being painted at load:
          five tracks and five parked marks standing on an otherwise empty plate
          is a skeleton, and a skeleton is the one state this plate must never
          show — it reads as the instrument, not as anything the client did. */}
      <motion.div
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: reduceMotion ? 0 : reading.delay - 0.1,
          duration: reduceMotion ? 0 : 0.3,
          ease: EASE_OUT,
        }}
        className="relative h-5 min-w-0 flex-1"
      >
        {/* The line itself is the statement: it runs past the gate to where its
            mark comes to rest, and is cut off AT the gate for the one reading the
            gate stops. Nothing else in the row has to carry that difference. */}
        <span
          style={{ right: refused ? 0 : `calc(-1 * ${MARK_OVERRUN})` }}
          className={`absolute top-1/2 left-0 border-t ${
            dashed ? "border-dashed border-fd-foreground/30" : "border-fd-foreground/25"
          }`}
        />

        {/* Contact, registered on the gate rather than on the mark: the wall does
            not move, it asserts. Scaling from the seam outward means the bar can
            only ever grow along the line it belongs to. */}
        {refused ? (
          <motion.span
            initial={{
              opacity: reduceMotion ? 1 : 0,
              transform: reduceMotion ? "translateX(50%) scaleY(1)" : "translateX(50%) scaleY(0.3)",
            }}
            animate={{ opacity: 1, transform: "translateX(50%) scaleY(1)" }}
            transition={{
              delay: reduceMotion ? 0 : reading.delay + 0.44,
              duration: reduceMotion ? 0 : 0.18,
              ease: EASE_OUT,
            }}
            className="absolute inset-y-0 right-0 z-20 w-[3px] origin-center bg-fd-foreground"
          />
        ) : null}

        {/* The mark travels its own track width. `MARK_OVERRUN` is added to the
            carrier, not to the animation, so "crossed the gate" is a layout fact
            that survives every viewport rather than a hand-tuned offset. */}
        <motion.div
          initial={{ transform: resting(reduceMotion, "translateX(0%)", "translateX(100%)") }}
          animate={{
            transform: reduceMotion
              ? "translateX(100%)"
              : // Overshoot then settle, only where something is hit. The final
                // keyframe is the resting value, so a reduced-motion snap and a
                // played run agree by construction.
                refused
                ? ["translateX(0%)", "translateX(101%)", "translateX(100%)"]
                : "translateX(100%)",
          }}
          transition={refused && !reduceMotion ? { ...travel, times: [0, 0.88, 1] } : travel}
          style={{ width: refused ? "100%" : `calc(100% + ${MARK_OVERRUN})` }}
          className="absolute inset-y-0 left-0 z-10"
        >
          <span
            className={`absolute top-1/2 left-0 -translate-y-1/2 ${
              refused
                ? "size-1.5 -translate-x-[calc(100%+2px)] bg-fd-foreground"
                : dashed
                  ? "size-1.5 -translate-x-1/2 rounded-full border border-dashed border-fd-foreground/70 bg-fd-secondary"
                  : "size-1.5 -translate-x-1/2 rounded-full bg-fd-foreground"
            }`}
          />
        </motion.div>
      </motion.div>

      <div style={{ width: VERDICT_COLUMN }} className="shrink-0">
        {children}
      </div>
    </div>
  );
}

/** Reduced motion rests on the resolved plate, so every start value is its end value. */
function resting(reduceMotion: boolean, start: string, end: string) {
  return reduceMotion ? end : start;
}

/**
 * A verdict. Three levels, and none of them needs a colour this palette does not
 * have: the pass is brand, the warn is plain ink, and the single refusal is the
 * only stamped element on the plate.
 */
function Verdict({
  word,
  detail,
  delay,
  reduceMotion,
  stamped = false,
  plain = false,
}: {
  word: string;
  detail: string;
  delay: number;
  reduceMotion: boolean;
  stamped?: boolean;
  plain?: boolean;
}) {
  return (
    <motion.div
      initial={{
        opacity: reduceMotion ? 1 : 0,
        transform: reduceMotion ? "translateX(0%)" : "translateX(-6%)",
      }}
      animate={{ opacity: 1, transform: "translateX(0%)" }}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : 0.28,
        ease: EASE_OUT,
      }}
      className="pl-6"
    >
      {stamped ? (
        <span className="inline-block bg-fd-foreground px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-fd-background uppercase">
          {word}
        </span>
      ) : (
        <span
          style={plain ? undefined : { color: BRAND_INK }}
          className={`block font-mono text-[9px] leading-tight ${plain ? "text-fd-foreground" : ""}`}
        >
          {word}
        </span>
      )}
      <span className="mt-0.5 block font-mono text-[7px] leading-tight text-fd-foreground/70 [font-variant-ligatures:none]">
        {detail}
      </span>
    </motion.div>
  );
}
