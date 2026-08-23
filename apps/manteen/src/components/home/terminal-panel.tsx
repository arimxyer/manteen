"use client";

import { Terminal } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/home/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";

export type Tone = "write" | "keep" | "head" | "note" | "npm";

/** One printed line. `verb` is the CLI's leading column, held to a fixed width. */
export type Line = { verb?: string; text: string; tone: Tone };

/**
 * A transcript alternates typed commands with the output each produced. Output is a
 * *group* rather than a line, because that is how a terminal behaves: a command
 * prints its block at once. Revealing output a line at a time is the tell that an
 * animation is decorative, and avoiding it is most of the point of this model.
 */
export type Block = { kind: "command"; text: string } | { kind: "output"; lines: Line[] };

const toneClass = {
  write: "text-brand",
  keep: "text-fd-muted-foreground",
  head: "text-fd-foreground",
  note: "text-fd-muted-foreground",
  npm: "text-fd-muted-foreground",
} as const;

/**
 * The clock, and the reason this reads as a demonstration rather than an effect.
 *
 * Ported from fumadocs' own homepage — `apps/docs/app/(home)/page.client.tsx`,
 * `CreateAppAnimation`, MIT. Three things there are load-bearing, and all three are
 * theirs rather than ours:
 *
 *   - **One interval drives everything.** Every glyph is a pure function of `tick`,
 *     so nothing can drift out of step with anything else, and the whole run is
 *     legible as a single schedule instead of a chain of nested timeouts.
 *   - **It starts finished.** The panel renders the complete transcript — on the
 *     server, so it is in the HTML — and sits still. Nothing animates at you on
 *     arrival.
 *   - **Only the command types.** Output appears whole, after a beat.
 *
 * Replay is deliberate rather than hover-driven. Its trigger lives in the parent
 * section's "Try it out" label, where the invitation and the action are the same
 * thing; reduced-motion readers keep the complete transcript.
 */
const TICK_MS = 100;
/** Beat between a command finishing and its output landing — their `timeCommandRun`. */
const RUN_TICKS = 3;
/** Beat before a new prompt starts typing. A shell you are watching is not in a hurry. */
const PROMPT_TICKS = 4;

type Cue = { block: Block; start: number };

/** Assigns every block the tick it begins on, and reports the tick the run ends. */
function schedule(blocks: Block[]): { cues: Cue[]; end: number } {
  let at = 0;
  const cues = blocks.map((block, index) => {
    if (block.kind === "command") {
      if (index > 0) at += PROMPT_TICKS;
      const start = at;
      at = start + block.text.length + RUN_TICKS;
      return { block, start };
    }
    const start = at;
    at = start + 1;
    return { block, start };
  });
  return { cues, end: at };
}

export function TerminalPanel({
  blocks,
  reserve,
  replayKey = 0,
  onPlayingChange,
  className,
}: {
  blocks: Block[];
  /** Height held for the transcript so the card cannot resize during a replay. */
  reserve: string;
  /** Incremented by the section-level trigger to start or restart the transcript. */
  replayKey?: number;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}) {
  const { cues, end } = useMemo(() => schedule(blocks), [blocks]);
  const [tick, setTick] = useState(end);
  const still = usePrefersReducedMotion();
  const handledReplayKey = useRef(replayKey);

  // The interval exists only while there is something left to advance, so a page
  // sitting at rest is not running a timer that does nothing a hundred times a
  // second. `playing` flips exactly twice per run, so this does not churn.
  const playing = tick < end;
  useEffect(() => onPlayingChange?.(playing), [onPlayingChange, playing]);

  useEffect(() => {
    if (replayKey === handledReplayKey.current) return;
    handledReplayKey.current = replayKey;
    if (!still) setTick(0);
  }, [replayKey, still]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setTick((prev) => (prev >= end ? prev : prev + 1)), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, end]);

  const rows: ReactElement[] = [];
  for (const { block, start } of cues) {
    // Cues are in play order, so the first one still in the future ends the run.
    if (tick < start) break;

    if (block.kind === "command") {
      const typed = block.text.slice(0, tick - start);
      rows.push(
        <span key={`$${start}`} className="text-fd-foreground">
          <span className="mr-2 text-brand">$</span>
          {typed}
          {/* Only while this command is typing. A caret left blinking over a
              finished transcript is decoration impersonating a live session. */}
          {typed.length < block.text.length ? (
            <span className="inline-block h-3 w-1 animate-pulse bg-fd-foreground" />
          ) : null}
        </span>,
      );
      continue;
    }

    for (const [row, line] of block.lines.entries()) {
      rows.push(
        line.verb ? (
          <span key={`${start}.${row}`} className="flex flex-row">
            <span className={cn("w-20 shrink-0 sm:w-24", toneClass[line.tone])}>{line.verb}</span>
            <span className="break-all">{line.text}</span>
          </span>
        ) : (
          <span key={`${start}.${row}`} className={cn("break-all", toneClass[line.tone])}>
            {/* A blank line is the CLI's, and needs a glyph to hold its row open. */}
            {line.text || " "}
          </span>
        ),
      );
    }
  }

  return (
    <div className={cn("rounded-xl border bg-fd-secondary shadow-md", className)}>
      <div className="flex flex-row items-center gap-2 border-b p-2 text-fd-muted-foreground">
        <Terminal className="size-4" aria-hidden="true" />
        <span className="text-xs font-medium" aria-hidden="true">
          Terminal
        </span>
      </div>

      {/* `pre` rather than a stack of paragraphs: the captured column spacing is
          part of the text, and a grid gives each line its own row without margins. */}
      <pre
        aria-hidden="true"
        className={cn(
          "p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-fd-secondary-foreground/85 sm:text-[13px]",
          reserve,
        )}
      >
        <code className="grid">{rows}</code>
      </pre>
    </div>
  );
}
