/**
 * The receipt's path boundary: absolute (in-memory) <-> POSIX-relative (on disk).
 *
 * `manteen.lock.json` is committed to VCS, so a receipt written on Windows and
 * read on Linux must compare equal. `path.relative` yields backslash separators
 * on Windows, so the conversion happens here and nowhere else — a serialized
 * receipt contains no backslash on any platform.
 *
 * Pure: `node:path` only. No fs, no clock, no env.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ReceiptPath } from "../plan/types";

/** Absolute destination -> the POSIX, root-relative form stored on disk. */
export function toReceiptPath(absolute: string, root: string): ReceiptPath {
  return relative(root, absolute).split(sep).join("/");
}

/** The inverse. Splitting on "/" rather than passing the string straight to
 *  `resolve` is what makes a receipt written on POSIX resolve on Windows. */
export function fromReceiptPath(p: ReceiptPath, root: string): string {
  return resolve(root, ...p.split("/"));
}

/** Manteen-owned state. Registry destinations inside this tree are refused. */
export const MANTEEN_STATE_DIRECTORY = ".manteen";

/**
 * The one current pristine ancestor for a project destination.
 *
 * Mirroring the receipt path makes storage O(installed files), while the
 * `.base` suffix keeps TypeScript/JS source out of compiler globs. The input is
 * already absolute and proven inside `root`; `toReceiptPath` gives the portable
 * relative identity used by the receipt too.
 */
export function basePathFor(absoluteDestination: string, root: string): string {
  const receiptPath = toReceiptPath(absoluteDestination, root);
  const segments = receiptPath.split("/");
  const filename = segments.pop();
  if (filename === undefined || filename === "") {
    throw new Error(`cannot derive a merge base path for ${absoluteDestination}`);
  }
  return resolve(root, MANTEEN_STATE_DIRECTORY, "bases", ...segments, `${filename}.base`);
}

/** Whether an absolute destination reaches Manteen's reserved state tree. */
export function isManteenStatePath(absoluteDestination: string, root: string): boolean {
  const relativePath = toReceiptPath(absoluteDestination, root);
  return (
    relativePath === MANTEEN_STATE_DIRECTORY ||
    relativePath.startsWith(`${MANTEEN_STATE_DIRECTORY}/`)
  );
}

/**
 * Why this stored path is not usable, or null when it is fine.
 *
 * Enforced here *and* by the schema's `pattern`, on purpose. The schema cannot
 * express the `.`/`..` segment rule cleanly and — more to the point — a caller
 * may inject a no-op validator, so every rule that keeps a hand-edited receipt
 * from redirecting a write outside the project has to exist in code.
 *
 * The returned string is a fragment, not a sentence: callers compose it into a
 * `receipt-unreadable` message that already names the file.
 */
export function receiptPathProblem(p: unknown): string | null {
  if (typeof p !== "string") return "is not a string";
  if (p === "") return "is empty";
  if (p.includes("\\")) return "contains a backslash (paths are stored POSIX-style)";
  if (p.startsWith("/") || isAbsolute(p)) return "is absolute";
  // A Windows drive letter is not `isAbsolute` when this runs on POSIX, so it
  // has to be spelled out — a receipt is read on platforms it was not written on.
  if (/^[A-Za-z]:/.test(p)) return "names a drive letter";
  for (const segment of p.split("/")) {
    if (segment === "") return "contains an empty path segment";
    if (segment === "." || segment === "..") return `contains a "${segment}" segment`;
  }
  return null;
}
