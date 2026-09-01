/**
 * The pre-image journal, and the only place in this package that writes a file.
 *
 * Two invariants live here and nowhere else:
 *
 * 1. **Every write is temp + `renameSync` within the destination's own
 *    directory.** Rename is atomic on POSIX only when both paths sit on the same
 *    filesystem, and the only way to guarantee that without probing mounts is to
 *    put the temp beside the target — never in `os.tmpdir()`. A crash can then
 *    leave a stray temp, but it can never leave a half-written file the user
 *    owns. `src/lib/theme.ts` and `manteen.lock.json` get exactly the same
 *    treatment as a fresh component (D18), because they are the two files most
 *    likely to already be in the user's git history.
 * 2. **The pre-image is read before anything is created**, so an unwind is a
 *    restore rather than a guess. `null` means the file did not exist, which
 *    makes its unwind an unlink.
 *
 * Best-effort, in memory, by design: §6 defers persisting the journal. A SIGKILL
 * mid-phase-3 leaves the tree partially written, which is why apply() writes the
 * receipt LAST — an interrupted run under-claims ownership, and under-claiming
 * only costs a redundant prompt.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Hidden so editors and watchers ignore it; swept by `unwind()` either way. */
export const TEMP_PREFIX = ".manteen-tmp-";

export interface JournalEntry {
  destination: string;
  /** Bytes at `destination` before this run touched it; `null` when absent. */
  preImage: Buffer | null;
}

export interface UnwindResult {
  ok: boolean;
  /** Destinations the unwind could not restore — the paths worth naming in a
   *  `git checkout --` message. Empty when `ok`. */
  unrestored: string[];
  detail: string | null;
}

export interface Journal {
  /**
   * Journal `destination`'s current bytes, then replace them with `content`.
   *
   * `content` is written as UTF-8 with no BOM and no newline translation. That
   * is load-bearing, not incidental: `PlannedFile.sha256` hashes the UTF-8
   * encoding of this string while `PlannedFile.existing.sha256` hashes the raw
   * bytes on disk, and the two are only comparable because this call does not
   * transform anything. A `--crlf` or BOM-preserving mode would silently break
   * every drift comparison the receipt makes.
   */
  write(destination: string, content: string): void;
  /** Refuse if the destination no longer has the reviewed pre-image. */
  writeChecked(destination: string, expectedSha256: string, content: string): void;
  /** Capture bytes without changing them so a later verifier mutation can be unwound. */
  capture?(destination: string): void;
  /** Journal and remove a Manteen-owned state file. Absence is a no-op. */
  remove(destination: string): void;
  /** In write order. Read it BEFORE `unwind()`, which clears the log. */
  entries(): readonly JournalEntry[];
  /** LIFO restore. Safe to call once; the log is cleared so it cannot double-run. */
  unwind(): UnwindResult;
}

function readPreImage(destination: string): Buffer | null {
  try {
    return readFileSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // EACCES, EISDIR, ELOOP: a file we cannot read is a file we cannot restore,
    // so refuse to journal it rather than recording a `null` pre-image whose
    // unwind would unlink the user's data.
    throw error;
  }
}

export function createJournal(): Journal {
  const entries: JournalEntry[] = [];
  const temps = new Set<string>();

  /** temp + rename, cleaning the temp on any failure so none survives. */
  function place(destination: string, bytes: Buffer | string): void {
    const temp = join(dirname(destination), `${TEMP_PREFIX}${randomBytes(6).toString("hex")}`);
    temps.add(temp);
    try {
      if (typeof bytes === "string") writeFileSync(temp, bytes, "utf8");
      else writeFileSync(temp, bytes);
      renameSync(temp, destination);
      temps.delete(temp);
    } catch (error) {
      try {
        rmSync(temp, { force: true });
        temps.delete(temp);
      } catch {
        // Deliberately left in `temps` so `unwind()`'s sweep gets a second try;
        // dropping it here is how a `.manteen-tmp-*` survives the run.
      }
      throw error;
    }
  }

  return {
    capture(destination) {
      entries.push({ destination, preImage: readPreImage(destination) });
    },

    write(destination, content) {
      const preImage = readPreImage(destination);
      mkdirSync(dirname(destination), { recursive: true });
      // Recorded before the write, so a rename that fails halfway is still
      // covered. Restoring an unchanged file is a no-op; not recording one that
      // did change is unrecoverable.
      entries.push({ destination, preImage });
      place(destination, content);
    },

    writeChecked(destination, expectedSha256, content) {
      const preImage = readPreImage(destination);
      const actualSha256 =
        preImage === null ? null : createHash("sha256").update(preImage).digest("hex");
      if (actualSha256 !== expectedSha256) {
        throw new Error("The destination changed immediately before the configuration write.");
      }
      entries.push({ destination, preImage });
      place(destination, content);
    },

    remove(destination) {
      const preImage = readPreImage(destination);
      if (preImage === null) return;
      entries.push({ destination, preImage });
      rmSync(destination);
    },

    entries() {
      return entries;
    },

    unwind() {
      const unrestored: string[] = [];
      const details: string[] = [];

      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined) continue;
        try {
          if (entry.preImage === null) rmSync(entry.destination, { force: true });
          else place(entry.destination, entry.preImage);
        } catch (error) {
          unrestored.push(entry.destination);
          details.push(
            `${entry.destination}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      entries.length = 0;

      // Anything `place()` could not clean up itself — a temp whose `rmSync`
      // also threw. "leave no .manteen-tmp-*" is an assertion the e2e tier makes.
      for (const temp of temps) {
        try {
          rmSync(temp, { force: true });
        } catch {
          // The tree is already being reported as inconsistent; a stray temp is
          // the least of it, and throwing here would mask the real failure.
        }
      }
      temps.clear();

      return {
        ok: unrestored.length === 0,
        unrestored,
        detail: details.length > 0 ? details.join("; ") : null,
      };
    },
  };
}
