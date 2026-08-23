"use client";

import { motion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/** Exact top-level item keys from packages/registry-kit/schema/manteen.registry.schema.json. */
const fields = [
  ["name", "identity"],
  ["kind", "composition"],
  ["title", "label"],
  ["description", "purpose"],
  ["mantine", "gate"],
  ["provider", "context"],
  ["npm", "packages"],
  ["npmDev", "tooling"],
  ["uses", "relations"],
  ["css", "styles"],
  ["files", "source"],
  ["themeFragment", "theme"],
  ["stylesApi", "selectors"],
  ["props", "surface"],
  ["usage", "example"],
  ["docs", "provenance"],
] as const;

export function TypecaseVariant({ reduceMotion }: { reduceMotion: boolean }) {
  const enter = (delay: number, duration = 0.36) => ({
    delay: reduceMotion ? 0 : delay,
    duration: reduceMotion ? 0 : duration,
    ease: EASE_OUT,
  });

  return (
    <section className="relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-fd-card p-5 shadow-lg sm:p-6">
      <header className="relative z-20 flex items-start justify-between gap-4 border-b pb-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fd-muted-foreground uppercase">
            Authoring vocabulary / 05
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            One place for every known word.
          </h2>
        </div>
        <span className="font-mono text-[10px] text-brand">16 ITEM FIELDS · CLOSED</span>
      </header>

      <div className="relative mx-auto mt-5 h-[21rem] w-full max-w-lg" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 bottom-12 grid grid-cols-4 overflow-hidden rounded-sm border bg-fd-background/45">
          {fields.map(([name, gloss], index) => (
            <motion.div
              key={name}
              initial={{ opacity: reduceMotion ? 1 : 0, transform: "scale(0.97)" }}
              animate={{ opacity: 1, transform: "scale(1)" }}
              transition={enter(0.04 + index * 0.025, 0.32)}
              className={`relative flex min-w-0 flex-col justify-between border-r border-b p-2 sm:px-3 sm:py-2.5 ${(index + 1) % 4 === 0 ? "border-r-0" : ""} ${index >= 12 ? "border-b-0" : ""}`}
            >
              <span className="font-mono text-[8px] leading-none text-fd-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-2 truncate font-mono text-[9px] text-fd-foreground sm:text-[10px]">
                {name}
              </span>
              <span className="mt-0.5 truncate text-[9px] text-fd-muted-foreground">{gloss}</span>
              {name === "mantine" ? (
                <motion.span
                  initial={{ opacity: reduceMotion ? 1 : 0, transform: "scaleX(0)" }}
                  animate={{ opacity: 1, transform: "scaleX(1)" }}
                  transition={enter(0.54, 0.42)}
                  className="absolute right-2 bottom-1.5 left-2 h-px origin-left bg-brand"
                />
              ) : null}
            </motion.div>
          ))}
        </div>

        {[0, 1, 2, 3].map((row) => (
          <motion.span
            key={row}
            initial={{ opacity: 0 }}
            animate={{ opacity: reduceMotion ? 0 : [0, 0.55, 0] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { delay: 0.78 + row * 0.16, duration: 0.34, ease: EASE_OUT }
            }
            className="pointer-events-none absolute inset-x-0 border-y border-brand/50 bg-brand/5"
            style={{
              top: `calc(${row} * (100% - 3rem) / 4)`,
              height: "calc((100% - 3rem) / 4)",
            }}
          />
        ))}

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "translate(-50%, -680%)" }}
          animate={{ opacity: 1, transform: "translate(-50%, 0%)" }}
          transition={
            reduceMotion ? { duration: 0 } : { delay: 0.7, duration: 1.05, ease: EASE_IN_OUT }
          }
          className="absolute bottom-0 left-1/2 z-10 flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-fd-border bg-fd-card px-3 font-mono text-[10px] shadow-lg"
        >
          <span className="size-1.5 rounded-full bg-fd-muted-foreground/55" />
          framework
          <span className="text-fd-muted-foreground">no field</span>
        </motion.div>

        <motion.span
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "scaleX(0)" }}
          animate={{ opacity: 1, transform: "scaleX(1)" }}
          transition={enter(1.72, 0.38)}
          className="absolute right-[calc(50%+4.7rem)] bottom-4 left-0 h-px origin-right bg-fd-border"
        />
        <motion.span
          initial={{ opacity: reduceMotion ? 1 : 0, transform: "scaleX(0)" }}
          animate={{ opacity: 1, transform: "scaleX(1)" }}
          transition={enter(1.72, 0.38)}
          className="absolute right-0 bottom-4 left-[calc(50%+4.7rem)] h-px origin-left bg-fd-border"
        />
      </div>

      <motion.p
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={enter(1.86)}
        className="mt-auto border-t pt-4 text-sm text-fd-muted-foreground"
      >
        A known field has a place. An unknown field cannot quietly make one.
      </motion.p>

      <p className="sr-only">
        The closed Manteen item vocabulary has sixteen named fields. The unknown framework field
        remains outside because the authoring schema does not allow undeclared properties.
      </p>
    </section>
  );
}
