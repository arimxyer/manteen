"use client";

import { type Block, TerminalPanel } from "@/components/home/terminal-panel";

/**
 * A project's first two minutes with Manteen, in the order the getting-started
 * guide runs them: install the CLI as a dev dependency, then initialize.
 *
 * Verbatim, and verbatim in an exacting sense — this is one session's merged
 * stdout/stderr transcript of exactly these two commands, captured against the
 * published `manteen` installed from npm into a throwaway Next application.
 * Merging the streams in the shell is what makes the ordering real rather than
 * an artefact of two pipes, which is why npm's own `notice` lines appear where
 * they do. Nothing is trimmed: the blank lines are npm's and the CLI's.
 *
 * The grouping is the one editorial decision. Each `output` block is a batch that
 * lands together, so the run has three beats — npm's install summary, npm's two
 * notices about what it is about to execute, and then the files Manteen writes.
 * That last group is the one the section is selling, and it arrives alone.
 *
 * `npx manteen` and `npm exec -- manteen` are the same command and print the
 * same two notices; the docs use the latter because their code blocks render
 * pnpm/yarn/bun tabs from it. What does NOT work is a bare `manteen init` —
 * installing the package does not put its binary on an interactive shell's
 * PATH, and that invocation exits 127.
 *
 * The install counts are of course a moment in time, not a promise.
 */
const firstRun: Block[] = [
  { kind: "command", text: "npm install --save-dev manteen" },
  {
    kind: "output",
    lines: [
      { text: "", tone: "note" },
      { text: "added 35 packages, and audited 90 packages in 534ms", tone: "note" },
      { text: "", tone: "note" },
      { text: "found 0 vulnerabilities", tone: "note" },
      { text: "", tone: "note" },
    ],
  },
  { kind: "command", text: "npx manteen init" },
  {
    kind: "output",
    lines: [
      { text: "npm notice run acme-app@0.1.0 npx", tone: "npm" },
      { text: "npm notice run 'manteen' init", tone: "npm" },
    ],
  },
  {
    kind: "output",
    lines: [
      { verb: "written", text: "manteen.json", tone: "write" },
      { verb: "written", text: "postcss.config.cjs", tone: "write" },
      { verb: "written", text: "src/app/layout.tsx", tone: "write" },
      { verb: "written", text: "src/lib/theme.ts", tone: "write" },
      { verb: "written", text: "src/manteen.css", tone: "write" },
    ],
  },
];

export function InstallTerminal({
  replayKey,
  onPlayingChange,
  className,
}: {
  replayKey?: number;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}) {
  return (
    <TerminalPanel
      blocks={firstRun}
      // Sized to the finished transcript, which is also the state it loads in.
      // It matters during a replay, where a short reserve would let the card
      // collapse to one line and grow back. Below `sm` the commands wrap.
      reserve="min-h-96 sm:min-h-90"
      replayKey={replayKey}
      onPlayingChange={onPlayingChange}
      className={className}
    />
  );
}
