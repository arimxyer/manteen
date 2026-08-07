/**
 * Read-only filesystem snapshots for D42's removal planner.
 *
 * Absence is authority only when `lstat` itself reports ENOENT. Everything
 * else, including a path that disappears between lstat and read, is an
 * unsupported state: the planner cannot promise that the byte journal could
 * restore what it did not inspect.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { RemovalPathSnapshot } from "./types";

export function snapshotRemovalPath(path: string, root: string): RemovalPathSnapshot {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const beneathRoot = relative(absoluteRoot, absolutePath);
  if (beneathRoot === "" || beneathRoot.startsWith("..") || isAbsolute(beneathRoot)) {
    return { kind: "unsupported", reason: "the path is outside the project root" };
  }

  const segments = beneathRoot.split(sep);
  let current = absoluteRoot;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let entry: ReturnType<typeof lstatSync>;
    try {
      entry = lstatSync(current);
    } catch (error) {
      const code = errno(error);
      return code === "ENOENT"
        ? { kind: "missing" }
        : { kind: "unsupported", reason: `lstat failed (${code})` };
    }

    if (entry.isSymbolicLink()) {
      return {
        kind: "unsupported",
        reason:
          index === segments.length - 1
            ? "the path is a symbolic link"
            : "a parent path component is a symbolic link or junction",
      };
    }
    if (index < segments.length - 1) {
      if (!entry.isDirectory()) {
        return { kind: "unsupported", reason: "a parent path component is not a directory" };
      }
      continue;
    }
    if (!entry.isFile()) {
      return { kind: "unsupported", reason: "the path is not a regular file" };
    }
  }

  try {
    const bytes = readFileSync(absolutePath);
    return {
      kind: "regular",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    return { kind: "unsupported", reason: `read failed (${errno(error)})` };
  }
}

function errno(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = (error as { code: unknown }).code;
    if (typeof value === "string") return value;
  }
  return "unknown error";
}
