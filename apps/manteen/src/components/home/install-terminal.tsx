"use client";

import { type Step, TerminalPanel } from "@/components/home/terminal-panel";

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
 * `npx manteen` and `npm exec -- manteen` are the same command and print the
 * same two notices; the docs use the latter because their code blocks render
 * pnpm/yarn/bun tabs from it. What does NOT work is a bare `manteen init` —
 * installing the package does not put its binary on an interactive shell's
 * PATH, and that invocation exits 127.
 *
 * The install counts are of course a moment in time, not a promise.
 */
const firstRun: Step[] = [
  {
    blocks: [
      { kind: "command", text: "npm install --save-dev manteen" },
      { kind: "line", text: "", tone: "note" },
      { kind: "line", text: "added 35 packages, and audited 90 packages in 534ms", tone: "note" },
      { kind: "line", text: "", tone: "note" },
      { kind: "line", text: "found 0 vulnerabilities", tone: "note" },
      { kind: "line", text: "", tone: "note" },
      { kind: "command", text: "npx manteen init" },
      { kind: "line", text: "npm notice run acme-app@0.1.0 npx", tone: "npm" },
      { kind: "line", text: "npm notice run 'manteen' init", tone: "npm" },
      { kind: "line", verb: "written", text: "manteen.json", tone: "write" },
      { kind: "line", verb: "written", text: "postcss.config.cjs", tone: "write" },
      { kind: "line", verb: "written", text: "src/app/layout.tsx", tone: "write" },
      { kind: "line", verb: "written", text: "src/lib/theme.ts", tone: "write" },
      { kind: "line", verb: "written", text: "src/manteen.css", tone: "write" },
    ],
  },
];

export function InstallTerminal({ className }: { className?: string }) {
  return (
    <TerminalPanel
      steps={firstRun}
      // Sized to the finished transcript so the card never grows as it plays.
      // Below `sm` the two commands wrap, which is why the phone reserve is taller.
      reserve="min-h-96 sm:min-h-90"
      className={className}
    />
  );
}
