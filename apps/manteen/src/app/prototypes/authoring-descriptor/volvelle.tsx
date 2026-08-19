"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const rings = [
  {
    size: "94%",
    start: -118,
    overshoot: 4,
    delay: 0.14,
    duration: 0.98,
    number: "01",
    label: "mantine",
    value: ">=9 <10",
  },
  {
    size: "70%",
    start: 92,
    overshoot: -3,
    delay: 0.26,
    duration: 0.86,
    number: "02",
    label: "provider",
    value: "required",
  },
  {
    size: "48%",
    start: -68,
    overshoot: 3,
    delay: 0.38,
    duration: 0.74,
    number: "03",
    label: "styles api",
    value: "3 selectors",
  },
] as const;

const LOCK_TIME = 1.12;

export function VolvelleVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.34) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Authoring volvelle / 07
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            A coordinate system for source.
          </h2>
        </div>
        <span className="hidden font-mono text-[10px] whitespace-nowrap text-brand sm:inline">
          MANTINE-NATIVE
        </span>
      </header>

      <div className="relative mx-auto mt-3 h-[21rem] w-full max-w-md" aria-hidden="true">
        <div
          className="absolute top-0 left-1/2 aspect-square w-[18rem] max-w-[86vw] -translate-x-1/2 rounded-full border border-fd-foreground/10 shadow-[0_22px_50px_-32px_color-mix(in_oklab,var(--color-fd-foreground)_48%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_82%,var(--color-fd-foreground))]"
          style={{
            background:
              "radial-gradient(circle at 38% 27%, var(--color-fd-card) 0%, var(--color-fd-secondary) 63%, color-mix(in oklab, var(--color-fd-secondary) 88%, var(--color-fd-foreground)) 100%)",
          }}
        >
          <span className="absolute inset-[2.8%] rounded-full border border-fd-foreground/10 shadow-[inset_0_0_22px_color-mix(in_oklab,var(--color-fd-foreground)_7%,transparent)]" />

          {rings.map((ring, index) => {
            const finalTransform = "translate(-50%, -50%) rotate(0deg) scale(1)";
            const initialTransform = `translate(-50%, -50%) rotate(${ring.start}deg) scale(0.985)`;
            const overshootTransform = `translate(-50%, -50%) rotate(${ring.overshoot}deg) scale(1)`;

            return (
              <motion.div
                key={ring.label}
                initial={{
                  opacity: reduceMotion ? 1 : 0.76,
                  transform: reduceMotion ? finalTransform : initialTransform,
                }}
                animate={{
                  opacity: 1,
                  transform: reduceMotion
                    ? finalTransform
                    : [initialTransform, overshootTransform, finalTransform],
                }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        delay: ring.delay,
                        duration: ring.duration,
                        ease: [EASE_IN_OUT, EASE_OUT],
                        times: [0, 0.84, 1],
                      }
                }
                className="absolute top-1/2 left-1/2 rounded-full border border-fd-foreground/14"
                style={{
                  width: ring.size,
                  height: ring.size,
                  background:
                    index === 0
                      ? "linear-gradient(145deg, color-mix(in oklab, var(--color-fd-card) 94%, var(--color-fd-foreground)), var(--color-fd-secondary) 62%, color-mix(in oklab, var(--color-fd-secondary) 90%, var(--color-fd-foreground)))"
                      : index === 1
                        ? "linear-gradient(145deg, color-mix(in oklab, var(--color-fd-card) 92%, var(--color-fd-foreground)), var(--color-fd-secondary) 68%, color-mix(in oklab, var(--color-fd-secondary) 94%, var(--color-fd-foreground)))"
                        : "linear-gradient(145deg, color-mix(in oklab, var(--color-fd-card) 90%, var(--color-fd-foreground)), var(--color-fd-secondary) 74%, color-mix(in oklab, var(--color-fd-secondary) 96%, var(--color-fd-foreground)))",
                  boxShadow:
                    "0 7px 13px -10px color-mix(in oklab, var(--color-fd-foreground) 54%, transparent), inset 0 1px 0 color-mix(in oklab, var(--color-fd-card) 78%, var(--color-fd-foreground)), inset 0 -1px 0 color-mix(in oklab, var(--color-fd-foreground) 10%, transparent)",
                }}
              >
                <span
                  className="absolute inset-0 rounded-full opacity-55"
                  style={{
                    background:
                      "repeating-conic-gradient(from -0.4deg, color-mix(in oklab, var(--color-fd-foreground) 30%, transparent) 0deg 0.7deg, transparent 0.7deg 7.5deg)",
                    maskImage:
                      "radial-gradient(circle, transparent calc(50% - 9px), black calc(50% - 8px))",
                    WebkitMaskImage:
                      "radial-gradient(circle, transparent calc(50% - 9px), black calc(50% - 8px))",
                  }}
                />

                <span className="absolute top-[4.5%] left-1/2 z-10 flex h-5 min-w-[5.6rem] -translate-x-1/2 items-center justify-center gap-1.5 rounded-sm border border-fd-foreground/12 bg-fd-card px-2 font-mono shadow-sm">
                  <span className="text-[7px] text-brand">{ring.number}</span>
                  <span className="text-[7px] tracking-[0.08em] text-fd-muted-foreground uppercase">
                    {ring.label}
                  </span>
                  <span className="text-[8px] text-fd-foreground">{ring.value}</span>
                </span>

                <span className="absolute top-[1.2%] left-1/2 h-[3.5%] w-px -translate-x-1/2 bg-brand" />
              </motion.div>
            );
          })}

          <div className="absolute top-1/2 left-1/2 z-30 flex w-[29%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border border-brand/40 bg-fd-card px-2 py-3 text-center shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--color-fd-foreground)_52%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-fd-card)_80%,var(--color-fd-foreground))]">
            <span className="font-mono text-[7px] tracking-[0.14em] text-fd-muted-foreground uppercase">
              source · fixed
            </span>
            <span className="mt-1 font-mono text-[10px] text-fd-foreground">panel.tsx</span>
            <span className="mt-1.5 h-px w-5 bg-brand/55" />
            <span className="mt-1 font-mono text-[7px] text-brand">unchanged</span>
          </div>

          <motion.span
            initial={{
              opacity: reduceMotion ? 1 : 0,
              transform: reduceMotion
                ? "translateX(-50%) scaleY(1)"
                : "translateX(-50%) scaleY(0.08)",
            }}
            animate={{ opacity: 1, transform: "translateX(-50%) scaleY(1)" }}
            transition={enter(LOCK_TIME, 0.32)}
            className="absolute top-[2.8%] left-1/2 z-20 h-[34%] w-px origin-top bg-brand/65"
          />

          <motion.span
            initial={{
              opacity: reduceMotion ? 1 : 0,
              transform: reduceMotion
                ? "translate(-50%, -50%) scale(1)"
                : "translate(-50%, -50%) scale(0.94)",
            }}
            animate={{ opacity: 1, transform: "translate(-50%, -50%) scale(1)" }}
            transition={enter(LOCK_TIME + 0.16, 0.28)}
            className="absolute top-1/2 left-1/2 z-40 size-2.5 rounded-full border border-brand bg-fd-card shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_11%,transparent)]"
          />
        </div>

        <motion.div
          initial={{
            opacity: reduceMotion ? 1 : 0,
            transform: reduceMotion ? "translateY(0%)" : "translateY(14%)",
          }}
          animate={{ opacity: 1, transform: "translateY(0%)" }}
          transition={enter(LOCK_TIME + 0.3, 0.32)}
          className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-y py-2 font-mono text-[8px] tracking-[0.08em] uppercase"
        >
          <span className="text-fd-foreground">author coordinates · 3/3</span>
          <span className="h-px min-w-5 flex-1 bg-fd-border" />
          <span className="text-brand">kit → transport</span>
        </motion.div>
      </div>

      <motion.p
        initial={{
          opacity: reduceMotion ? 1 : 0,
          transform: reduceMotion ? "translateY(0%)" : "translateY(8%)",
        }}
        animate={{ opacity: 1, transform: "translateY(0%)" }}
        transition={enter(LOCK_TIME + 0.48, 0.32)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        Source stays at the center. Authors align the Mantine-specific coordinates around it; the
        kit owns how that complete item travels over the wire.
      </motion.p>

      <p className="sr-only">
        Three concentric instrument rings rotate into one registration line around an unchanged
        source file. The rings represent author-declared Mantine compatibility, provider context,
        and Styles API surface. Once those authored coordinates align, the complete item passes to
        the kit-owned transport layer.
      </p>
    </section>
  );
}
