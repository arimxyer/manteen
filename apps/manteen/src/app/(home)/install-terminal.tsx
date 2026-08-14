"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const command = "npm exec -- manteen add @house/article-card --dry-run";

const output: { text: string; tone: "plan" | "write" | "note" | "ok" }[] = [
  { text: "resolve  @house/article-card", tone: "plan" },
  { text: "plan     3 writes, 1 npm dependency, 1 theme contribution", tone: "plan" },
  { text: "write    components/ui/article-card.tsx", tone: "write" },
  { text: "write    components/ui/article-card.module.css", tone: "write" },
  { text: "write    manteen.lock.json", tone: "write" },
  { text: "note     dry run — nothing was written", tone: "note" },
  { text: "planDigest sha256:9f4c…21ab", tone: "ok" },
];

const toneClass = {
  plan: "text-fd-muted-foreground",
  write: "text-brand",
  note: "text-fd-muted-foreground italic",
  ok: "text-fd-foreground",
} as const;

export function InstallTerminal({ className }: { className?: string }) {
  const [typed, setTyped] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(command.length);
      setRevealed(output.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let chars = 0;
    let lines = 0;

    const tick = () => {
      if (chars < command.length) {
        chars += 1;
        setTyped(chars);
        timer = setTimeout(tick, 26);
        return;
      }
      if (lines < output.length) {
        lines += 1;
        setRevealed(lines);
        timer = setTimeout(tick, 240);
        return;
      }
      timer = setTimeout(() => {
        chars = 0;
        lines = 0;
        setTyped(0);
        setRevealed(0);
        timer = setTimeout(tick, 500);
      }, 4500);
    };

    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    // The animation is decoration over prose the docs already teach, so it is hidden from
    // assistive technology rather than announced one partial line at a time.
    <div className={cn("font-mono text-xs leading-6 sm:text-[13px]", className)} aria-hidden="true">
      <p className="flex flex-row text-fd-foreground">
        <span className="mr-2 text-brand">$</span>
        <span className="break-all">
          {command.slice(0, typed)}
          <span className="caret ml-px inline-block w-[7px] bg-fd-foreground align-text-bottom">
            &nbsp;
          </span>
        </span>
      </p>
      <div className="mt-2 min-h-[10.5rem]">
        {output.slice(0, revealed).map((line) => (
          <p key={line.text} className={cn("break-all", toneClass[line.tone])}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
