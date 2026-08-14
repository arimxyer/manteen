"use client";

import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Tone = "write" | "keep" | "head" | "note";

/**
 * One output line. `verb` is the status column the CLI prints before a path;
 * lines without one are headers, blanks, or closing notices.
 */
type Line = { verb?: string; text: string; tone: Tone };

type Step = { command: string; output: Line[] };

/**
 * The install lifecycle, in the order a project actually runs it: configure,
 * read the plan, apply it, adapt the source, then take upstream changes.
 *
 * Every command and every output line is verbatim from a real run — captured
 * against this repository's own catalog compiled to a `file:` registry, in a
 * Next app fixture shaped like `packages/cli/e2e`'s. Two things follow from
 * that and should survive future edits:
 *
 * - The blank line before a closing notice is the CLI's, not padding.
 * - This is stdout only. The CLI also writes `info`/`skip` notes to stderr,
 *   which are deliberately omitted: a captured interleave of the two streams
 *   is not reproducible, so showing one would be staging rather than quoting.
 *
 * Column spacing is layout, not bytes — the real output pads the status column
 * with spaces, and here it is a fixed-width span instead.
 */
const steps: Step[] = [
  {
    command: "manteen init",
    output: [
      { verb: "written", text: "manteen.json", tone: "write" },
      { verb: "written", text: "postcss.config.cjs", tone: "write" },
      { verb: "written", text: "src/app/layout.tsx", tone: "write" },
      { verb: "written", text: "src/lib/theme.ts", tone: "write" },
      { verb: "written", text: "src/manteen.css", tone: "write" },
    ],
  },
  {
    command: "manteen add @house/article-card --dry-run",
    output: [
      { verb: "create", text: "LICENSES/MANTINE-UI.txt", tone: "write" },
      { verb: "create", text: "src/components/ui/article-card.tsx", tone: "write" },
      { verb: "create", text: "src/components/ui/article-card.module.css", tone: "write" },
      { text: "", tone: "note" },
      { text: "Dry run — nothing was written.", tone: "note" },
    ],
  },
  {
    command: "manteen add @house/article-card",
    output: [
      { verb: "written", text: "LICENSES/MANTINE-UI.txt", tone: "write" },
      { verb: "written", text: "src/components/ui/article-card.tsx", tone: "write" },
      { verb: "written", text: "src/components/ui/article-card.module.css", tone: "write" },
      { verb: "written", text: "manteen.lock.json", tone: "write" },
    ],
  },
  {
    command: "manteen diff @house/article-card --stat",
    output: [
      { text: "@house/article-card  @house", tone: "head" },
      { verb: "local-only", text: "src/components/ui/article-card.tsx", tone: "keep" },
      { text: "", tone: "note" },
      { text: "1 change, 1 unchanged.", tone: "note" },
    ],
  },
  {
    command: "manteen update @house/article-card --dry-run",
    output: [
      { verb: "identical", text: "LICENSES/MANTINE-UI.txt", tone: "keep" },
      { verb: "identical", text: "src/components/ui/article-card.tsx", tone: "keep" },
      { verb: "identical", text: "src/components/ui/article-card.module.css", tone: "keep" },
      { text: "", tone: "note" },
      { text: "Dry run — nothing was written.", tone: "note" },
    ],
  },
];

/** Rotation is motion too, so reduced motion gets one step, held: the plan. */
const staticStep = 1;

const toneClass = {
  write: "text-brand",
  keep: "text-fd-muted-foreground",
  head: "text-fd-foreground",
  note: "text-fd-muted-foreground",
} as const;

const TYPE_MS = 26;
const LINE_MS = 240;
const HOLD_MS = 4500;

export function InstallTerminal({ className }: { className?: string }) {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(staticStep);
      setTyped(steps[staticStep].command.length);
      setRevealed(steps[staticStep].output.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    let chars = 0;
    let lines = 0;

    const tick = () => {
      const current = steps[index];
      if (chars < current.command.length) {
        chars += 1;
        setTyped(chars);
        timer = setTimeout(tick, TYPE_MS);
        return;
      }
      if (lines < current.output.length) {
        lines += 1;
        setRevealed(lines);
        timer = setTimeout(tick, LINE_MS);
        return;
      }
      timer = setTimeout(() => {
        index = (index + 1) % steps.length;
        chars = 0;
        lines = 0;
        setStep(index);
        setTyped(0);
        setRevealed(0);
        timer = setTimeout(tick, 500);
      }, HOLD_MS);
    };

    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, []);

  const current = steps[step];

  return (
    // The animation is decoration over prose the docs already teach, so the whole
    // widget is hidden from assistive technology rather than announced one partial
    // line — or one rotation — at a time.
    <div
      className={cn("rounded-xl border bg-fd-secondary shadow-md", className)}
      aria-hidden="true"
    >
      <div className="flex flex-row items-center gap-2 border-b p-2 text-fd-muted-foreground">
        <Terminal className="size-4" />
        <span className="text-xs font-medium">Terminal</span>
        <div className="me-1 ms-auto flex flex-row items-center gap-1.5">
          {steps.map((entry, index) => (
            <span
              key={entry.command}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-500",
                index === step ? "bg-brand" : "bg-fd-muted-foreground/30",
              )}
            />
          ))}
        </div>
      </div>

      <div className="p-3 font-mono text-xs leading-6 text-fd-secondary-foreground/85 sm:text-[13px]">
        {/* Two lines reserved: the longest command wraps on a phone, and a card that
            resized every rotation would pulse. */}
        <p className="flex min-h-12 flex-row text-fd-foreground sm:min-h-6">
          <span className="mr-2 text-brand">$</span>
          <span className="break-all">
            {current.command.slice(0, typed)}
            <span className="caret ml-px inline-block w-[7px] bg-fd-foreground align-text-bottom">
              &nbsp;
            </span>
          </span>
        </p>

        {/* Sized to the tallest step so the card never resizes mid-rotation. Below `sm`
            the long destination paths wrap, which is why the phone reserve is taller. */}
        <div className="mt-2 min-h-42 sm:min-h-30">
          {current.output.slice(0, revealed).map((line, index) => (
            // Within a step the line order is fixed and never reorders, so the index is
            // a stable identity — the text is not, since a line may be blank.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <p key={index} className="flex flex-row">
              {line.verb ? (
                <span className={cn("w-20 shrink-0 sm:w-24", toneClass[line.tone])}>
                  {line.verb}
                </span>
              ) : null}
              {/* pre-wrap, because a header line's internal column spacing is part of the
                  captured text and HTML would otherwise collapse it to one space. */}
              <span
                className={cn(
                  "whitespace-pre-wrap break-all",
                  line.verb ? undefined : toneClass[line.tone],
                )}
              >
                {line.text || " "}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
