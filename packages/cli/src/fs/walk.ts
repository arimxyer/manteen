/**
 * A bounded, deterministic walk over a project's source files.
 *
 * IMPURE by the §1 convention — `src/fs/` is one of the directories the purity
 * rule names as filesystem-owning. It exists so that `gates/provider.ts` can
 * stay pure: the gate takes a `SourceWalker` as a parameter and never imports
 * `node:fs` itself, which is what makes it testable against a hand-rolled array
 * with no filesystem at all.
 *
 * Three properties are load-bearing, and each one is a bug that was designed
 * out rather than a nicety:
 *
 * 1. **`node_modules` is excluded structurally, not by budget.** `@mantine/core`
 *    alone contains 727 files mentioning `MantineProvider` (measured, v9.5.0),
 *    and this repo — a small one — has 74k files under `node_modules` against
 *    110 outside it, a 677:1 ratio. A walk that descends there does not merely
 *    get slow: it reports the provider check *satisfied* on 100% of projects
 *    that have Mantine installed. No node ceiling saves you from that, because
 *    the first false positive arrives long before the ceiling does.
 *
 * 2. **Directory entries are sorted, and the walk is pre-order DFS.** With a
 *    visitor that can stop the walk early AND a file ceiling, unsorted iteration
 *    would make the truncated case non-reproducible: two runs over the same tree
 *    could read different prefixes and print different messages. Sorting is
 *    UTF-16 code units, never `localeCompare` — the ordering must not depend on
 *    the machine's `LANG`.
 *
 * 3. **Symlinked directories are not followed.** `Dirent.isDirectory()` reflects
 *    an `lstat`, so a symlink to a directory answers `false` and is never pushed
 *    onto the stack. That is the whole cycle defence, and it is also a second
 *    line against pnpm/bun stores, whose `node_modules/<pkg>` entries are links
 *    into `.pnpm`/`.bun`. The cost is that a symlinked *source* file is skipped
 *    too, which is a false negative the provider check tolerates because it
 *    only ever warns.
 *
 * The plan gives no numbers for this walk. D25's depth ≤ 20 / nodes ≤ 200 /
 * 8 MB are the *registry network* walk — a 200-node ceiling here would be
 * exhausted by a single `src/components` directory. `DEFAULT_WALK_LIMITS` below
 * is therefore a decision made at this file, and it is reported rather than
 * assumed: `WalkReport.complete` tells the caller whether the answer covers the
 * whole tree, so a caller can say "not found" and "stopped looking" in different
 * sentences.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/** One file the walk read, handed to the visitor. */
export interface WalkedFile {
  /** Absolute. */
  path: string;
  text: string;
}

/**
 * Why the walk ended early, or `null` when it read the whole tree.
 *
 * `"visitor"` is NOT truncation: the caller found what it was looking for and
 * asked to stop, so the answer is complete even though the walk is not.
 */
export type WalkStop = "visitor" | "file-limit" | "byte-limit";

export interface WalkReport {
  /** Files whose text was handed to the visitor. */
  filesRead: number;
  stoppedBy: WalkStop | null;
  /** Directories not descended into because `maxDepth` was reached. */
  prunedDirs: number;
  /** Files matching the filter that were not read: too large, or an IO error. */
  skippedFiles: number;
  /**
   * Directories that could not be listed at all — permissions, or gone mid-walk.
   *
   * Counted apart from `skippedFiles` on purpose. One unreadable directory can
   * hide four hundred source files, and folding it into a file count makes the
   * report say "1 file was unreadable" about four hundred — the exact
   * overstatement `WalkReport.complete` exists to prevent.
   */
  skippedDirs: number;
  /**
   * Every file the filter selected under `root` was read.
   *
   * False the moment anything was left unread for a reason the caller did not
   * choose — a limit, a depth prune, an unreadable file. A caller that reports
   * an absence MUST branch on this: "not found in the whole tree" and "not found
   * in the part I looked at" are different claims, and only the first one is a
   * fact about the project.
   */
  complete: boolean;
}

/** `true` stops the walk. Any other return continues it. */
export type WalkVisitor = (file: WalkedFile) => boolean | void;

export type SourceWalker = (root: string, visit: WalkVisitor) => WalkReport;

export interface WalkLimits {
  /** `root` is depth 0. A directory at `maxDepth` is read but not descended. */
  maxDepth: number;
  maxFiles: number;
  /** Per file. A file over this is SKIPPED, never fatal — a generated bundle
   *  sitting in `src/` must not end the walk and turn a real answer into a
   *  bounded one. */
  maxFileBytes: number;
  /** Across the walk. The backstop for many medium files, which the per-file
   *  cap does not bound. */
  maxTotalBytes: number;
  /** Matched on the directory's own name at any depth. */
  skipDirs: ReadonlySet<string>;
  /** Matched on `extname()`, dot included. */
  extensions: ReadonlySet<string>;
}

/**
 * Directories that cannot contain a mount the user wrote.
 *
 * Dot-directories are deliberately NOT skipped as a class. `.storybook/preview.tsx`
 * is one of the places a provider legitimately lives (D13 names it explicitly),
 * so a blanket dotfile rule would trade one false pass for a false negative in a
 * shape that actually occurs.
 */
export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".yarn",
  ".pnpm-store",
  ".svelte-kit",
  ".vercel",
  ".astro",
  "storybook-static",
  ".venv",
  "__pycache__",
]);

/**
 * Extensions that can carry a JSX mount.
 *
 * `.astro` is included even though Astro has no single provider mount point
 * (islands each need their own) — it costs one set member and the alternative is
 * a guaranteed miss on every Astro project.
 */
export const DEFAULT_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".astro",
]);

/**
 * Chosen here, not given by the plan. Sized so that a realistic Next or Vite app
 * is walked in full — `complete: true` is the normal outcome, and a bounded
 * answer is the exception a message has to explain.
 */
export const DEFAULT_WALK_LIMITS: WalkLimits = {
  maxDepth: 12,
  maxFiles: 2000,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  skipDirs: DEFAULT_SKIP_DIRS,
  extensions: DEFAULT_SOURCE_EXTENSIONS,
};

/**
 * A walker with the default limits, or any of them overridden.
 *
 * Returns a function rather than exposing `walkSources(root, visit, limits)`
 * directly so the limits are bound once at the composition site and every caller
 * downstream sees the same one-argument port.
 */
export function createSourceWalker(overrides: Partial<WalkLimits> = {}): SourceWalker {
  const limits: WalkLimits = { ...DEFAULT_WALK_LIMITS, ...overrides };
  return (root, visit) => walkSources(root, visit, limits);
}

export function walkSources(root: string, visit: WalkVisitor, limits: WalkLimits): WalkReport {
  let filesRead = 0;
  let prunedDirs = 0;
  let skippedFiles = 0;
  let skippedDirs = 0;
  let totalBytes = 0;
  let stoppedBy: WalkStop | null = null;

  // An explicit stack rather than recursion: `maxDepth` is a policy bound, not a
  // stack-overflow guard, and a deep tree must not be able to blow the call
  // stack before the policy bound is reached.
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];

  while (stoppedBy === null) {
    const frame = stack.pop();
    if (frame === undefined) break;

    let entries;
    try {
      entries = readdirSync(frame.dir, { withFileTypes: true });
    } catch {
      // Unreadable directory (permissions, or it vanished mid-walk). `complete`
      // goes false — we genuinely did not look, and we cannot know at what cost.
      skippedDirs += 1;
      continue;
    }
    entries.sort((a, b) => compare(a.name, b.name));

    const subdirectories: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // A symlinked directory answers `false` to isDirectory() (Dirent is an
        // lstat), so it never reaches here — see property 3 in the header.
        if (!limits.skipDirs.has(entry.name)) subdirectories.push(entry.name);
        continue;
      }
      if (!entry.isFile()) continue; // symlinks, sockets, fifos, devices
      if (!limits.extensions.has(extname(entry.name))) continue;

      if (filesRead >= limits.maxFiles) {
        stoppedBy = "file-limit";
        break;
      }
      if (totalBytes >= limits.maxTotalBytes) {
        stoppedBy = "byte-limit";
        break;
      }

      const path = join(frame.dir, entry.name);

      // `statSync` before `readFileSync`, so an enormous file is never read into
      // memory just to be discarded. One extra syscall per candidate file, paid
      // only after the extension filter.
      let size: number;
      try {
        size = statSync(path).size;
      } catch {
        skippedFiles += 1;
        continue;
      }
      if (size > limits.maxFileBytes) {
        skippedFiles += 1;
        continue;
      }

      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        skippedFiles += 1;
        continue;
      }

      filesRead += 1;
      totalBytes += size;
      if (visit({ path, text }) === true) {
        stoppedBy = "visitor";
        break;
      }
    }

    if (stoppedBy !== null) break;

    if (frame.depth >= limits.maxDepth) {
      prunedDirs += subdirectories.length;
      continue;
    }
    // Pushed in reverse so the sorted first child pops first: pre-order DFS in
    // name order, which is what makes a truncated walk reproducible.
    for (const name of [...subdirectories].reverse()) {
      stack.push({ dir: join(frame.dir, name), depth: frame.depth + 1 });
    }
  }

  // `"visitor"` is absent from this test on purpose: the caller stopping because
  // it has its answer leaves the answer complete.
  const complete =
    stoppedBy !== "file-limit" &&
    stoppedBy !== "byte-limit" &&
    prunedDirs === 0 &&
    skippedFiles === 0 &&
    skippedDirs === 0;

  return { filesRead, stoppedBy, prunedDirs, skippedFiles, skippedDirs, complete };
}

/** UTF-16 code units, locale-independent. Never `localeCompare`. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
