/**
 * The receipt's two impure seams, kept out of `read.ts` so that module stays
 * pure: one filesystem read, and one ajv compile that reads a bundled schema.
 *
 * This is the fifth impure module (§1 names four; §5a's receipt adds this one).
 * It is legal under the purity convention — `plan()` may READ disk, it never
 * writes — and putting both seams here is what lets `parseReceipt` take an
 * injected validator and `readReceipt` take an injected reader.
 *
 * Schema resolution is the one line in this feature that behaves differently
 * under `bun test` than under real `node`, so it is worded and guarded the same
 * way `plan/validate-item.ts` is: the portable Node 20.11+ spelling of the
 * module directory, plus two candidate roots because the FLAT dist puts an entry
 * one level below the package root while this file's SOURCE is two levels down.
 * `scripts/guard-runtime-apis.mjs` is what keeps the spelling honest — which is
 * also why this paragraph does not quote the Bun-only identifier it bans.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv from "ajv";

import type { ReceiptReader, ReceiptValidator } from "./read";

const SCHEMA_CANDIDATES = ["../schema", "../../schema"] as const;
const LOCK_SCHEMA_FILE = "manteen.lock.schema.json";
const LOCK_V1_SCHEMA_FILE = "manteen.lock.v1.schema.json";

/**
 * Reads the receipt, or reports absence.
 *
 * ENOENT — and ONLY ENOENT — becomes `{ present: false }`. Every other errno
 * throws: a receipt we cannot read for a reason that is not absence must not be
 * silently treated as absent, because the next successful run would then merge
 * from `null` and destroy every ownership record the file holds. `readReceipt`
 * states this requirement at the injection point; this is the implementation of
 * it.
 *
 * The hash is of the RAW BYTES and `raw` is those same bytes decoded as UTF-8.
 * Both ride together because apply's preflight compares the hash while phase 6
 * compares the text, and re-deriving either from the other is where the hash
 * domain quietly diverges.
 */
export function createReceiptReader(): ReceiptReader {
  return (path) => {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { present: false };
      throw error;
    }
    return {
      present: true,
      raw: bytes.toString("utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
}

/**
 * Compile the receipt schema once.
 *
 * No `delete schema.$schema` (D24): we author this schema and declare the
 * `http://` draft-07 dialect id, which ajv registers. Only the kit's *vendored
 * wire* schema uses the `https://` form, which ajv does not — copying the
 * workaround here would ship a misleading comment in the one place the gotcha
 * needs to stay discoverable.
 *
 * `allErrors` because a hand-edited receipt usually has more than one problem
 * and the user fixes them in an editor, in one pass.
 */
export function createReceiptValidator(): ReceiptValidator {
  // The frozen v1 schema deliberately keeps its original $id, so compile the
  // two versions in separate Ajv registries rather than mutating either schema.
  const validateV1 = new Ajv({ strict: false, allErrors: true }).compile(
    readLockSchema(LOCK_V1_SCHEMA_FILE),
  );
  const validateV2 = new Ajv({ strict: false, allErrors: true }).compile(
    readLockSchema(LOCK_SCHEMA_FILE),
  );

  return (doc) => {
    const version =
      typeof doc === "object" && doc !== null && !Array.isArray(doc)
        ? (doc as Record<string, unknown>)["lockfileVersion"]
        : undefined;
    const validate = version === 1 ? validateV1 : validateV2;
    if (validate(doc)) return true;
    return (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
  };
}

function readLockSchema(filename: string): Record<string, unknown> {
  let lastError: unknown;
  for (const candidate of SCHEMA_CANDIDATES) {
    try {
      const path = resolve(import.meta.dirname, candidate, filename);
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${filename} is missing from the manteen package (looked in ${SCHEMA_CANDIDATES.join(" and ")} relative to ${import.meta.dirname}): ${String(lastError)}`,
  );
}
