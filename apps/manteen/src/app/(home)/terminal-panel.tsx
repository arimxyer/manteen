"use client";

import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type Tone = "write" | "keep" | "head" | "note" | "npm";

/**
 * A transcript is a flat run of blocks, so one step can hold several commands
 * and the output each produced — which is what a first run actually looks like.
 */
export type Block =
  | { kind: "command"; text: string }
  | { kind: "line"; verb?: string; text: string; tone: Tone };

export type Step = { blocks: Block[] };

const toneClass = {
  write: "text-brand",
  keep: "text-fd-muted-foreground",
  head: "text-fd-foreground",
  note: "text-fd-muted-foreground",
  npm: "text-fd-muted-foreground/60",
} as const;

const TYPE_MS = 26;
const LINE_MS = 240;
const PROMPT_MS = 700;
const HOLD_MS = 4500;

/** Where a fully played step ends, for the reduced-motion branch. */
function endOf(step: Step) {
  const block = step.blocks.length - 1;
  const last = step.blocks[block];
  return { block, chars: last.kind === "command" ? last.text.length : 0 };
}

export function TerminalPanel({
  steps,
  rotate = false,
  reserve,
  className,
  staticStep = 0,
}: {
  steps: Step[];
  /** Cycle through the steps rather than playing the first one once. */
  rotate?: boolean;
  /** Height held for the transcript so the card never resizes mid-play. */
  reserve: string;
  className?: string;
  /** The step reduced motion settles on, revealed and still. */
  staticStep?: number;
}) {
  const [step, setStep] = useState(rotate ? 0 : staticStep);
  const [cursor, setCursor] = useState({ block: 0, chars: 0 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(staticStep);
      setCursor(endOf(steps[staticStep]));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let index = rotate ? 0 : staticStep;
    let block = 0;
    let chars = 0;

    const tick = () => {
      const blocks = steps[index].blocks;
      const current = blocks[block];

      if (current.kind === "command" && chars < current.text.length) {
        chars += 1;
        setCursor({ block, chars });
        timer = setTimeout(tick, TYPE_MS);
        return;
      }

      if (block + 1 < blocks.length) {
        block += 1;
        chars = 0;
        setCursor({ block, chars: 0 });
        // A new prompt waits a beat before typing; output keeps scrolling.
        timer = setTimeout(tick, blocks[block].kind === "command" ? PROMPT_MS : LINE_MS);
        return;
      }

      if (!rotate) return;

      timer = setTimeout(() => {
        index = (index + 1) % steps.length;
        block = 0;
        chars = 0;
        setStep(index);
        setCursor({ block: 0, chars: 0 });
        timer = setTimeout(tick, 500);
      }, HOLD_MS);
    };

    timer = setTimeout(tick, PROMPT_MS);
    return () => clearTimeout(timer);
  }, [steps, rotate, staticStep]);

  const blocks = steps[step].blocks.slice(0, cursor.block + 1);
  // The caret sits on the most recent prompt, the way a shell leaves it.
  const caretAt = blocks.reduce((at, block, index) => (block.kind === "command" ? index : at), -1);

  return (
    // Decoration over prose the docs already teach, so the whole widget is hidden
    // from assistive technology rather than announced one partial line at a time.
    <div
      className={cn("rounded-xl border bg-fd-secondary shadow-md", className)}
      aria-hidden="true"
    >
      <div className="flex flex-row items-center gap-2 border-b p-2 text-fd-muted-foreground">
        <Terminal className="size-4" />
        <span className="text-xs font-medium">Terminal</span>
        {rotate ? (
          <div className="me-1 ms-auto flex flex-row items-center gap-1.5">
            {steps.map((entry, index) => (
              <span
                key={entry.blocks.map((block) => block.text).join("|")}
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-500",
                  index === step ? "bg-brand" : "bg-fd-muted-foreground/30",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="me-2 ms-auto size-2 rounded-full bg-brand" />
        )}
      </div>

      <div
        className={cn(
          "p-3 font-mono text-xs leading-6 text-fd-secondary-foreground/85 sm:text-[13px]",
          reserve,
        )}
      >
        {blocks.map((block, index) =>
          block.kind === "command" ? (
            // Within a step the block order is fixed and never reorders, so the index
            // is a stable identity — the text is not, since a line may be blank.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <p key={index} className="flex flex-row text-fd-foreground">
              <span className="mr-2 text-brand">$</span>
              <span className="break-all">
                {index === cursor.block ? block.text.slice(0, cursor.chars) : block.text}
                {index === caretAt ? (
                  <span className="caret ml-px inline-block w-[7px] bg-fd-foreground align-text-bottom">
                    &nbsp;
                  </span>
                ) : null}
              </span>
            </p>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <p key={index} className="flex flex-row">
              {block.verb ? (
                <span className={cn("w-20 shrink-0 sm:w-24", toneClass[block.tone])}>
                  {block.verb}
                </span>
              ) : null}
              {/* pre-wrap, because a line's internal column spacing is part of the
                  captured text and HTML would otherwise collapse it to one space. */}
              <span
                className={cn(
                  "whitespace-pre-wrap break-all",
                  block.verb ? undefined : toneClass[block.tone],
                )}
              >
                {block.text || " "}
              </span>
            </p>
          ),
        )}
      </div>
    </div>
  );
}
