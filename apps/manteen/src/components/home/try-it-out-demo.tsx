"use client";

import { Check, Play, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { InstallTerminal } from "@/components/home/install-terminal";
import { usePrefersReducedMotion } from "@/components/home/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";

/**
 * The section label is also the demo's trigger. That puts replay where the page
 * already asks the reader to act, instead of hiding transport chrome inside a
 * terminal they are meant to read.
 */
export function TryItOutDemo({ command }: { command: ReactNode }) {
  const [replayKey, setReplayKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const onPlayingChange = useCallback((next: boolean) => setPlaying(next), []);

  return (
    <div className="mx-auto w-full max-w-[860px] rounded-2xl border bg-fd-card p-2 shadow-lg">
      <div className="flex flex-row gap-2 max-sm:flex-col">
        <div className="flex shrink-0 max-sm:w-full">
          <h2 className="sr-only">Try it out</h2>
          <button
            type="button"
            aria-label={
              reduceMotion
                ? "Terminal transcript shown in full"
                : playing
                  ? "Restart terminal demonstration"
                  : "Play terminal demonstration"
            }
            title={
              reduceMotion
                ? "Terminal transcript shown in full"
                : playing
                  ? "Restart terminal demonstration"
                  : "Play terminal demonstration"
            }
            disabled={reduceMotion === true}
            onClick={() => setReplayKey((current) => current + 1)}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand/40 px-3 py-1 font-mono text-sm font-bold text-brand uppercase transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-fd-card focus-visible:outline-none active:scale-[0.97] disabled:border-brand/25 disabled:text-brand/70 motion-reduce:transition-colors motion-reduce:active:scale-100",
              playing && "border-brand/70 bg-brand/10",
              reduceMotion && "cursor-default",
            )}
          >
            {reduceMotion ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : playing ? (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5 fill-current" aria-hidden="true" />
            )}
            Try it out
          </button>
        </div>
        {command}
      </div>

      {/* The block above is the command to copy; the terminal below is that same
          command running, and what a project's first init prints after it. */}
      <InstallTerminal replayKey={replayKey} onPlayingChange={onPlayingChange} className="mt-2" />
    </div>
  );
}
