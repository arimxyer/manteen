"use client";

import { ArrowRight, Braces } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnatomyVariant } from "./anatomy";
import { FieldNotesVariant } from "./field-notes";
import { MagneticVariant } from "./magnetic";
import { OperatingEnvelopeVariant } from "./operating-envelope";
import { PhaseLockVariant } from "./phase-lock";
import { ProjectionVariant } from "./projection";
import { TypecaseVariant } from "./typecase";
import { VolvelleVariant } from "./volvelle";

const variants = [
  { name: "Layers", Component: AnatomyVariant },
  { name: "Notes", Component: FieldNotesVariant },
  { name: "Field", Component: MagneticVariant },
  { name: "Gauge", Component: OperatingEnvelopeVariant },
  { name: "Case", Component: TypecaseVariant },
  { name: "Phase", Component: PhaseLockVariant },
  { name: "Dial", Component: VolvelleVariant },
  { name: "Cast", Component: ProjectionVariant },
] as const;

const fields = [
  ["kind", "component, block, hook, lib, theme, or file"],
  ["mantine", "the consumer compatibility gate"],
  ["provider", "whether MantineProvider is required"],
  ["npm, css", "packages and stylesheets the item needs"],
  ["stylesApi, props", "the surface consumers style and pass"],
] as const;

export function PrototypeHarness({ initialVariant }: { initialVariant: number }) {
  const [current, setCurrent] = useState(initialVariant);
  const [replayKey, setReplayKey] = useState(0);
  const [clientReady, setClientReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const picker = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const ActiveVariant = variants[current].Component;

  const moveHighlight = useCallback(() => {
    const item = items.current[current];
    if (!item || !highlight.current) return;
    highlight.current.style.width = `${item.offsetWidth}px`;
    highlight.current.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [current]);

  const select = useCallback((index: number) => {
    if (index < 0 || index >= variants.length) return;
    setCurrent(index);
    setReplayKey((key) => key + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  useLayoutEffect(moveHighlight, [moveHighlight]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReduceMotion(query.matches);
    syncMotionPreference();
    setClientReady(true);
    query.addEventListener("change", syncMotionPreference);

    const first = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => picker.current?.setAttribute("data-ready", ""));
    });
    window.addEventListener("resize", moveHighlight);
    return () => {
      window.cancelAnimationFrame(first);
      query.removeEventListener("change", syncMotionPreference);
      window.removeEventListener("resize", moveHighlight);
    };
  }, [moveHighlight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= variants.length) select(number - 1);
      else if (event.key === "ArrowRight") select((current + 1) % variants.length);
      else if (event.key === "ArrowLeft") select((current - 1 + variants.length) % variants.length);
      else if (event.key === "r" || event.key === "R") setReplayKey((key) => key + 1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, select]);

  return (
    <>
      <main className="min-h-screen bg-fd-background px-5 py-14 text-fd-foreground sm:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-[1180px] pb-24">
          <div className="mb-10 flex items-end justify-between gap-6 border-b pb-5">
            <div>
              <p className="font-mono text-[10px] tracking-[0.16em] text-brand uppercase">
                Prototype / authoring descriptor
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                Author for Mantine, not the wire format.
              </h1>
            </div>
            <Link
              href="/"
              className="hidden text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground sm:block"
            >
              Back to homepage
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <section className="flex min-h-[30rem] flex-col rounded-2xl border bg-fd-card p-6 text-sm shadow-lg">
              <Braces className="mb-4 text-brand" aria-hidden="true" />
              <h2 className="mb-4 text-xl font-medium tracking-tight lg:text-2xl">
                Author for Mantine, not the wire format.
              </h2>
              <p className="mb-4 text-fd-muted-foreground">
                Describe Mantine compatibility, provider needs, npm packages, and destinations in
                the vocabulary your registry actually uses. Unknown fields are rejected rather than
                silently discarded, and{" "}
                <code className="font-mono text-fd-foreground">manteen-kit</code> owns the
                interchange details.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 border-t pt-4 text-xs">
                {fields.map(([term, detail]) => (
                  <div key={term} className="contents">
                    <dt className="font-mono text-fd-foreground">{term}</dt>
                    <dd className="text-fd-muted-foreground">{detail}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/docs/registry-authors"
                className="mt-auto inline-flex items-center gap-1.5 font-medium text-brand"
              >
                Read the authoring guide
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </section>

            <div key={`${current}-${replayKey}`}>
              {clientReady ? (
                <ActiveVariant reduceMotion={reduceMotion} />
              ) : (
                <div className="min-h-[30rem] rounded-2xl border bg-fd-card" aria-hidden="true" />
              )}
            </div>
          </div>

          <div
            className="mt-10 grid grid-cols-1 gap-10 opacity-55 lg:grid-cols-2"
            aria-hidden="true"
          >
            <div className="h-44 rounded-2xl border bg-fd-card" />
            <div className="h-44 rounded-2xl border bg-fd-card p-6">
              <p className="font-mono text-[10px] tracking-[0.14em] text-fd-foreground uppercase">
                Next in the page
              </p>
              <p className="mt-3 text-xl font-medium">Compile once. Stay interoperable.</p>
            </div>
          </div>
        </div>
      </main>

      <nav ref={picker} className="proto-picker" aria-label="Prototype variants">
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {variants.map((variant, index) => (
          <button
            key={variant.name}
            ref={(element) => {
              items.current[index] = element;
            }}
            type="button"
            className="proto-picker-item"
            data-active={index === current ? "" : undefined}
            aria-current={index === current ? "true" : undefined}
            onClick={() => select(index)}
          >
            {variant.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={() => setReplayKey((key) => key + 1)}
        >
          ↻
        </button>
      </nav>

      <PickerStyles />
    </>
  );
}

function PickerStyles() {
  return (
    <style>{`
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}

.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}

/* The slide is enabled only after first paint (data-ready), so load doesn't animate. */
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}

.proto-picker-item {
  position: relative; /* sits above the highlight */
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.proto-picker-item:hover {
  color: rgba(255, 255, 255, 0.85);
}

.proto-picker-item:active {
  transform: scale(0.97);
}

.proto-picker-item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}

.proto-picker-item[data-active] {
  color: #fff;
}

.proto-picker-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.proto-picker-replay {
  padding: 0 10px;
  font-size: 14px;
}

.proto-picker[data-position="top"] {
  bottom: auto;
  top: 24px;
}

/* The skill's five-variant cap is intentionally exceeded for this round. Keep
   the same picker, but tighten only its mobile measurements so every named
   direction remains reachable without horizontal page overflow. */
@media (max-width: 520px) {
  .proto-picker {
    bottom: 12px;
    gap: 1px;
    font-size: 10px;
  }

  .proto-picker-item { padding-inline: 5px; }
  .proto-picker-replay { padding-inline: 6px; }
  .proto-picker-divider { margin-inline: 2px; }
}
`}</style>
  );
}
