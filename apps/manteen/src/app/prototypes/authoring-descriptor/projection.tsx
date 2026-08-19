"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const CAST_DELAY = 0.58;
const CAST_DURATION = 1.2;

export function ProjectionVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.34) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  const cast = reduceMotion
    ? { duration: 0 }
    : { delay: CAST_DELAY, duration: CAST_DURATION, ease: EASE_IN_OUT };

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Projected destination / 08
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            One declaration, local ground.
          </h2>
        </div>
        <span className="font-mono text-[10px] text-brand">SOURCE HOLDS</span>
      </header>

      <div
        className="relative mx-auto mt-4 h-[21rem] w-full max-w-md overflow-hidden rounded-xl border bg-fd-secondary"
        aria-hidden="true"
      >
        <div className="absolute inset-x-0 top-0 h-[48%] bg-[radial-gradient(circle_at_50%_100%,color-mix(in_oklab,var(--color-brand)_9%,transparent),transparent_58%)]" />
        <div className="absolute inset-x-5 top-4 z-30 h-px bg-fd-border">
          <span className="absolute -top-1 -left-px size-2 rounded-full border bg-fd-card" />
          <span className="absolute -top-1 -right-px size-2 rounded-full border bg-fd-card" />
          <span className="absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[7px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            incident light
          </span>
        </div>

        <motion.div
          initial={{
            opacity: 1,
            transform: reduceMotion ? "translateX(96px)" : "translateX(-96px)",
          }}
          animate={{ opacity: 1, transform: "translateX(96px)" }}
          transition={cast}
          className="absolute top-[0.7rem] left-1/2 z-40"
        >
          <span className="absolute top-1/2 left-1/2 size-16 -translate-1/2 rounded-full bg-brand/10 blur-xl" />
          <span className="relative block size-3.5 -translate-x-1/2 rounded-full border border-brand/55 bg-brand shadow-[0_0_14px_4px_color-mix(in_oklab,var(--color-brand)_28%,transparent)]" />
          <span className="absolute top-4 left-1/2 h-40 w-24 -translate-x-1/2 [clip-path:polygon(47%_0,53%_0,100%_100%,0_100%)] bg-gradient-to-b from-brand/15 via-brand/5 to-transparent" />
        </motion.div>

        <div className="absolute inset-x-0 top-[46%] bottom-0 overflow-hidden border-t border-fd-border/80 bg-fd-card/50">
          <div className="absolute inset-[-22%_-8%_-20%] origin-top [background-image:linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] [background-size:28px_22px] opacity-65 [transform:perspective(260px)_rotateX(52deg)_scale(1.16)]" />
          <span className="absolute top-2 left-3 font-mono text-[7px] tracking-[0.14em] text-fd-muted-foreground uppercase">
            consumer projection plane
          </span>
        </div>

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0,
            transform: reduceMotion
              ? "translate(-50%, 0%) scale(1)"
              : "translate(-50%, -7%) scale(0.97)",
          }}
          animate={{ opacity: 1, transform: "translate(-50%, 0%) scale(1)" }}
          transition={enter(0.06, 0.4)}
          className="absolute top-14 left-1/2 z-30 w-[12.25rem]"
        >
          <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg border border-fd-foreground/10 bg-fd-foreground/5" />
          <div className="relative rounded-lg border border-fd-foreground/25 bg-fd-card shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="font-mono text-[8px] tracking-[0.14em] text-fd-muted-foreground uppercase">
                authored file
              </span>
              <span className="size-1.5 rounded-full bg-brand" />
            </div>
            <div className="px-3 pt-2.5 pb-3">
              <span className="block font-mono text-[10px] text-fd-foreground">
                release-panel.tsx
              </span>
              <span className="mt-1 block font-mono text-[8px] text-fd-muted-foreground">
                as · component
              </span>
            </div>
          </div>

          <div className="absolute top-full left-1/2 flex -translate-x-1/2 flex-col items-center">
            <span className="h-3 w-px bg-brand/55" />
            <span className="relative whitespace-nowrap rounded-full border border-brand/45 bg-fd-card px-2.5 py-1 font-mono text-[8px] text-brand shadow-md">
              <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rotate-45 border-b border-l border-brand/45 bg-fd-card" />
              @ui/release-panel.tsx
            </span>
          </div>
        </motion.div>

        <div className="absolute top-[48%] left-1/2 z-20 h-[4.1rem] w-px -translate-x-1/2 bg-gradient-to-b from-brand/50 to-brand/10" />
        <span className="absolute top-[48%] left-[calc(50%+0.5rem)] z-20 font-mono text-[7px] tracking-[0.12em] text-brand uppercase">
          fixed alias anchor
        </span>

        <motion.span
          initial={{
            opacity: reduceMotion ? 0.48 : 0.7,
            transform: reduceMotion
              ? "translateX(-50%) rotate(31deg) scaleY(1)"
              : "translateX(-50%) rotate(-29deg) scaleY(0.92)",
          }}
          animate={{ opacity: 0.48, transform: "translateX(-50%) rotate(31deg) scaleY(1)" }}
          transition={cast}
          className="absolute top-[57%] left-1/2 z-10 h-24 w-px origin-top bg-gradient-to-b from-brand/70 via-brand/30 to-transparent"
        />

        <motion.div
          initial={{
            opacity: reduceMotion ? 0.2 : 0.96,
            transform: reduceMotion
              ? "translate(22%, 9%) rotate(-2deg) skewY(-4deg)"
              : "translate(5%, -9%) rotate(-2deg) skewY(-4deg)",
          }}
          animate={{
            opacity: 0.2,
            transform: "translate(22%, 9%) rotate(-2deg) skewY(-4deg)",
          }}
          transition={cast}
          className="absolute right-4 bottom-9 z-10 w-[57%] rounded-md border border-fd-foreground/20 bg-fd-foreground/7 px-3 py-2 shadow-[0_12px_20px_color-mix(in_oklab,var(--color-fd-foreground)_8%,transparent)]"
        >
          <span className="flex items-center justify-between font-mono text-[7px] tracking-[0.12em] text-fd-muted-foreground uppercase">
            project A<span>alias map 01</span>
          </span>
          <span className="mt-1.5 block font-mono text-[9px] text-fd-foreground">
            src/components/ui/
            <strong className="font-medium">release-panel.tsx</strong>
          </span>
        </motion.div>

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0.12,
            transform: reduceMotion
              ? "translate(-10%, 3%) rotate(2deg) skewY(4deg)"
              : "translate(10%, -17%) rotate(2deg) skewY(4deg)",
          }}
          animate={{ opacity: 1, transform: "translate(-10%, 3%) rotate(2deg) skewY(4deg)" }}
          transition={cast}
          className="absolute bottom-5 left-4 z-20 w-[57%] rounded-md border border-brand/40 bg-fd-card px-3 py-2 shadow-xl"
        >
          <span className="flex items-center justify-between font-mono text-[7px] tracking-[0.12em] text-brand uppercase">
            project B<span>alias map 02</span>
          </span>
          <span className="mt-1.5 block font-mono text-[9px] text-fd-foreground">
            app/ui/<strong className="font-medium">release-panel.tsx</strong>
          </span>
        </motion.div>
      </div>

      <motion.p
        initial={{
          opacity: reduceMotion ? 1 : 0,
          transform: reduceMotion ? "translateY(0%)" : "translateY(8%)",
        }}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={enter(1.7, 0.32)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        The authored file and alias target stay fixed. Each consumer resolves that shared intent
        onto its own project layout.
      </motion.p>

      <p className="sr-only">
        A fixed authored source card and alias anchor stand above a consumer projection plane. As an
        overhead light moves from left to right, its cast direction crosses from Project A to
        Project B. The authored release-panel.tsx file remains classified as a component with the
        alias target @ui/release-panel.tsx, while Project A resolves that alias under
        src/components/ui and Project B resolves it under app/ui. The registry declaration is
        stable; consumer alias configuration determines the physical destination.
      </p>
    </section>
  );
}
