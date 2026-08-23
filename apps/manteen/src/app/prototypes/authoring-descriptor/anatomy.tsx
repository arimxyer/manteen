"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function AnatomyVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : 0.5,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-fd-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-fd-border) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
        }}
      />

      <header className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Exploded anatomy / 01
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">ReleasePanel</h2>
        </div>
        <span className="font-mono text-[10px] text-brand">MANTINE NATIVE</span>
      </header>

      <div className="relative mx-auto mt-8 h-72 w-full max-w-md" aria-hidden="true">
        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "translateY(0%) scale(0.98)" }}
          animate={{ opacity: 1, transform: "translateY(-11%) scale(0.98)" }}
          transition={enter(0.08)}
          className="absolute inset-x-8 top-10 bottom-8 rounded-2xl border border-brand/30 bg-brand/8"
        >
          <span className="absolute -top-6 left-0 font-mono text-[10px] text-brand">
            MantineProvider
          </span>
          <span className="absolute top-0 bottom-0 left-5 w-px bg-brand/25" />
          <span className="absolute top-0 right-5 bottom-0 w-px bg-brand/25" />
        </motion.div>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "translateY(8%) scale(0.96)" }}
          animate={{ opacity: 1, transform: "translateY(0%) scale(1)" }}
          transition={enter(0.18)}
          className="absolute inset-x-12 top-14 bottom-12 rounded-xl border bg-fd-secondary p-4 shadow-xl"
        >
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <div className="h-2 w-20 rounded-full bg-fd-foreground/75" />
              <div className="mt-2 h-1.5 w-28 rounded-full bg-fd-muted-foreground/25" />
            </div>
            <div className="size-8 rounded-lg border bg-fd-card" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4 py-4">
            <div className="space-y-2">
              <div className="h-1.5 w-full rounded-full bg-fd-muted-foreground/20" />
              <div className="h-1.5 w-4/5 rounded-full bg-fd-muted-foreground/20" />
              <div className="h-1.5 w-2/3 rounded-full bg-fd-muted-foreground/20" />
            </div>
            <div className="h-14 w-16 rounded-lg border border-brand/25 bg-brand/8" />
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <div className="h-6 w-14 rounded-full border" />
            <div className="h-6 w-16 rounded-full bg-brand" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "translateY(0%)" }}
          animate={{ opacity: 1, transform: "translateY(12%)" }}
          transition={enter(0.32)}
          className="absolute inset-x-4 top-16 bottom-6"
        >
          <AnatomyLabel className="top-2 left-0" name="root" width="w-12" />
          <AnatomyLabel className="top-24 right-0" name="body" width="w-16" reverse />
          <AnatomyLabel className="bottom-0 left-8" name="actions" width="w-20" />
        </motion.div>
      </div>

      <motion.footer
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={enter(0.5)}
        className="relative mt-auto flex items-center justify-between border-t pt-4 font-mono text-[10px] text-fd-muted-foreground"
      >
        <span>context / source / style slots</span>
        <span className="text-brand">&gt;=9 &lt;10</span>
      </motion.footer>
    </section>
  );
}

function AnatomyLabel({
  className,
  name,
  width,
  reverse = false,
}: {
  className: string;
  name: string;
  width: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`absolute flex items-center gap-2 ${className} ${reverse ? "flex-row-reverse" : ""}`}
    >
      <span className="font-mono text-[10px] text-brand">{name}</span>
      <span className={`h-px ${width} bg-brand/45`} />
      <span className="size-1.5 rounded-full bg-brand" />
    </div>
  );
}
