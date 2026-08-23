"use client";

import { ChevronLeft, ChevronRight, FileJson, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SwapVariant } from "../interop-descriptor/swap";
import { SwapStudyA } from "./study-a";
import { SwapStudyB } from "./study-b";
import { SwapStudyC } from "./study-c";
import { SwapStudyD } from "./study-d";
import { SwapStudyE } from "./study-e";
import { SwapStudyF } from "./study-f";

const variants = [
  { name: "Current", Component: SwapVariant },
  { name: "Study A", Component: SwapStudyA },
  { name: "Study B", Component: SwapStudyB },
  { name: "Study C", Component: SwapStudyC },
  { name: "Study D", Component: SwapStudyD },
  { name: "Study E", Component: SwapStudyE },
  { name: "Study F", Component: SwapStudyF },
] as const;

const outputs = [
  ["success", "a complete replacement becomes the published set"],
  ["refusal", "the incomplete replacement never reaches publication"],
  ["invariant", "a reader never receives a partial set"],
] as const;

export function SwapExplorationHarness({ initialVariant }: { initialVariant: number }) {
  const [current, setCurrent] = useState(initialVariant);
  const [run, setRun] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const ActiveVariant = variants[current]?.Component ?? variants[0].Component;

  const select = useCallback((index: number) => {
    if (index < 0 || index >= variants.length) return;
    setCurrent(index);
    setRun((value) => value + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    setClientReady(true);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= variants.length) select(number - 1);
      else if (event.key === "ArrowRight") select((current + 1) % variants.length);
      else if (event.key === "ArrowLeft") {
        select((current - 1 + variants.length) % variants.length);
      } else if (event.key === "r" || event.key === "R") {
        setRun((value) => value + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, select]);

  return (
    <>
      <main className="min-h-screen bg-fd-background px-5 py-14 text-fd-foreground sm:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-[1180px] pb-24">
          <header className="mb-10 border-b pb-5">
            <p className="font-mono text-[10px] tracking-[0.16em] text-brand uppercase">
              Prototype / swap exploration
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
              Complete set in. Complete set out.
            </h1>
          </header>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <section className="flex min-h-[30rem] flex-col rounded-2xl border bg-fd-card p-6 shadow-lg">
              <FileJson className="mb-4 text-brand" aria-hidden="true" />
              <h2 className="mb-4 text-xl font-medium tracking-tight lg:text-2xl">
                Change the set without publishing the transition.
              </h2>
              <p className="mb-5 text-fd-muted-foreground">
                A build can assemble or refuse a complete replacement without exposing a
                half-updated registry to readers.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t pt-4 text-xs">
                {outputs.map(([term, detail]) => (
                  <div key={term} className="contents">
                    <dt className="font-mono text-fd-foreground">{term}</dt>
                    <dd className="text-fd-muted-foreground">{detail}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/prototypes/interop-descriptor?v=3"
                className="mt-auto font-medium text-brand"
              >
                Back to the interoperability studies
              </Link>
            </section>

            <section
              key={`${current}-${run}`}
              className="flex min-h-[30rem] flex-col justify-center rounded-2xl border bg-fd-card p-4 shadow-lg sm:p-6"
              aria-label={`${variants[current]?.name ?? "Current"} prototype`}
            >
              {clientReady ? (
                <ActiveVariant reduceMotion={reduceMotion} run={run} />
              ) : (
                <div className="min-h-[26rem]" aria-hidden="true" />
              )}
            </section>
          </div>
        </div>
      </main>

      <nav
        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-neutral-950/85 p-1 text-[13px] text-white shadow-2xl backdrop-blur-xl"
        aria-label="Swap studies"
      >
        <div className="flex items-center gap-1 sm:hidden">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            aria-label="Previous study"
            onClick={() => select((current - 1 + variants.length) % variants.length)}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </button>
          <span className="min-w-20 px-1 text-center" aria-live="polite">
            {variants[current]?.name ?? "Current"}
          </span>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            aria-label="Next study"
            onClick={() => select((current + 1) % variants.length)}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          {variants.map((variant, index) => (
            <button
              key={variant.name}
              type="button"
              className="h-8 rounded-full px-3 transition-colors data-[active]:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none motion-reduce:transition-none"
              data-active={index === current ? "" : undefined}
              aria-current={index === current ? "true" : undefined}
              onClick={() => select(index)}
            >
              {variant.name}
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          aria-label="Replay animation (R)"
          onClick={() => setRun((value) => value + 1)}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
