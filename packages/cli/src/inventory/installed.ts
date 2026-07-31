/**
 * INSTALLED — what this project has, read out of `manteen.lock.json`.
 *
 * The receipt already records item -> registry -> destination -> sha256. This
 * module adds the one thing it cannot: what is on disk RIGHT NOW. That
 * recorded/current pair is the whole basis of `diff` — it is what separates "the
 * user edited this file" from "the registry changed it" — so it is computed
 * here, once, rather than in two commands that would eventually disagree.
 *
 * PURE, with one exception at the bottom. Every I/O touch arrives as a
 * parameter: `ReceiptReader` and `ReceiptValidator` are the same two seams
 * `plan()` injects, and `FileHasher` is the third. `createInstalledPorts()` is
 * the single impure factory that wires the production implementations, in the
 * spirit of `receipt/load.ts` — the read happens inside the factory's return
 * value, so importing this module still does no I/O.
 *
 * NOTHING HERE WRITES, and nothing here ever will. `update` mutates exclusively
 * through `plan()`/`apply()`.
 *
 * ---
 *
 * **A command that already holds a `Plan` MUST use `fromReceiptState(plan.receipt,
 * …)` and must NOT call `readInstalled`.** `plan()` reads the receipt once and
 * gates on what it read; a second read can see a different file, and apply's
 * preflight refuses on exactly that divergence (it re-hashes the receipt in both
 * directions of its presence, because merging from a receipt other than the one
 * that was gated destroys ownership records). One read per run, shared.
 */
import { createHash } from "node:crypto";

import { hashFileBytes } from "../apply/preflight";
import type { CanonicalId, ReceiptState } from "../plan/types";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { fromReceiptPath, toReceiptPath } from "../receipt/path";
import type { ReceiptReader, ReceiptValidator } from "../receipt/read";
import { readReceipt } from "../receipt/read";
import type {
  HashPair,
  Installed,
  InstalledFile,
  InstalledItem,
  InstalledSource,
  InstalledStyles,
  InstalledTheme,
  InventoryNote,
  LocalStatus,
} from "./types";

/**
 * Absolute path -> sha256 of the RAW BYTES, or `null` when the file is absent.
 *
 * **The implementation MUST THROW for any read failure that is not absence.**
 * Only ENOENT may become `null`. This is worded at the injection point for the
 * same reason `ReceiptRead` words its own rule here rather than in the factory:
 * an EACCES reported as `null` reads as "the file is gone", and a `diff` that
 * says a file was deleted when it was merely unreadable is a lie a user acts on.
 *
 * EISDIR is one of the throwing cases. `plan/index.ts` catches it specifically
 * because a directory sitting at a planned destination is an ordinary user-side
 * state rather than an unanticipated fs error. **A read-only command has no such
 * remedy to offer, so it does NOT catch here** — it lets the throw reach the
 * shell's top-level handler, which prints it and exits 1. Answering `null` would
 * report the file as deleted; answering "modified" would be a hash of nothing.
 * Deciding this once is the point: four commands must not handle it four ways.
 */
export type FileHasher = (absolutePath: string) => string | null;

export interface InstalledPorts {
  /** `createReceiptReader()` in production. */
  read: ReceiptReader;
  /** `createReceiptValidator()` in production. */
  validate: ReceiptValidator;
  /** `hashFileBytes` in production. See the contract above. */
  hash: FileHasher;
}

/**
 * Read the receipt and hash every destination it records.
 *
 * For a command that has NOT run `plan()`. `list` and `info` are the two — both
 * are read-only and neither needs a graph. `diff` and `update` hold a `Plan` and
 * must use `fromReceiptState` instead; see the module docblock.
 */
export function readInstalled(root: string, ports: InstalledPorts): Installed {
  return fromReceiptState(readReceipt(root, ports.read, ports.validate), root, ports.hash);
}

/**
 * The primary entry point. Turn an already-read `ReceiptState` into an
 * inventory.
 *
 * Takes `ReceiptState` and NOT a bare `Receipt`, and that is a safety boundary
 * rather than a convenience: `parseReceipt` runs `structuralProblem` on every
 * document unconditionally — after the injected validator, which a caller is
 * free to supply as a no-op — and that pass is what guarantees no `destination`
 * is absolute, names a drive letter, or contains a `..` segment. A function
 * taking a `Receipt` would let a hand-edited lockfile point `fromReceiptPath`
 * anywhere on the machine. The `ok: true` arm is the only proof those checks
 * ran.
 *
 * All three arms of the state produce an inventory. Absence is ordinary — most
 * projects have never run `manteen add` — and unreadability yields an empty
 * result for the same reason `buildIndex` does: nothing in this codebase reads
 * records out of a receipt it could not fully validate.
 */
export function fromReceiptState(state: ReceiptState, root: string, hash: FileHasher): Installed {
  const source = sourceOf(state);
  const notes = noteFor(source, root);

  if (!state.present || !state.ok) {
    return { root, source, items: [], theme: null, styles: null, notes };
  }

  const items: InstalledItem[] = state.receipt.items
    .map((item) => ({
      id: item.id,
      registry: item.registry,
      sourceUrl: item.sourceUrl,
      wireType: item.wireType,
      direct: item.direct,
      files: item.files
        .map((file): InstalledFile => {
          const destination = fromReceiptPath(file.destination, root);
          return {
            destination,
            receiptPath: file.destination,
            wireType: file.wireType,
            recordedSha256: file.sha256,
            currentSha256: hash(destination),
          };
        })
        .sort(byReceiptPath),
    }))
    .sort(byId);

  const receiptTheme = state.receipt.theme;
  let theme: InstalledTheme | null = null;
  if (receiptTheme !== null) {
    const destination = fromReceiptPath(receiptTheme.destination, root);
    theme = {
      destination,
      receiptPath: receiptTheme.destination,
      recordedSha256: receiptTheme.sha256,
      currentSha256: hash(destination),
      sources: receiptTheme.sources,
    };
  }

  const receiptStyles = state.receipt.styles;
  let styles: InstalledStyles | null = null;
  if (receiptStyles !== null) {
    const destination = fromReceiptPath(receiptStyles.destination, root);
    styles = {
      destination,
      receiptPath: receiptStyles.destination,
      recordedSha256: receiptStyles.sha256,
      currentSha256: hash(destination),
      sources: receiptStyles.sources,
    };
  }

  return { root, source, items, theme, styles, notes };
}

/**
 * Sorted here rather than trusted from the file, and that distinction is the
 * whole reason these two functions exist.
 *
 * `write.ts` emits items by id and files by destination, so a receipt WE wrote
 * is already ordered — but `structuralProblem` checks id uniqueness, path
 * validity, hash format and cross-item destination uniqueness, and enforces no
 * order at all. JSON Schema cannot express sortedness either. A hand-edited or
 * third-party `manteen.lock.json` therefore flows through in whatever order it
 * was written, and every command reading this inventory would inherit it. This
 * repo asserts byte-identical output elsewhere; a listing is no different.
 *
 * By CODE UNIT, never `localeCompare` — the latter makes output depend on the
 * machine's locale, which is exactly what a byte-identical assertion forbids.
 */
function byId(a: { id: CanonicalId }, b: { id: CanonicalId }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byReceiptPath(a: InstalledFile, b: InstalledFile): number {
  return a.receiptPath < b.receiptPath ? -1 : a.receiptPath > b.receiptPath ? 1 : 0;
}

// ---- derived reads ----------------------------------------------------------

/**
 * The recorded/current verdict, derived on demand.
 *
 * Deliberately a function rather than a stored boolean, following
 * `PlannedFile.priorOwner`'s rule: a cached verdict can disagree with the hashes
 * it was computed from, and this one decides whether `update` is about to
 * overwrite somebody's edit.
 *
 * Structurally typed on `HashPair` so it serves `InstalledFile`,
 * `InstalledTheme` and `DiffTheme` alike — there is one comparison, not three.
 */
export function localStatus(pair: HashPair): LocalStatus {
  if (pair.currentSha256 === null) return "missing";
  return pair.currentSha256 === pair.recordedSha256 ? "unchanged" : "modified";
}

/** Every recorded file, flattened in item order. */
export function allFiles(installed: Installed): InstalledFile[] {
  return installed.items.flatMap((item) => item.files);
}

/**
 * Canonical id -> record. A `Map`, never a plain object: a receipt is free to
 * contain an item literally named `constructor`, and an object literal would
 * answer that lookup with a function.
 */
export function itemsById(installed: Installed): ReadonlyMap<CanonicalId, InstalledItem> {
  return new Map(installed.items.map((item) => [item.id, item]));
}

export function findItem(installed: Installed, id: CanonicalId): InstalledItem | null {
  return installed.items.find((item) => item.id === id) ?? null;
}

/** Absolute destination -> the record that claims it. `structuralProblem`
 *  guarantees no two items claim one destination, so this cannot lose an entry. */
export function filesByDestination(installed: Installed): ReadonlyMap<string, InstalledFile> {
  return new Map(allFiles(installed).map((file) => [file.destination, file]));
}

/**
 * How to name an item's origin in output.
 *
 * `registry ?? sourceUrl` — the convention `plan/types.ts` states on
 * `ReceiptItem.registry`, exported so four renderers do not each reinvent it. A
 * `url:` ref has no namespace, and printing "(none)" for two different URL refs
 * would make them indistinguishable in exactly the report that exists to tell
 * them apart. Both fields are REDACTED, so this is safe to print.
 */
export function ownerLabel(item: { registry: string | null; sourceUrl: string }): string {
  return item.registry ?? item.sourceUrl;
}

/**
 * sha256 of a string in `ReceiptFile.sha256`'s domain — the UTF-8 encoding of
 * the text, NOT of raw bytes off disk.
 *
 * Exported because `diff` needs to hash content it fetched (a string) and
 * compare it against a recorded hash, and hand-rolling that at the call site is
 * how the two domains quietly diverge. Use `FileHasher` for anything on disk.
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---- the receipt state, described --------------------------------------------

function sourceOf(state: ReceiptState): InstalledSource {
  if (!state.present) return { state: "absent", path: state.path };
  if (state.ok) return { state: "ok", path: state.path };
  return {
    state: "unreadable",
    path: state.path,
    reason: state.reason,
    detail: state.detail,
    ...(state.sawVersion === undefined ? {} : { sawVersion: state.sawVersion }),
  };
}

/**
 * At most one note, and never for the ordinary case.
 *
 * `no-receipt` is emitted rather than left silent because "you have nothing
 * installed" and "manteen has never run here" are different answers to `manteen
 * diff`, and the second one has an obvious next step.
 *
 * The lockfile is named ROOT-RELATIVE, via `toReceiptPath` — the same rule
 * `InstalledFile.receiptPath` states ("print THIS, not the absolute form"), and
 * for the same two reasons. An absolute path under `/tmp/manteen-project-XXXX`
 * is unassertable across machines, which the e2e tier cannot work with; and a
 * note block that mixes an absolute path from one note with a relative one from
 * its neighbour reads as two different files.
 */
function noteFor(source: InstalledSource, root: string): InventoryNote[] {
  if (source.state === "ok") return [];
  const where = toReceiptPath(source.path, root);

  if (source.state === "absent") {
    return [
      {
        code: "no-receipt",
        message: `${where} does not exist, so nothing has been installed by manteen in this project yet. Run \`manteen add <item>\` first.`,
      },
    ];
  }
  return [
    {
      code: "receipt-unreadable",
      message:
        source.reason === "future-version"
          ? `${where} was written by a newer version of manteen (lockfileVersion ${source.sawVersion ?? "?"}). Upgrade manteen, or remove the file to start a fresh record.`
          : `${where} could not be read: ${source.detail}. Repair it by hand, or remove it and re-run \`manteen add\` to rebuild the ownership record.`,
    },
  ];
}

// ---- the one impure seam ------------------------------------------------------

/**
 * The production wiring, in one place.
 *
 * Not a convenience: `FileHasher`'s must-throw-for-non-absence rule is the kind
 * of contract four independently-written call sites get subtly wrong, and
 * `hashFileBytes` is the implementation that already satisfies it. Injecting
 * anything else is a deliberate act (a test), not an accident.
 */
export function createInstalledPorts(): InstalledPorts {
  return {
    read: createReceiptReader(),
    validate: createReceiptValidator(),
    hash: hashFileBytes,
  };
}
