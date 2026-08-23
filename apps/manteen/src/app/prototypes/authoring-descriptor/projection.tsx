"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

type TimelineStep = {
  delay: number;
  duration: number;
  ease: readonly [number, number, number, number];
};

/* Causality first, comparison second. The rail descends before either project
   exists, both branches leave it on the SAME frame so neither destination can
   read as replacing the other, and the two roots then grow leftward from one
   shared edge so their difference is the only thing moving. No beat here
   reveals a fact the settled frame does not already state. */
const CAST_TIMELINE = {
  source: { delay: 0.06, duration: 0.42, ease: EASE_OUT },
  alias: { delay: 0.32, duration: 0.38, ease: EASE_OUT },
  rail: { delay: 0.6, duration: 0.5, ease: EASE_IN_OUT },
  branch: { delay: 1.02, duration: 0.26, ease: EASE_OUT },
  rule: { delay: 1.1, duration: 0.3, ease: EASE_OUT },
  map: { delay: 1.3, duration: 0.32, ease: EASE_OUT },
  name: { delay: 1.5, duration: 0.3, ease: EASE_OUT },
  root: { delay: 1.64, duration: 0.46, ease: EASE_IN_OUT },
  caption: { delay: 2.02, duration: 0.34, ease: EASE_OUT },
} satisfies Record<string, TimelineStep>;

const RULE_STAGGER = 0.045;

/* One constant in three places precisely because it is one string in all three:
   the authored alias tail and both resolved paths. Diverging copies would be
   the exact defect this panel claims cannot happen. */
const FILE_NAME = "release-panel.tsx";
const ALIAS_PREFIX = "@ui/";
const ALIAS_PATTERN = "@ui/*";

const consumers = [
  { project: "project A", pattern: "src/components/ui/*", root: "src/components/ui/" },
  { project: "project B", pattern: "app/ui/*", root: "app/ui/" },
] as const;

/* Table row geometry in px, measured up from the table's bottom edge, so the
   rail can meet each project header exactly without depending on anything
   above it in the flow. */
const HEADER_ROW = 24;
const PATH_ROW = 36;
const stubBottom = (index: number) =>
  (consumers.length - 1 - index) * (HEADER_ROW + PATH_ROW) + PATH_ROW + HEADER_ROW / 2;
const RAIL_END = stubBottom(consumers.length - 1);

export function ProjectionVariant({ reduceMotion }: { reduceMotion: boolean }) {
  /* One decision point for how motion is expressed. Under reduced motion every
     element mounts on its animate target (`initial={false}`), so the settled
     frame is the only frame that exists and no per-element entry state can
     drift away from the explanation it is supposed to end on. */
  const from = (enter: Record<string, string | number>) => (reduceMotion ? false : enter);
  const step = (movement: TimelineStep, offset = 0) => ({
    delay: reduceMotion ? 0 : movement.delay + offset,
    duration: reduceMotion ? 0 : movement.duration,
    ease: movement.ease,
  });

  /* The rule is drawn from inside the grid cells that sit on the column
     boundary, so the alignment it asserts is produced by layout rather than by
     trusting a monospace advance width to line three strings up by accident. */
  const rule = (index: number, tone = "bg-brand/70") => (
    <motion.span
      initial={from({ transform: "scaleY(0)" })}
      animate={{ transform: "scaleY(1)" }}
      transition={step(CAST_TIMELINE.rule, index * RULE_STAGGER)}
      className={`absolute inset-y-0 left-0 w-px origin-top ${tone}`}
    />
  );

  const station = (
    <span className="absolute top-1/2 -left-[1.1rem] hidden size-1.5 sm:block -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/70 bg-fd-secondary" />
  );

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Projected destination / 08
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            One declaration, two local paths.
          </h2>
        </div>
        <div className="shrink-0 text-right font-mono text-[9px] tracking-[0.1em] uppercase">
          <span className="block text-fd-muted-foreground">declared once</span>
          <span className="mt-0.5 block text-brand">resolved twice</span>
        </div>
      </header>

      <div
        className="relative mx-auto mt-4 flex h-[21rem] w-full max-w-md items-center overflow-hidden rounded-xl border bg-fd-secondary p-2 sm:p-4"
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] [background-size:24px_24px]" />
        <span className="absolute top-3 left-3 size-2 border-t border-l border-fd-muted-foreground/45" />
        <span className="absolute top-3 right-3 size-2 border-t border-r border-fd-muted-foreground/45" />
        <span className="absolute right-3 bottom-3 size-2 border-r border-b border-fd-muted-foreground/45" />
        <span className="absolute bottom-3 left-3 size-2 border-b border-l border-fd-muted-foreground/45" />

        {/* Every row is a two-cell row of one grid, so the authored alias tail
            and both resolved filenames share a single column boundary by
            construction. The card re-enters that boundary through subgrid. */}
        <div className="relative grid w-full grid-cols-[1fr_auto] sm:pl-8">
          <motion.span
            initial={from({ transform: "scaleY(0)" })}
            animate={{ transform: "scaleY(1)" }}
            transition={step(CAST_TIMELINE.rail)}
            style={{ bottom: `${RAIL_END}px` }}
            className="absolute top-2 left-[0.9rem] hidden w-px origin-top bg-brand/45 sm:block"
          />
          {consumers.map((consumer, index) => (
            <motion.span
              key={consumer.project}
              initial={from({ transform: "scaleX(0)" })}
              animate={{ transform: "scaleX(1)" }}
              transition={step(CAST_TIMELINE.branch)}
              style={{ bottom: `${stubBottom(index)}px` }}
              className="absolute left-[0.9rem] hidden h-px w-[1.1rem] origin-left bg-brand/60 sm:block"
            />
          ))}

          {/* 01 — authored, fixed */}
          <motion.div
            initial={from({ opacity: 0 })}
            animate={{ opacity: 1 }}
            transition={step(CAST_TIMELINE.source)}
            className="relative flex items-center gap-2 pb-2 font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] uppercase"
          >
            {station}
            <span className="text-brand">01</span>
            <span className="whitespace-nowrap text-fd-muted-foreground">authored — fixed</span>
          </motion.div>
          <div className="pb-2" />

          <motion.div
            initial={from({ opacity: 0, transform: "translateY(-7%)" })}
            animate={{ opacity: 1, transform: "translateY(0%)" }}
            transition={step(CAST_TIMELINE.source)}
            className="col-span-2 mb-5 grid grid-cols-subgrid rounded-lg border border-fd-foreground/25 bg-fd-card shadow-lg"
          >
            <div className="col-span-2 flex items-center justify-between gap-2 sm:gap-3 px-1.5 sm:px-3 pt-2.5 pb-2 font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] uppercase">
              <span className="hidden text-fd-muted-foreground sm:inline">authored item</span>
              <span className="text-fd-muted-foreground">
                as <span className="text-brand">component</span>
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 sm:gap-3 border-t border-fd-border py-2 pr-1.5 pl-1.5 sm:pr-2 sm:pl-3">
              <span className="font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] text-fd-muted-foreground uppercase">
                alias target
              </span>
              <motion.span
                initial={from({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={step(CAST_TIMELINE.alias)}
                className="font-mono text-[9px] sm:text-[11px] text-fd-foreground"
              >
                {ALIAS_PREFIX}
              </motion.span>
            </div>
            <div className="relative flex items-center border-t border-fd-border bg-brand/8 py-2 pr-2 pl-1.5 sm:pr-3 sm:pl-2">
              {rule(0)}
              <motion.span
                initial={from({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={step(CAST_TIMELINE.alias)}
                className="whitespace-nowrap font-mono text-[9px] sm:text-[11px] text-fd-foreground"
              >
                {FILE_NAME}
              </motion.span>
            </div>
          </motion.div>

          {/* 02 — transport, decides nothing */}
          <motion.div
            initial={from({ opacity: 0 })}
            animate={{ opacity: 1 }}
            transition={step(CAST_TIMELINE.rail, 0.16)}
            className="relative flex items-center gap-2 pr-2 pb-4 font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] text-fd-muted-foreground uppercase"
          >
            <span className="absolute top-[0.3rem] -left-[1.1rem] hidden size-1.5 sm:block -translate-x-1/2 rounded-full border border-fd-muted-foreground/60 bg-fd-secondary" />
            <span>02</span>
            <span className="h-px min-w-0 flex-1 border-t border-dashed border-fd-border" />
            <span className="whitespace-nowrap sm:hidden">manteen-kit</span>
            <span className="hidden whitespace-nowrap sm:inline">manteen-kit · unchanged</span>
          </motion.div>
          <div className="relative bg-brand/8 pb-4">{rule(1, "bg-brand/20")}</div>

          {/* 03 — resolved, one alias map per project */}
          <motion.div
            initial={from({ opacity: 0 })}
            animate={{ opacity: 1 }}
            transition={step(CAST_TIMELINE.rail, 0.3)}
            className="relative flex items-center gap-2 pb-2 font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] uppercase"
          >
            <span className="absolute top-[0.3rem] -left-[1.1rem] hidden size-1.5 sm:block -translate-x-1/2 rounded-full border border-brand/70 bg-fd-secondary" />
            <span className="text-brand">03</span>
            <span className="whitespace-nowrap text-fd-muted-foreground sm:hidden">
              resolved — per project
            </span>
            <span className="hidden whitespace-nowrap text-fd-muted-foreground sm:inline">
              resolved — each alias map decides
            </span>
          </motion.div>
          <div className="relative bg-brand/8 pb-2">{rule(2, "bg-brand/20")}</div>

          <div className="flex h-[1.125rem] items-end justify-end pr-1.5 text-[8px] sm:pr-2 leading-none sm:text-[9px] text-fd-muted-foreground">
            set by each project
          </div>
          <div className="relative flex h-[1.125rem] items-end bg-brand/8 pl-1.5 sm:pl-2">
            {rule(3)}
            <span className="absolute bottom-0 left-1.5 whitespace-nowrap sm:left-2 text-[8px] leading-none sm:text-[9px] text-fd-foreground">
              from the declaration
            </span>
          </div>

          {consumers.map((consumer, index) => (
            <div key={consumer.project} className="contents">
              <motion.div
                initial={from({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={step(CAST_TIMELINE.map)}
                className="flex h-6 items-center justify-between gap-2 sm:gap-3 border-t border-fd-border pr-1.5 pl-1.5 sm:pr-2 sm:pl-2"
              >
                <span className="font-mono text-[7px] tracking-[0.08em] sm:text-[8px] sm:tracking-[0.14em] text-fd-muted-foreground uppercase">
                  {consumer.project}
                </span>
                <span className="hidden font-mono text-[8px] text-fd-foreground sm:inline sm:text-[9px]">
                  <span className="text-fd-muted-foreground">{ALIAS_PATTERN} → </span>
                  {consumer.pattern}
                </span>
              </motion.div>
              <div className="relative h-6 border-t border-fd-border bg-brand/8">
                {rule(4 + index * 2)}
              </div>

              <div className="flex h-9 items-center justify-end pr-1.5 sm:pr-2">
                <motion.span
                  initial={from({ clipPath: "inset(0 0 0 100%)" })}
                  animate={{ clipPath: "inset(0 0 0 0%)" }}
                  transition={step(CAST_TIMELINE.root)}
                  className="block whitespace-nowrap font-mono text-[9px] sm:text-[11px] text-fd-foreground"
                >
                  {consumer.root}
                </motion.span>
              </div>
              <div className="relative flex h-9 items-center bg-brand/8 pl-1.5 sm:pl-2">
                {rule(5 + index * 2)}
                <motion.span
                  initial={from({ opacity: 0 })}
                  animate={{ opacity: 1 }}
                  transition={step(CAST_TIMELINE.name)}
                  className="block whitespace-nowrap font-mono text-[9px] sm:text-[11px] text-fd-foreground"
                >
                  {FILE_NAME}
                </motion.span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <motion.p
        initial={from({ opacity: 0, transform: "translateY(8%)" })}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={step(CAST_TIMELINE.caption)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        The authored file and its alias never change. Each project&rsquo;s alias map decides where
        that same file lands.
      </motion.p>

      {/* States the facts the illustration carries, not which labels it draws:
          several are `sm:`-only, and an equivalent that encodes layout goes
          stale the first time the layout responds. */}
      <p className="sr-only">
        One authored item is declared as a component with a single alias target,
        @ui/release-panel.tsx. manteen-kit carries that declaration to consumers unchanged and
        decides nothing about where it lands. Two consumer projects then resolve the same alias
        through their own alias maps: Project A maps @ui/* to src/components/ui/*, so the file lands
        at src/components/ui/release-panel.tsx, and Project B maps @ui/* to app/ui/*, so the same
        file lands at app/ui/release-panel.tsx. The filename release-panel.tsx is identical in the
        declaration and in both projects; only the prefix ahead of it differs, and each project sets
        that prefix itself. The registry declaration and its alias are stable; consumer alias
        configuration determines the local destination.
      </p>
    </section>
  );
}
