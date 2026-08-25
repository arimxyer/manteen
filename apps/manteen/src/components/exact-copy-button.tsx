"use client";

import { Check, Clipboard, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

export function ExactCopyButton({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await writeExactText(code, (value) => navigator.clipboard.writeText(value));
      setState("copied");
    } catch {
      setState("failed");
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2_000);
  }

  const accessibleLabel =
    state === "copied" ? `${label}: copied` : state === "failed" ? `${label}: copy failed` : label;

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="ms-3 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
    >
      {state === "copied" ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : state === "failed" ? (
        <TriangleAlert aria-hidden="true" className="size-3.5" />
      ) : (
        <Clipboard aria-hidden="true" className="size-3.5" />
      )}
      <span>
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy exact"}
      </span>
    </button>
  );
}

export function writeExactText(
  code: string,
  writeText: (value: string) => Promise<void>,
): Promise<void> {
  return writeText(code);
}
