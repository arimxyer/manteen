/**
 * Reading `manteen.lock.json`: parse, validate, index.
 *
 * Pure. The one fs touch and the one ajv schema load both live in the caller
 * (`plan/index.ts`), injected as `ReceiptReader` and `ReceiptValidator`. That is
 * not ceremony — §1's purity convention exists because "module labeled pure but
 * does I/O" was a recurring finding, and a parser that reaches for its own
 * schema file is exactly that shape.
 *
 * `plan()` may read disk; it never writes. Nothing in this module writes.
 */
import { resolve } from "node:path";

import {
  RECEIPT_FILENAME,
  RECEIPT_VERSION,
  type Receipt,
  type ReceiptIndex,
  type ReceiptOwnerRef,
  type ReceiptState,
  type ReceiptUnreadable,
  type ThemeSourceKind,
} from "../plan/types";
import { fromReceiptPath, receiptPathProblem } from "./path";

/**
 * What the injected reader hands back.
 *
 * `sha256` is of the RAW BYTES, and `raw` is those bytes decoded as UTF-8. Both
 * ride together because apply's preflight compares the hash while phase 7
 * compares the text, and re-deriving either from the other is where the hash
 * domain quietly diverges.
 *
 * **The implementation MUST THROW for any read failure that is not absence**
 * (EACCES, EISDIR, …). Only ENOENT may become `{ present: false }`. Reporting an
 * unreadable-but-present receipt as absent lets the next successful run merge
 * from `null` and destroy every prior ownership record. This requirement now
 * lives in the injected implementation, so it is stated at the injection point.
 */
export type ReceiptRead = { present: false } | { present: true; raw: string; sha256: string };

export type ReceiptReader = (path: string) => ReceiptRead;

/** Returns `true`, or the ajv error text. */
export type ReceiptValidator = (doc: unknown) => true | string;

export type ParsedReceipt =
  | { ok: true; receipt: Receipt }
  | { ok: false; reason: ReceiptUnreadable; detail: string; sawVersion?: number };

const SHA256 = /^[0-9a-f]{64}$/;
const THEME_SOURCE_KINDS: readonly ThemeSourceKind[] = ["absorbed-file", "meta-fragment"];

export function receiptPathFor(root: string): string {
  return resolve(root, RECEIPT_FILENAME);
}

/**
 * Read the receipt beside `manteen.json`.
 *
 * The raw bytes and their hash are captured on BOTH present arms: preflight
 * needs the hash even for an unreadable file that `--force` is about to
 * overwrite, and phase 7 needs the text for its byte-equality skip.
 */
export function readReceipt(
  root: string,
  read: ReceiptReader,
  validate: ReceiptValidator,
): ReceiptState {
  const path = receiptPathFor(root);
  const found = read(path);
  if (!found.present) return { present: false, path };

  const parsed = parseReceipt(found.raw, validate);
  if (parsed.ok) {
    return {
      present: true,
      ok: true,
      path,
      sha256: found.sha256,
      raw: found.raw,
      receipt: parsed.receipt,
    };
  }
  return {
    present: true,
    ok: false,
    path,
    sha256: found.sha256,
    raw: found.raw,
    reason: parsed.reason,
    detail: parsed.detail,
    ...(parsed.sawVersion === undefined ? {} : { sawVersion: parsed.sawVersion }),
  };
}

/**
 * Check order is load-bearing and easy to invert: JSON -> version -> schema ->
 * structure. `lockfileVersion` is read BEFORE validation so legacy/future files
 * are reported as version skew rather than corruption. V3 is the only accepted
 * schema because exact merge bases are not derivable from older receipts.
 */
export function parseReceipt(text: string, validate: ReceiptValidator): ParsedReceipt {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: "unparseable", detail: (error as Error).message };
  }

  const root = asRecord(doc);
  if (!root) return bad("invalid", "the top level is not a JSON object");

  const version = root["lockfileVersion"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return bad("invalid", "lockfileVersion is missing or is not a positive integer");
  }
  if (version !== RECEIPT_VERSION) {
    return {
      ok: false,
      reason: version > RECEIPT_VERSION ? "future-version" : "unsupported-version",
      detail:
        version > RECEIPT_VERSION
          ? `lockfileVersion ${version} is newer than this build understands (${RECEIPT_VERSION})`
          : `lockfileVersion ${version} predates the merge-base contract (${RECEIPT_VERSION}); no legacy migration is supported`,
      sawVersion: version,
    };
  }

  const schemaError = validate(doc);
  if (schemaError !== true) return bad("invalid", schemaError);

  // Everything below re-checks in code what the schema also checks. Deliberate:
  // the validator is injected, so a caller may supply a no-op, and these are the
  // rules that keep a hand-edited receipt from redirecting a write out of the
  // project or claiming one destination twice. JSON Schema cannot express the
  // cross-entry uniqueness at all.
  const structural = structuralProblem(root, version);
  if (structural) return bad("invalid", structural);

  return { ok: true, receipt: root as unknown as Receipt };
}

/**
 * Absolute destination -> who the receipt says wrote it.
 *
 * Takes `ReceiptState`, not `Receipt`, so the "no receipt yet" branch is
 * structural rather than conventional: `present: false` and `ok: false` both
 * yield an EMPTY map, and no plan-stage consumer can obtain a `Receipt` without
 * discriminating the union. Absent, unreadable and unowned therefore collapse to
 * `null` at exactly one call site — `ownerOf`.
 *
 * Forcing past an unreadable receipt consequently disables the cross-run check
 * for that run as well as discarding the prior records. The `receipt-unreadable`
 * message has to say both.
 *
 * The theme destination is never indexed: a theme file is folded, not owned (D5).
 */
export function buildIndex(state: ReceiptState, root: string): ReceiptIndex {
  const index = new Map<string, ReceiptOwnerRef>();
  if (!state.present || !state.ok) return index;
  for (const item of state.receipt.items) {
    for (const file of item.files) {
      index.set(fromReceiptPath(file.destination, root), {
        itemId: item.id,
        registry: item.registry,
        installedSha256: file.installedSha256,
        baseSha256: file.baseSha256,
      });
    }
  }
  return index;
}

export function ownerOf(index: ReceiptIndex, absoluteDestination: string): ReceiptOwnerRef | null {
  return index.get(absoluteDestination) ?? null;
}

// ---- structural validation --------------------------------------------------

function bad(reason: ReceiptUnreadable, detail: string): ParsedReceipt {
  return { ok: false, reason, detail };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function structuralProblem(root: Record<string, unknown>, version: number): string | null {
  if (root["$schema"] !== undefined && typeof root["$schema"] !== "string") {
    return "$schema is present but is not a string";
  }

  const theme = root["theme"];
  if (theme !== null) {
    const problem = themeProblem(theme);
    if (problem) return problem;
  }

  if (version >= 2) {
    const styles = root["styles"];
    if (styles !== null) {
      const problem = stylesProblem(styles);
      if (problem) return problem;
    }
  }

  const items = root["items"];
  if (!Array.isArray(items)) return "items is missing or is not an array";

  // Maps, not plain objects: an object literal answers `map["toString"]` with a
  // function, so every lookup would need an `Object.hasOwn` guard. (A receipt is
  // free to contain an item literally named `constructor`.)
  const seenIds = new Set<string>();
  const claimedBy = new Map<string, string>();

  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) return "items contains an entry that is not an object";

    const id = item["id"];
    if (typeof id !== "string" || id === "") return "an item has a missing or empty id";
    if (seenIds.has(id)) return `two items share the id "${id}"`;
    seenIds.add(id);

    const registry = item["registry"];
    if (registry !== null && typeof registry !== "string") {
      return `item "${id}" has a registry that is neither a string nor null`;
    }
    for (const key of ["sourceUrl", "wireType"] as const) {
      if (typeof item[key] !== "string") return `item "${id}" has a missing or non-string ${key}`;
    }
    if (typeof item["direct"] !== "boolean")
      return `item "${id}" has a missing or non-boolean direct`;

    const files = item["files"];
    if (!Array.isArray(files)) return `item "${id}" has a missing or non-array files`;

    for (const rawFile of files) {
      const file = asRecord(rawFile);
      if (!file) return `item "${id}" has a files entry that is not an object`;

      const destination = file["destination"];
      const pathProblem = receiptPathProblem(destination);
      if (pathProblem) return `item "${id}" has a destination that ${pathProblem}`;
      if (typeof file["wireType"] !== "string") {
        return `item "${id}" has a file with a missing or non-string wireType`;
      }
      if (typeof file["installedSha256"] !== "string" || !SHA256.test(file["installedSha256"])) {
        return `item "${id}" has a file whose installedSha256 is not 64 lowercase hex characters`;
      }
      if (typeof file["baseSha256"] !== "string" || !SHA256.test(file["baseSha256"])) {
        return `item "${id}" has a file whose baseSha256 is not 64 lowercase hex characters`;
      }

      const key = destination as string;
      const other = claimedBy.get(key);
      // The rule JSON Schema cannot express, and the one that matters most: two
      // claims on one destination make ownership — and therefore every overwrite
      // decision derived from it — ambiguous.
      if (other !== undefined) {
        return `"${key}" is claimed by both "${other}" and "${id}"`;
      }
      claimedBy.set(key, id);
    }
  }

  return null;
}

function stylesProblem(raw: unknown): string | null {
  const styles = asRecord(raw);
  if (!styles) return "styles is neither an object nor null";

  const pathProblem = receiptPathProblem(styles["destination"]);
  if (pathProblem) return `styles.destination ${pathProblem}`;
  if (typeof styles["sha256"] !== "string" || !SHA256.test(styles["sha256"])) {
    return "styles.sha256 is not 64 lowercase hex characters";
  }

  const sources = styles["sources"];
  if (!Array.isArray(sources)) return "styles.sources is missing or is not an array";
  const seen = new Set<string>();
  for (const rawSource of sources) {
    const source = asRecord(rawSource);
    if (!source) return "styles.sources contains an entry that is not an object";
    const itemId = source["itemId"];
    if (typeof itemId !== "string" || itemId === "") {
      return "a style source has a missing or empty itemId";
    }
    if (seen.has(itemId)) return `styles.sources contains two entries for "${itemId}"`;
    seen.add(itemId);

    const dependsOn = source["dependsOn"];
    if (!Array.isArray(dependsOn) || dependsOn.some((value) => typeof value !== "string")) {
      return `style source "${itemId}" has invalid dependsOn`;
    }
    const imports = source["imports"];
    if (
      !Array.isArray(imports) ||
      imports.length === 0 ||
      imports.some((value) => typeof value !== "string" || value === "")
    ) {
      return `style source "${itemId}" has invalid imports`;
    }
    if (new Set(dependsOn).size !== dependsOn.length) {
      return `style source "${itemId}" has duplicate dependencies`;
    }
    if (new Set(imports).size !== imports.length) {
      return `style source "${itemId}" has duplicate imports`;
    }
  }
  return null;
}

function themeProblem(raw: unknown): string | null {
  const theme = asRecord(raw);
  if (!theme) return "theme is neither an object nor null";

  const pathProblem = receiptPathProblem(theme["destination"]);
  if (pathProblem) return `theme.destination ${pathProblem}`;
  if (typeof theme["sha256"] !== "string" || !SHA256.test(theme["sha256"])) {
    return "theme.sha256 is not 64 lowercase hex characters";
  }

  const sources = theme["sources"];
  if (!Array.isArray(sources)) return "theme.sources is missing or is not an array";
  for (const rawSource of sources) {
    const source = asRecord(rawSource);
    if (!source) return "theme.sources contains an entry that is not an object";
    if (typeof source["itemId"] !== "string")
      return "a theme source has a missing or non-string itemId";
    if (typeof source["path"] !== "string")
      return "a theme source has a missing or non-string path";
    if (!THEME_SOURCE_KINDS.includes(source["kind"] as ThemeSourceKind)) {
      return `a theme source has an unknown kind (expected ${THEME_SOURCE_KINDS.join(" or ")})`;
    }
  }
  return null;
}
