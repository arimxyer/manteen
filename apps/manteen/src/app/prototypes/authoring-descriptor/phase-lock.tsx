"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const LOCK_TIMELINE = {
  envelope: { delay: 0.12, duration: 0.7, ease: EASE_IN_OUT },
  sample: { delay: 0.58, duration: 0.62, ease: EASE_IN_OUT },
  compare: { delay: 1.16, duration: 0.46, ease: EASE_IN_OUT },
  lock: { delay: 1.48, duration: 0.34, ease: EASE_OUT },
  facts: { delay: 1.8, duration: 0.34, stagger: 0.09, ease: EASE_OUT },
  caption: { delay: 2.12, duration: 0.34, ease: EASE_OUT },
} as const;

const facts = [
  ["provider", "MantineProvider"],
  ["packages", "@mantine/core@^9"],
  ["styles API", "root · body · actions"],
] as const;

const sampleTicks = [6, 14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94] as const;

type TimelineStep = {
  delay: number;
  duration: number;
  ease: readonly [number, number, number, number];
};

export function PhaseLockVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const transition = (step: TimelineStep, offset = 0) => ({
    delay: reduceMotion ? 0 : step.delay + offset,
    duration: reduceMotion ? 0 : step.duration,
    ease: step.ease,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Phase comparator / 06
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">Compatibility, registered.</h2>
        </div>
        <div className="text-right font-mono text-[9px] tracking-[0.1em] uppercase">
          <span className="block text-fd-muted-foreground">project sample</span>
          <span className="mt-0.5 block text-brand">Mantine 9.4.2</span>
        </div>
      </header>

      <div
        className="relative mx-auto mt-5 h-[20rem] w-full max-w-md overflow-hidden rounded-xl border bg-fd-secondary"
        aria-hidden="true"
      >
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] [background-size:24px_24px]" />
        <span className="absolute top-3 left-3 size-2 border-t border-l border-fd-muted-foreground/45" />
        <span className="absolute top-3 right-3 size-2 border-t border-r border-fd-muted-foreground/45" />
        <span className="absolute right-3 bottom-3 size-2 border-r border-b border-fd-muted-foreground/45" />
        <span className="absolute bottom-3 left-3 size-2 border-b border-l border-fd-muted-foreground/45" />

        <div className="absolute inset-x-4 top-3 flex items-center justify-between font-mono text-[8px] tracking-[0.14em] uppercase">
          <span className="text-fd-muted-foreground">Compatibility registration plate</span>
          <span className="text-brand">sequence 01—03</span>
        </div>

        <div className="absolute inset-x-4 top-10 h-[4.5rem]">
          <SignalLabel index="01" name="Catalog field" kind="declared envelope" tone="brand" />

          <div className="absolute inset-x-0 bottom-0 h-8 border-y border-fd-border/80 bg-fd-card/45">
            <span className="absolute top-0 bottom-0 left-[22%] border-l border-dashed border-fd-muted-foreground/45" />
            <span className="absolute top-0 bottom-0 left-[58%] border-l border-fd-foreground/25" />
            <span className="absolute top-0 bottom-0 left-[86%] border-l border-dashed border-fd-muted-foreground/45" />
            <span className="absolute -bottom-3 left-[22%] -translate-x-1/2 font-mono text-[7px] text-fd-muted-foreground">
              9.0
            </span>
            <span className="absolute -bottom-3 left-[86%] -translate-x-1/2 font-mono text-[7px] text-fd-muted-foreground">
              10.0
            </span>

            <motion.div
              initial={{
                opacity: reduceMotion ? 1 : 0.34,
                transform: reduceMotion ? "scaleX(1)" : "scaleX(0.08)",
              }}
              animate={{ opacity: 1, transform: "scaleX(1)" }}
              transition={transition(LOCK_TIMELINE.envelope)}
              className="absolute inset-y-1 left-[22%] w-[64%] origin-left border-x border-brand/60 bg-brand/12 [background-image:repeating-linear-gradient(115deg,transparent_0,transparent_7px,color-mix(in_oklab,var(--color-brand)_18%,transparent)_7px,color-mix(in_oklab,var(--color-brand)_18%,transparent)_8px)]"
            >
              <span className="absolute inset-x-1 top-1/2 border-t border-brand/55" />
              <span className="absolute top-1/2 left-1.5 -translate-y-1/2 font-mono text-[8px] tracking-[0.08em] text-brand uppercase">
                &gt;=9 · &lt;10
              </span>
            </motion.div>
          </div>
        </div>

        <div className="absolute inset-x-4 top-[8.75rem] h-[4.5rem]">
          <SignalLabel index="02" name="Client field" kind="observed sample" tone="neutral" />

          <div className="absolute inset-x-0 bottom-0 h-8 border-y border-fd-border/80 bg-fd-card/70">
            <span className="absolute inset-x-0 top-1/2 border-t border-fd-foreground/20" />
            {sampleTicks.map((position) => (
              <span
                key={position}
                className="absolute top-1/2 h-1.5 border-l border-fd-foreground/25"
                style={{ left: `${position}%` }}
              />
            ))}

            <motion.div
              initial={{
                opacity: reduceMotion ? 1 : 0.38,
                transform: reduceMotion
                  ? "translateX(-50%) scaleY(1)"
                  : "translateX(72px) scaleY(0.12)",
              }}
              animate={{ opacity: 1, transform: "translateX(-50%) scaleY(1)" }}
              transition={transition(LOCK_TIMELINE.sample)}
              className="absolute -top-2 bottom-0 left-[58%] z-10 w-px origin-bottom bg-fd-foreground shadow-[0_0_12px_color-mix(in_oklab,var(--color-fd-foreground)_25%,transparent)]"
            >
              <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border border-fd-foreground/70 bg-fd-card" />
              <span className="absolute top-1 -left-1.5 w-3 border-t border-fd-foreground/45" />
            </motion.div>

            <motion.span
              initial={{
                opacity: reduceMotion ? 1 : 0.38,
                transform: reduceMotion ? "translate(0%, -50%)" : "translate(28%, -50%)",
              }}
              animate={{ opacity: 1, transform: "translate(0%, -50%)" }}
              transition={transition(LOCK_TIMELINE.sample, 0.08)}
              className="absolute top-1/2 left-[61%] border-l border-fd-foreground/20 pl-2 font-mono text-[8px] text-fd-foreground"
            >
              9.4.2
            </motion.span>
          </div>
        </div>

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0.2,
            transform: reduceMotion
              ? "translateX(-50%) scaleY(1)"
              : "translateX(-50%) scaleY(0.06)",
          }}
          animate={{ opacity: 1, transform: "translateX(-50%) scaleY(1)" }}
          transition={transition(LOCK_TIMELINE.compare)}
          className="absolute top-[4.1rem] left-[58%] z-10 h-[8.9rem] w-px origin-center bg-brand shadow-[0_0_18px_2px_color-mix(in_oklab,var(--color-brand)_38%,transparent)]"
        />

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0.28,
            transform: reduceMotion
              ? "translate(-50%, -50%) rotate(0deg) scale(1)"
              : "translate(-50%, -50%) rotate(-45deg) scale(0.92)",
          }}
          animate={{
            opacity: 1,
            transform: "translate(-50%, -50%) rotate(0deg) scale(1)",
          }}
          transition={transition(LOCK_TIMELINE.lock)}
          className="absolute top-[8.2rem] left-[58%] z-20 flex size-7 items-center justify-center border border-brand/60 bg-fd-card shadow-[0_0_22px_color-mix(in_oklab,var(--color-brand)_28%,transparent)]"
        >
          <span className="size-1.5 rotate-45 bg-brand" />
        </motion.div>

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0.25,
            transform: reduceMotion ? "translateX(0%)" : "translateX(16%)",
          }}
          animate={{ opacity: 1, transform: "translateX(0%)" }}
          transition={transition(LOCK_TIMELINE.lock, 0.08)}
          className="absolute top-[7.25rem] right-4 z-20 border border-brand/45 bg-fd-card px-2 py-1 font-mono text-[8px] tracking-[0.1em] uppercase shadow-sm"
        >
          <span className="text-brand">lock 9.4.2</span>
          <span className="mx-1.5 text-fd-border">/</span>
          <span className="text-fd-foreground">compatible</span>
        </motion.div>

        <div className="absolute inset-x-4 bottom-4 border-t border-brand/35 pt-2.5">
          <div className="mb-2 flex items-center justify-between font-mono text-[8px] tracking-[0.12em] uppercase">
            <span className="text-brand">03 · declared facts resolve</span>
            <span className="text-fd-muted-foreground">after compatibility</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {facts.map(([term, value], index) => (
              <motion.div
                key={term}
                initial={{
                  opacity: reduceMotion ? 1 : 0.18,
                  transform: reduceMotion ? "translateY(0%)" : "translateY(22%)",
                }}
                animate={{ opacity: 1, transform: "translateY(0%)" }}
                transition={transition(LOCK_TIMELINE.facts, index * LOCK_TIMELINE.facts.stagger)}
                className="min-w-0 border-l border-fd-border pl-2 first:border-brand/60"
              >
                <span className="block font-mono text-[7px] tracking-[0.1em] text-fd-muted-foreground uppercase">
                  {term}
                </span>
                <span className="mt-1 block font-mono text-[8px] leading-tight text-fd-foreground sm:text-[9px]">
                  {value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <motion.p
        initial={{
          opacity: reduceMotion ? 1 : 0.24,
          transform: reduceMotion ? "translateY(0%)" : "translateY(10%)",
        }}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={transition(LOCK_TIMELINE.caption)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        The catalog declares a Mantine envelope. The client places 9.4.2 against it; only a
        compatible lock resolves the provider, package, and Styles API declarations.
      </motion.p>

      <p className="sr-only">
        A scientific registration plate compares two distinct fields. The catalog field declares a
        Mantine compatibility envelope greater than or equal to 9 and less than 10. The client field
        places an observed project sample at Mantine 9.4.2. A vertical registration seam locks the
        sample inside the envelope as compatible. Only after that lock do the declared
        MantineProvider, package, and Styles API facts resolve. The illustration shows comparison,
        not inference.
      </p>
    </section>
  );
}

function SignalLabel({
  index,
  name,
  kind,
  tone,
}: {
  index: string;
  name: string;
  kind: string;
  tone: "brand" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-4 font-mono text-[8px] tracking-[0.12em] uppercase">
      <span className={tone === "brand" ? "text-brand" : "text-fd-foreground"}>
        {index} · {name}
      </span>
      <span className="text-fd-muted-foreground">{kind}</span>
    </div>
  );
}
