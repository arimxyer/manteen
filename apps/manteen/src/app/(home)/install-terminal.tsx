"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const command = "npm exec -- manteen add @house/article-card --dry-run";

/**
 * Verbatim stdout from that command, captured against this repository's own
 * catalog compiled to a `file:` registry. The blank line before the closing
 * notice is the CLI's, not padding — keep it.
 */
const output: { text: string; tone: "write" | "note" }[] = [
  { text: "create     LICENSES/MANTINE-UI.txt", tone: "write" },
  { text: "create     src/components/ui/article-card.tsx", tone: "write" },
  { text: "create     src/components/ui/article-card.module.css", tone: "write" },
  { text: "", tone: "note" },
  { text: "Dry run — nothing was written.", tone: "note" },
];

const toneClass = {
  write: "text-brand",
  note: "text-fd-muted-foreground",
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
      <div className="mt-2 min-h-[7.5rem]">
        {output.slice(0, revealed).map((line, index) => (
          // Line order is fixed and the list never reorders, so the index is a stable identity —
          // the text is not, since one line is intentionally blank.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <p key={index} className={cn("break-all", toneClass[line.tone])}>
            {line.text || " "}
          </p>
        ))}
      </div>
    </div>
  );
}
