/**
 * Does this project's own `.gitignore` ignore Manteen's state tree?
 *
 * D39 refused to make Manteen depend on Git, and that still holds: nothing here
 * shells out, reads Git's index, or claims a path is tracked. This reads one
 * ordinary text file the user wrote and looks for a line that names `.manteen`.
 *
 * The distinction D39 did not draw, and the reason this exists: "cannot prove a
 * guarantee" and "cannot help at all" are different claims. A `.gitignore` parse
 * genuinely cannot prove the state tree WILL be committed — patterns compose,
 * rules live in `.git/info/exclude` and a global ignore file this never reads,
 * and a later commit can undo anything. But `.manteen/` sits beside `.next/`,
 * `.turbo/` and `.astro/`, so a reasonable person ignores it, and that single
 * mistake breaks every future `update`. Catching the common spelling of the
 * likeliest mistake is worth having even when the general problem is undecidable.
 *
 * What makes that safe is the asymmetry: this only ever ESCALATES an advisory
 * that prints either way. A `false` means "no rule this recognizes", never "your
 * state is tracked", so a missed spelling costs nothing that was not already the
 * status quo — and nothing is ever gated on the answer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MANTEEN_STATE_DIRECTORY } from "../receipt/path";

/**
 * The spellings people actually write for a directory at the repository root.
 *
 * Deliberately a literal set rather than a `.gitignore` pattern engine. A
 * partial engine is the worse artifact: it looks authoritative, and every gap
 * reads as "not ignored" with more confidence than the list below earns.
 */
const IGNORED_SPELLINGS: ReadonlySet<string> = new Set(
  [
    MANTEEN_STATE_DIRECTORY,
    `${MANTEEN_STATE_DIRECTORY}/`,
    `/${MANTEEN_STATE_DIRECTORY}`,
    `/${MANTEEN_STATE_DIRECTORY}/`,
    `${MANTEEN_STATE_DIRECTORY}/*`,
    `${MANTEEN_STATE_DIRECTORY}/**`,
    `**/${MANTEEN_STATE_DIRECTORY}`,
    `**/${MANTEEN_STATE_DIRECTORY}/`,
  ].map((pattern) => pattern),
);

/**
 * Last match wins, negation included — that is Git's own precedence, and it is
 * the one rule that would otherwise produce a confidently wrong answer rather
 * than a merely incomplete one. A project that ignores `.manteen` and then
 * re-includes it with `!.manteen` is correctly configured, and warning at it
 * would train the reader to ignore the advisory that matters.
 */
export function manteenStateIsGitIgnored(root: string): boolean {
  let ignored = false;
  let bytes: string;
  try {
    bytes = readFileSync(resolve(root, ".gitignore"), "utf8");
  } catch {
    // Absent, unreadable, a directory — all mean the same thing to a reporter
    // that is allowed to answer "no rule I recognize" and nothing more.
    return false;
  }

  for (const raw of bytes.split(/\r?\n/)) {
    // Trailing spaces are not part of a Git pattern unless escaped; leading
    // space is. Neither appears in a hand-written `.manteen` line, so trim and
    // move on rather than implementing the escape rules.
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const pattern = negated ? line.slice(1) : line;
    if (IGNORED_SPELLINGS.has(pattern)) ignored = !negated;
  }

  return ignored;
}
