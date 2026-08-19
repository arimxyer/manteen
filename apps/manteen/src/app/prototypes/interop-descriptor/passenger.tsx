"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { InteropVariantProps } from "./types";

/**
 * Passenger — content that travels with no destination.
 *
 * The claim: everything in `files[]` acquires a destination in the consumer's
 * project and lands there; `meta.themeFragment` and `meta.usage` ride inside the
 * same document with no destination at all. The drawing is a carrier over a
 * project field, and the whole argument is one glyph row: a payload that leaves
 * carries a tick, a payload that stays carries a clasp.
 *
 * Every string is transcribed from the checked-in sources, not invented:
 *
 * - The subject is `@house/data-table`, the one catalog item declaring both
 *   `themeFragment` and `usage` (`manteen.registry.json`). Its two `files[]`
 *   entries, the fragment path and the usage path are that item's, and the
 *   compiled `public/r/data-table.json` carries them in exactly the two places
 *   drawn here — `files[]` and `meta`.
 * - The destinations come from `WIRE_TYPE_ALIAS` in the client's
 *   `config/aliases.ts` (`registry:ui` -> `ui`, `registry:hook` -> `hooks`) and
 *   the default aliases in `config/load.ts` (`@/components/ui`, `@/hooks`).
 * - The split of a landing into a directory (the field) and a filename (the
 *   carrier) is D2, not a layout convenience: only the BASENAME is placed under
 *   the alias. Reproducing the authored `registry/blocks/...` path there would
 *   put a `registry/` directory inside the consumer's `src/components/ui/`. The
 *   destination genuinely is the field's label plus the carrier's, composed.
 * - `src/lib/theme.ts` is the client's default `theme` (`config/load.ts`),
 *   written by `manteen init` when the project has none and kept when it has a
 *   mergeable one (`init/shared.ts`, `planTheme`). It is a file the project
 *   already owns in both branches, which is why it is drawn as the field's
 *   substrate rather than as a third landing. The fragment folds into it —
 *   D5/D6/D7 in `plan/theme-fold.ts` — rather than being installed.
 * - `usage` is inlined so a documentation client can render it and kept out of
 *   `files[]` so no client installs it (`toWireItem`). `manteen info` names it
 *   and `--usage` expands it (`commands/info.ts`).
 *
 * The illustration stops at *merged into a file you already own*. Insertion
 * order, `.extend()` composition, conflicts and never-merged callback fields are
 * real and are `theme-fold.ts`'s subject, not this card's.
 *
 * Two boundaries, both recorded as risks in the concept brief. It must not draw
 * a rail or a second project — that is Cast's question, one authored filename
 * reaching two consumer roots. And "no destination" must never read as
 * "dropped": every payload keeps its mark, at full strength, in the carrier at
 * every frame. A landing is an ADDITION in the field, never a removal above it,
 * and the tone rule is `brand` for a payload that lands and `foreground` for one
 * that stays — two full-strength colours, so the distinction is never carried by
 * fade, dashes or grey.
 */

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

type Beat = { delay: number; duration: number };

/**
 * Causality, in the order the client establishes it.
 *
 * The project exists before the document does, so the field and its substrate
 * have no entry beat at all — they are on screen at the first frame, which is
 * what lets `src/lib/theme.ts` read as a file being merged into rather than a
 * third thing that got installed. The carrier then arrives WHOLE, as one block:
 * a per-payload cascade would draw the payloads as arriving separately from the
 * document that carries them, and the invariant is that it arrives entire.
 *
 * Only then do destinations resolve, in the order the reading gets harder: the
 * two `files[]` entries land, the fragment folds into the substrate, and the
 * example is clasped. Nothing here reveals a fact the settled frame does not
 * already state.
 */
const TIMELINE = {
  carrier: { delay: 0.06, duration: 0.5 },
  landing: { delay: 0.66, duration: 0.36 },
  fold: { delay: 1.16, duration: 0.38 },
  clasp: { delay: 1.5, duration: 0.34 },
  caption: { delay: 1.82, duration: 0.32 },
} satisfies Record<string, Beat>;

const LANDING_STAGGER = 0.14;

/** The two readings of one document. Only `meta` is read differently. */
type Reading = "manteen" | "generic";

type Shape = "file" | "fragment" | "example";

/**
 * A payload mark, drawn rather than named. Outlines only, `currentColor`, so a
 * mark and its echo in the field are provably the same glyph at two tones.
 */
function Glyph({ shape, className }: { shape: Shape; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`size-5 shrink-0 fill-none stroke-current ${className ?? ""}`}
      strokeWidth={1.4}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {shape === "file" ? (
        <path d="M11.5 2.5H5a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5zm0 0v5h5" />
      ) : null}
      {shape === "fragment" ? (
        <>
          <rect x="2.5" y="3.5" width="12" height="5" rx="1.5" />
          <rect x="5.5" y="11.5" width="12" height="5" rx="1.5" />
        </>
      ) : null}
      {shape === "example" ? (
        <>
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
          <path d="M6.5 3.5v13M9.5 8h5M9.5 12h3" />
        </>
      ) : null}
    </svg>
  );
}

type Payload = {
  id: string;
  /** The group inside the document — the entire distinction rests on this. */
  group: "files[]" | "meta";
  shape: Shape;
  /** The basename the document carries. The directory belongs to the project. */
  name: string;
  /** What the payload does in each reading. `null` means it leaves the carrier. */
  stays: Record<Reading, string | null>;
};

const PAYLOADS: Payload[] = [
  {
    id: "ui",
    group: "files[]",
    shape: "file",
    name: "data-table.tsx",
    stays: { manteen: null, generic: null },
  },
  {
    id: "hook",
    group: "files[]",
    shape: "file",
    name: "use-data-table.ts",
    stays: { manteen: null, generic: null },
  },
  {
    id: "theme",
    group: "meta",
    shape: "fragment",
    name: "data-table.theme.ts",
    stays: { manteen: null, generic: "not read here" },
  },
  {
    id: "usage",
    group: "meta",
    shape: "example",
    name: "data-table.usage.tsx",
    stays: { manteen: "read by manteen info", generic: "not read here" },
  },
];

/**
 * The two new positions in the project, in carrier column order so a mark and
 * its echo share a grid column by construction rather than by a measured offset.
 * They are identical in both readings, and they are declared once so that
 * identity cannot be broken by editing one of two matching literals.
 */
const LANDINGS = [
  { id: "ui", shape: "file" as Shape, directory: "src/components/ui/" },
  { id: "hook", shape: "file" as Shape, directory: "src/hooks/" },
];

const SUBSTRATE = {
  path: "src/lib/theme.ts",
  state: { manteen: "yours · merged into", generic: "yours · untouched" },
} as const;

const READINGS: { id: Reading; label: string }[] = [
  { id: "manteen", label: "manteen" },
  { id: "generic", label: "any generic client" },
];

export function PassengerVariant({ reduceMotion, run }: InteropVariantProps) {
  const [reading, setReading] = useState<Reading>("manteen");

  /**
   * Arrival plays only for a reader who asked for it.
   *
   * `run` is zero on direct arrival and increments on explicit variant selection
   * or replay, so the first render — the one that would ship in the HTML — is the
   * complete settled truth and nothing moves. A mount-once timeline is still
   * autoplay; this keeps the contract the install terminal and the production
   * stage picker already hold, where only a state the reader chose animates.
   *
   * Reduced motion collapses to that same settled render rather than to a second
   * treatment of it. It is done here rather than with `MotionConfig
   * reducedMotion="user"`, which deliberately leaves opacity animating and would
   * still crossfade this card in.
   */
  const playing = run > 0 && !reduceMotion;
  const from = (enter: Record<string, string | number>) => (playing ? enter : false);
  const step = (beat: Beat, offset = 0) => ({
    delay: playing ? beat.delay + offset : 0,
    duration: playing ? beat.duration : 0,
    ease: EASE_OUT,
  });
  /**
   * The toggle is a state the reader chose at any point, so it crossfades on its
   * own clock — independent of `run`, and suppressed only by reduced motion.
   */
  const swap = { duration: reduceMotion ? 0 : 0.14, ease: EASE_OUT };

  return (
    <div className="flex w-full min-w-0 flex-col [font-variant-ligatures:none]">
      <header>
        <div className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-secondary-foreground uppercase">
            Arrival / one item document
          </p>

          {/* Two `aria-pressed` buttons rather than a radiogroup, matching the
              production stage picker: what they report is which reading is on
              screen, and pressed is exactly that. */}
          <div className="flex flex-row flex-wrap items-center gap-1.5">
            <span className="mr-0.5 font-mono text-[10px] tracking-[0.1em] text-fd-secondary-foreground uppercase">
              read by
            </span>
            {READINGS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={reading === option.id}
                onClick={() => setReading(option.id)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none motion-reduce:transition-none ${
                  reading === option.id
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-fd-border bg-fd-background text-fd-secondary-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <h2 className="mt-2 text-lg font-medium tracking-tight lg:text-xl">
          Everything arrives. Not everything lands.
        </h2>
      </header>

      {/* THE CARRIER. It enters as one object; its four marks never stagger,
          never move and never leave, in either reading. */}
      <motion.div
        key={`carrier-${run}`}
        initial={from({ opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        transition={step(TIMELINE.carrier)}
        className="mt-4 rounded-xl border bg-fd-secondary px-3 pt-2 pb-3"
      >
        <div className="mb-2.5 flex flex-row items-baseline justify-between gap-2">
          <code className="font-mono text-[11px]">data-table.json</code>
          <span className="font-mono text-[10px] tracking-[0.1em] text-fd-secondary-foreground uppercase">
            arrives whole
          </span>
        </div>

        {/* One grid, four columns, shared with the field below — that is what
            makes an echo read as belonging to a mark without drawing a line
            between them. The group rules are grid children too, so `files[]`
            spanning the first two columns is produced by layout rather than by
            trusting a width to land in the right place. */}
        <div className="grid grid-cols-4 gap-x-2 gap-y-1">
          <div className="col-span-2 flex flex-row items-center gap-1.5">
            <span className="h-px flex-1 bg-brand/40" />
            <code className="font-mono text-[10px] text-fd-foreground">files[]</code>
            <span className="h-px flex-1 bg-brand/40" />
          </div>
          <div className="col-span-2 flex flex-row items-center gap-1.5">
            <span className="h-px flex-1 bg-fd-foreground/25" />
            <code className="font-mono text-[10px] text-fd-foreground">meta</code>
            <span className="h-px flex-1 bg-fd-foreground/25" />
          </div>

          {PAYLOADS.map((payload) => {
            const stays = payload.stays[reading];
            return (
              <div key={payload.id} className="flex min-w-0 flex-col items-center gap-1">
                <span
                  className={`flex size-8 items-center justify-center rounded-lg border ${
                    stays === null
                      ? "border-brand/45 bg-brand/10 text-brand"
                      : "border-fd-foreground/25 bg-fd-background text-fd-foreground"
                  }`}
                >
                  <Glyph shape={payload.shape} />
                </span>
                <code className="min-h-[2.25rem] text-center font-mono text-[10px] leading-tight tracking-tight break-all text-fd-secondary-foreground sm:min-h-[1.5rem]">
                  {payload.name}
                </code>

                {/* The whole argument, in one glyph. A tick means this payload
                    acquires a destination below; a clasp means it is bound to
                    the carrier and goes nowhere. Same footprint either way, so
                    neither reads as the other's absence. */}
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={stays ?? "leaves"}
                    initial={from({ opacity: 0 })}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={swap}
                    className="flex w-full flex-col items-center"
                  >
                    {stays === null ? (
                      <svg
                        viewBox="0 0 16 12"
                        aria-hidden="true"
                        className="h-3 w-4 fill-none stroke-brand"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M8 0v7m0 4 3.5-4h-7z" />
                      </svg>
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 16 12"
                          aria-hidden="true"
                          className="h-3 w-8 fill-none stroke-fd-foreground"
                          strokeWidth={1.4}
                          strokeLinecap="round"
                          preserveAspectRatio="none"
                        >
                          <path d="M8 0v4M1 4h14M1 4v3M15 4v3" />
                        </svg>
                        <span className="mt-0.5 text-center font-mono text-[10px] leading-tight text-fd-foreground">
                          {stays}
                        </span>
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* THE PROJECT FIELD. One project. It is on screen before the carrier
          arrives, already holding its own theme file. */}
      <div className="mt-2.5 rounded-xl border bg-fd-background px-3 pt-2 pb-3">
        <div className="mb-2.5 flex flex-row items-baseline justify-between gap-2">
          <span className="font-mono text-[11px]">your project</span>
          <code className="font-mono text-[10px] text-fd-secondary-foreground">
            manteen add @house/data-table
          </code>
        </div>

        {/* Same four columns as the carrier, same gap, same content box — so an
            echo sits under its mark by construction. Columns three and four are
            deliberately empty: that emptiness is not a payload going missing,
            it is the two clasps above having nowhere to point. */}
        <div key={`landings-${run}`} className="grid grid-cols-4 gap-x-2 gap-y-1">
          {LANDINGS.map((landing, index) => (
            <motion.div
              key={landing.id}
              initial={from({ opacity: 0, y: -14 })}
              animate={{ opacity: 1, y: 0 }}
              transition={step(TIMELINE.landing, index * LANDING_STAGGER)}
              className="flex min-w-0 flex-col items-center gap-1"
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-brand/45 bg-brand/10 text-brand">
                <Glyph shape={landing.shape} />
              </span>
              <code className="min-h-[2.25rem] text-center font-mono text-[10px] leading-tight tracking-tight break-all text-fd-secondary-foreground sm:min-h-[1.5rem]">
                {landing.directory}
              </code>
              <span className="font-mono text-[10px] text-fd-foreground">written</span>
            </motion.div>
          ))}
        </div>

        {/* THE SUBSTRATE. A file the project already owns, spanning the field,
            present at the first frame and never animated in. The fold appears
            INSIDE it at column three — placed by the same four-column grid, so
            the alignment is produced rather than measured. */}
        <div className="mt-2.5 grid grid-cols-4 gap-x-2">
          <div className="col-span-4 col-start-1 row-start-1 h-9 rounded-lg border bg-fd-secondary" />
          {/* Two nested animations because two different clocks own this one
              element: the outer div owns ARRIVAL, on the timeline's fold beat
              and keyed to `run`; the inner div owns the READING, which the
              reader can change at any moment and which must not inherit a
              1.16s entry delay. Collapsing them into one `AnimatePresence`
              makes a toggle back to `manteen` wait out the arrival beat. */}
          <motion.div
            key={`fold-${run}`}
            initial={from({ opacity: 0, scaleX: 0.3 })}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={step(TIMELINE.fold)}
            className="col-start-3 row-start-1 m-1.5"
          >
            <motion.div
              animate={{ opacity: reading === "manteen" ? 1 : 0 }}
              transition={swap}
              className="flex h-full items-center justify-center rounded-md border border-brand/50 bg-brand/15 text-brand"
            >
              <Glyph shape="fragment" className="size-4" />
            </motion.div>
          </motion.div>
        </div>

        <div className="mt-1.5 flex flex-row flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <code className="font-mono text-[10px] text-fd-secondary-foreground">
            {SUBSTRATE.path}
          </code>
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={SUBSTRATE.state[reading]}
              initial={from({ opacity: 0 })}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={swap}
              className="font-mono text-[10px] text-fd-foreground"
            >
              {SUBSTRATE.state[reading]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* The unaware-client case, stated in the still rather than reachable only
          through the toggle. It is the concept's actual claim: enrichment is
          designed so the reader who cannot use it is not harmed by it. */}
      <motion.p
        key={`caption-${run}`}
        initial={from({ opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={step(TIMELINE.caption)}
        className="mt-2.5 text-[11px] leading-relaxed text-fd-secondary-foreground"
      >
        A client that has never heard of Mantine writes those same two files — and nothing else.
      </motion.p>
    </div>
  );
}
