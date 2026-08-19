"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function FieldNotesVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const reveal = (delay: number) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : 0.25,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <div className="flex items-baseline justify-between border-b pb-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-fd-muted-foreground uppercase">
            Component field note
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">ReleasePanel</h2>
        </div>
        <span className="font-mono text-2xl font-light text-brand/70">014</span>
      </div>

      <div
        className="relative mx-auto mt-6 w-full max-w-md flex-1 overflow-hidden rounded-sm border bg-fd-background p-5 shadow-md sm:p-6"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, color-mix(in oklab, var(--color-fd-border) 55%, transparent) 28px)",
        }}
        aria-hidden="true"
      >
        <span className="absolute top-0 bottom-0 left-10 w-px bg-brand/20" />

        <div className="relative ml-8 min-h-80">
          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0, transform: "translateY(6%)" }}
            animate={{ opacity: 1, transform: "translateY(0%)" }}
            transition={reveal(0.05)}
            className="absolute top-14 right-8 left-5 rounded-xl border bg-fd-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="h-2 w-24 rounded-full bg-fd-foreground/80" />
                <div className="mt-2 h-1.5 w-32 rounded-full bg-fd-muted-foreground/25" />
              </div>
              <div className="size-7 rounded-md border" />
            </div>
            <div className="my-5 space-y-2">
              <div className="h-1.5 w-full rounded-full bg-fd-muted-foreground/20" />
              <div className="h-1.5 w-3/4 rounded-full bg-fd-muted-foreground/20" />
            </div>
            <div className="flex justify-end gap-2">
              <div className="h-6 w-12 rounded-full border" />
              <div className="h-6 w-16 rounded-full bg-brand" />
            </div>
          </motion.div>

          <Note
            className="top-0 left-0"
            label="compatibility"
            value="Mantine >=9 <10"
            delay={0.18}
            reduceMotion={reduceMotion}
          />
          <Note
            className="top-32 right-0 text-right"
            label="context"
            value="MantineProvider"
            delay={0.42}
            reduceMotion={reduceMotion}
            reverse
          />
          <Note
            className="bottom-2 left-2"
            label="stylesApi"
            value="root · body · actions"
            delay={0.66}
            reduceMotion={reduceMotion}
            wide
          />
        </div>

        <motion.span
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={reveal(0.9)}
          className="absolute bottom-3 left-3 font-mono text-[9px] tracking-[0.12em] text-brand uppercase [writing-mode:vertical-rl]"
        >
          authoring surface
        </motion.span>
      </div>
    </section>
  );
}

function Note({
  className,
  label,
  value,
  delay,
  reduceMotion,
  reverse = false,
  wide = false,
}: {
  className: string;
  label: string;
  value: string;
  delay: number;
  reduceMotion: boolean;
  reverse?: boolean;
  wide?: boolean;
}) {
  const transition = {
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : 0.25,
    ease: EASE_OUT,
  };

  return (
    <motion.div
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={transition}
      className={`absolute ${className}`}
    >
      <span className="block font-mono text-[9px] tracking-[0.12em] text-fd-muted-foreground uppercase">
        {label}
      </span>
      <span className="mt-0.5 block font-mono text-[11px] text-fd-foreground">{value}</span>
      <motion.span
        initial={{ opacity: reduceMotion ? 1 : 0, transform: "scaleX(0)" }}
        animate={{ opacity: 1, transform: "scaleX(1)" }}
        transition={transition}
        className={`mt-1 block h-px origin-left bg-brand/60 ${wide ? "w-36" : "w-24"} ${reverse ? "ml-auto origin-right" : ""}`}
      />
    </motion.div>
  );
}
