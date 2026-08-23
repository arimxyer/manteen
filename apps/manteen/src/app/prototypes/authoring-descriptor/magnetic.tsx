"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function MagneticVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const dock = (delay: number) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : 0.5,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Constraint field / 03
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">ReleasePanel</h2>
        </div>
        <span className="font-mono text-[10px] text-brand">SOURCE AT CENTRE</span>
      </header>

      <div className="relative mx-auto mt-2 h-[23rem] w-full max-w-lg" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fd-border/65" />
        <div className="absolute top-1/2 left-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/20" />
        <div className="absolute top-1/2 left-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/35 bg-brand/5" />

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "scale(0.95)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={dock(0.04)}
          className="absolute top-1/2 left-1/2 z-10 w-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-fd-secondary p-3 shadow-xl"
        >
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-mono text-[9px] text-brand">release-panel.tsx</span>
            <span className="size-1.5 rounded-full bg-brand" />
          </div>
          <div className="space-y-2 py-3">
            <div className="h-1.5 w-20 rounded-full bg-fd-foreground/70" />
            <div className="h-1.5 w-full rounded-full bg-fd-muted-foreground/20" />
            <div className="h-1.5 w-4/5 rounded-full bg-fd-muted-foreground/20" />
          </div>
          <div className="grid grid-cols-3 gap-1 border-t pt-2">
            <span className="h-4 rounded bg-brand/15" />
            <span className="h-4 rounded bg-brand/10" />
            <span className="h-4 rounded bg-brand/20" />
          </div>
        </motion.div>

        <DockNode
          className="top-10 left-3"
          label="compatibility"
          value=">=9 <10"
          start="translate(-35%, -45%)"
          delay={0.16}
          reduceMotion={reduceMotion}
        />
        <DockNode
          className="top-16 right-0 text-right"
          label="context"
          value="provider"
          start="translate(35%, -45%)"
          delay={0.36}
          reduceMotion={reduceMotion}
          reverse
        />
        <DockNode
          className="bottom-7 left-1/2 -translate-x-1/2 text-center"
          label="style surface"
          value="root · body · actions"
          start="translate(0%, 70%)"
          delay={0.56}
          reduceMotion={reduceMotion}
          vertical
        />

        <motion.span
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "scale(0.96)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={dock(0.82)}
          className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/45 shadow-[0_0_40px_color-mix(in_oklab,var(--color-brand)_12%,transparent)]"
        />
      </div>

      <motion.p
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={dock(0.84)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        The source stays central. Authoring defines the field it must live inside.
      </motion.p>
    </section>
  );
}

function DockNode({
  className,
  label,
  value,
  start,
  delay,
  reduceMotion,
  reverse = false,
  vertical = false,
}: {
  className: string;
  label: string;
  value: string;
  start: string;
  delay: number;
  reduceMotion: boolean;
  reverse?: boolean;
  vertical?: boolean;
}) {
  const transition = {
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : 0.5,
    ease: EASE_OUT,
  };

  return (
    <motion.div
      initial={{ opacity: reduceMotion ? 1 : 0, transform: start }}
      animate={{ opacity: 1, transform: "translate(0%, 0%)" }}
      transition={transition}
      className={`absolute z-20 ${className}`}
    >
      <span className="block font-mono text-[9px] tracking-[0.12em] text-fd-muted-foreground uppercase">
        {label}
      </span>
      <span className="mt-0.5 block font-mono text-[11px] text-fd-foreground">{value}</span>
      <span
        className={`mt-2 flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""} ${vertical ? "flex-col" : ""}`}
      >
        <span className={`block bg-brand/50 ${vertical ? "h-10 w-px" : "h-px w-16"}`} />
        <span className="block size-2 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_12%,transparent)]" />
      </span>
    </motion.div>
  );
}
