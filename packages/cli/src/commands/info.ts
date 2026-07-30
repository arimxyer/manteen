/**
 * `manteen info <ref>` — everything known about ONE item, before installing it.
 *
 * Three independent sources are joined, and each answers a question the others
 * cannot:
 *
 *   the item DOCUMENT   what the registry actually serves — files, npm deps,
 *                       registryDependencies, the whole of `meta.mantine`
 *   the registry INDEX  the human-facing title and description, which the item
 *                       document carries but `ValidatedItem` deliberately drops
 *   manteen.lock.json   whether this project already has it, and whether the
 *                       files still match the hashes manteen recorded
 *
 * All three are independently nullable and every combination is reachable — see
 * `InfoResult`'s docblock in `inventory/types.ts`. Nothing here refuses on a
 * missing one; `notes` says which are absent and why.
 *
 * READ-ONLY. This module never writes, and it never calls `apply()`. It also
 * never calls `plan()`: `plan()` would walk the transitive closure (one fetch
 * per dependency, for a command about one item), and D5 would absorb a
 * theme-destination file out of the write list before this module could see it
 * — so `manteen info @house/theme` would report an item that ships no files.
 * The absorption is reported here instead, as `InfoFile.folded`.
 *
 * IMPURE only in `createInfoPorts` and `runInfo`. `readInfo` takes every I/O
 * touch as a parameter, so the whole join is testable with no socket and no
 * temp directory.
 *
 * SECRETS. The only expanded strings this module ever holds are the
 * `ItemRequest` handed to a loader and the `IndexRequest` `available.ts` builds
 * inside `readAvailable`. Neither reaches `InfoReport`, a note, a diagnostic or
 * a thrown message: everything printable comes from `redactedUrl`.
 */
import type { JsonEnvelope, Streams } from "../cli/render";
import {
  display,
  loadProjectConfig,
  PROCESS_STREAMS,
  renderDiagnostics,
  renderJson,
  renderNotes,
  renderThrown,
  sortNotes,
} from "../cli/render";
import { loadEnv } from "../config/load";
import type { LoadedConfig } from "../config/types";
import {
  type AvailableItem,
  createIndexLoader,
  createInstalledPorts,
  findItem,
  type IndexLoader,
  type InfoResult,
  type InstalledFile,
  type InstalledItem,
  type InstalledPorts,
  type InventoryNote,
  type ItemDetail,
  type LocalStatus,
  localStatus,
  ownerLabel,
  readAvailable,
  readInstalled,
  sanitize,
  toItemDetail,
} from "../inventory/index";
import { blockingExitCode, diag, sortDiagnostics } from "../plan/diagnostics";
import { createItemLoader } from "../plan/index";
import { parseRef } from "../plan/ref";
import { ambiguousBareRef, toRequest } from "../plan/registry-source";
import type {
  CanonicalId,
  Diagnostic,
  DiagnosticCode,
  ItemLoader,
  LoadedDoc,
  ReceiptPath,
} from "../plan/types";
import { createItemValidator, type ItemValidator } from "../plan/validate-item";
import { toReceiptPath } from "../receipt/path";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

// ---- local additions to the inventory contract ------------------------------
// `inventory/types.ts` is the frozen W5 contract and is NOT edited from here.
// `InfoResult` carries `detail: ItemDetail | null`, whose `DetailFile` has no
// destination — the projection was written to be renderer-agnostic and a
// destination is a fact about THIS project. The two shapes below are therefore
// declared locally, as the brief directs.

/**
 * One file the item ships, placed where it would actually land here.
 *
 * `DetailFile` plus the three project-local facts: where the alias resolver puts
 * it, whether D5 folds it into the theme instead of writing it, and what the
 * receipt says about the copy already on disk.
 */
export interface InfoFile {
  /** From the wire item, verbatim. Registry-controlled — sanitize before printing. */
  path: string;
  wireType: string;
  /** `files[].target`, or `null`. */
  target: string | null;
  /** `Buffer.byteLength(content, "utf8")` — the size, never the content. */
  bytes: number;
  /** ABSOLUTE, from `config.target`. `null` when the resolver refused the file. */
  destination: string | null;
  /** POSIX, root-relative. PRINT THIS — an absolute tmpdir is unassertable
   *  across machines and a receipt written on Windows must render alike. */
  receiptPath: ReceiptPath | null;
  /** Why the alias resolver refused, in the same vocabulary `add` would use.
   *  Also emitted as a `Diagnostic`, so a blocking refusal is not silent. */
  refused: { code: DiagnosticCode; detail: string } | null;
  /**
   * D5. This file's destination is exactly `config.theme`, so `add` would FOLD
   * it into the theme rather than write it. Reporting it as an ordinary write
   * would be a lie about what installing this item does.
   */
  folded: boolean;
  /**
   * From `manteen.lock.json`, for the destination this file resolves to.
   * `null` when the receipt has no record of it under THIS item — either the
   * item is not installed, or upstream has added a file since the last install.
   */
  local: LocalStatus | null;
}

/** The six things a renderer can truthfully say about one file, in one word. */
export type InfoFileState =
  | "refused"
  | "folded"
  | "unchanged"
  | "modified"
  | "missing"
  | "not-installed";

/**
 * Derived on demand rather than stored, following `localStatus`'s rule: a cached
 * verdict can disagree with the fields it was computed from.
 *
 * `refused` and `folded` come first because they are statements about what would
 * HAPPEN, and both make the local pair meaningless — a refused file has no
 * destination to compare, and a folded one is never owned by an item (D5), so
 * its `local` is structurally `null`.
 */
export function fileState(file: InfoFile): InfoFileState {
  if (file.refused !== null) return "refused";
  if (file.folded) return "folded";
  return file.local ?? "not-installed";
}

/**
 * `InfoResult` plus what a renderer needs and the contract had no field for.
 *
 * Extends rather than wraps, so an `InfoReport` IS an `InfoResult` and the
 * frozen shape stays the thing other commands can consume.
 *
 * `files` is the joined view of `detail.files`, in the same order. It is the
 * ONLY file list the renderers read — `renderInfoJson` drops `detail.files` for
 * exactly that reason, so nothing downstream has to decide which of two arrays
 * is authoritative.
 */
export interface InfoReport extends InfoResult {
  /** ABSOLUTE project root. */
  root: string;
  files: InfoFile[];
  /**
   * Item-document and reference problems, in `add`'s vocabulary and sorted by
   * `sortDiagnostics`.
   *
   * A SEPARATE array from `notes`, permanently. `unknown-namespace` and
   * `receipt-unreadable` are values of BOTH `DiagnosticCode` and
   * `InventoryNoteCode` and they mean opposite things — the diagnostic blocks,
   * the note does not. Merging the two lists for a tidier payload makes an
   * informational `not-installed` indistinguishable from a refusal.
   */
  diagnostics: Diagnostic[];
  /** `blockingExitCode(diagnostics, false) === 0`. */
  ok: boolean;
}

// ---- ports ------------------------------------------------------------------

export interface InfoPorts {
  /** Fetches the item DOCUMENT. Scheme dispatch plus D21's did-you-mean. */
  load: ItemLoader;
  /** `createItemValidator()` in production. */
  validate: ItemValidator;
  /** Fetches the registry INDEX, for `available`. */
  index: IndexLoader;
  /** Receipt reader, validator and the file hasher. */
  installed: InstalledPorts;
  /**
   * `loadEnv(root)`, called ONCE by the caller. A parameter rather than
   * `process.env` for `registry-source.ts`'s reason: a module that reaches for
   * the ambient environment cannot be tested for the one property that matters
   * — that an expanded token never escapes.
   */
  env: Record<string, string | undefined>;
}

/**
 * The production wiring.
 *
 * `createItemLoader` is `plan/index.ts`'s own — the SAME function `plan()` hands
 * to the resolver, exported for this call site. This module used to re-express
 * it, along with its index resolver and its `unsupportedScheme`, because all
 * three were private there. Three copies of "how does manteen fetch an item" is
 * how `info` and `add` come to disagree about what a `s3:` URL means, or about
 * whether a 404 gets a did-you-mean; using the real one also inherits D25's 8 MB
 * streaming ceiling, the per-request timeout and the rule that a failure detail
 * is authored from an errno and never from an error's message.
 *
 * **Known asymmetry, inherited and intended rather than a gap.** The
 * did-you-mean is produced inside `createHttpLoader`; `createFileLoader` has no
 * `index` option and `nearest()`/`editDistance()` are private to
 * `loader-http.ts`. So a miss against a `file:` registry — which is what every
 * fixture and the whole e2e tier use — reports a bare ENOENT with no
 * suggestion, while the same miss over `http(s):` gets one. Closing that would
 * mean a second Levenshtein ranker, and two rankers is how the listing and the
 * suggestion come to disagree.
 */
export function createInfoPorts(
  config: LoadedConfig,
  env: Record<string, string | undefined>,
): InfoPorts {
  return {
    load: createItemLoader(config, env),
    validate: createItemValidator(),
    index: createIndexLoader(),
    installed: createInstalledPorts(),
    env,
  };
}

// ---- the join ---------------------------------------------------------------

/**
 * Everything known about one item.
 *
 * Never throws for an expected failure — a bad reference, an unreachable
 * registry and a malformed document all come back as diagnostics on an
 * `InfoReport`. The one throw that IS allowed through is a filesystem error
 * from the hasher that is not absence (EACCES, EISDIR): `installed.ts` states
 * that a read-only command deliberately does not catch it, because answering
 * `null` would report the file as deleted. `runInfo` prints it and exits 1.
 */
export async function readInfo(
  config: LoadedConfig,
  ref: string,
  ports: InfoPorts,
): Promise<InfoReport> {
  const root = config.root;
  const diagnostics: Diagnostic[] = [];
  const notes: InventoryNote[] = [];

  const parsed = parseRef(ref);

  // A bare ROOT ref is ambiguous and refused for the same reason `add` refuses
  // one: `defaultRegistry` is deferred, and guessing would make one command mean
  // different things on different machines.
  if (parsed.kind === "bare") {
    diagnostics.push(ambiguousBareRef(parsed.name, config.registries));
    return empty(root, ref, null, diagnostics, notes);
  }
  if (parsed.kind === "invalid") {
    diagnostics.push(
      diag("unknown-namespace", `"${parsed.input}" cannot be resolved because ${parsed.reason}.`),
    );
    return empty(root, ref, null, diagnostics, notes);
  }

  const id = parsed.id;
  const namespace = parsed.kind === "namespaced" ? parsed.namespace : null;

  // The receipt is read whatever happens to the fetch. "You have @gone/x
  // installed and @gone is no longer a registered namespace" is the single most
  // useful thing `info` can say in that state, and it is only sayable if the
  // receipt read does not hang off a successful fetch.
  //
  // `readInstalled`, NOT `fromReceiptState`: `installed.ts` names `list` and
  // `info` as exactly the two commands that hold no `Plan` and therefore have no
  // already-gated receipt to reuse.
  const installedAll = readInstalled(root, ports.installed);
  notes.push(...installedAll.notes);
  const installed = findItem(installedAll, id);
  if (installed === null && installedAll.source.state === "ok") {
    notes.push({
      code: "not-installed",
      itemId: id,
      message: `${id} is not recorded in ${toReceiptPath(installedAll.source.path, root)}, so it is not installed in this project.`,
    });
  }

  // Built BEFORE anything is fetched. `toRequest` is the single detector of both
  // an unregistered namespace and an unset `${VAR}`, and its `missing-env`
  // refusal is what stands between a config with a hole in it and a socket. It
  // also settles the double-report hazard: `readAvailable` would emit an
  // `unknown-namespace` NOTE for the same condition this reports as a blocking
  // DIAGNOSTIC, so the index is never consulted once this fails.
  const request = toRequest(parsed, config.registries, ports.env);
  if (!request.ok) {
    diagnostics.push(request.diagnostic);
    return empty(root, id, namespace, diagnostics, notes, installed);
  }

  // Concurrent, and independent: the item document and the index answer
  // different questions and neither gates the other. Determinism comes from the
  // shape of the result, not from the order the two responses land in.
  const [loaded, available] = await Promise.all([
    ports.load(request.request),
    readAvailableItem(config, namespace, id, ports, notes),
  ]);

  if (!loaded.ok) {
    diagnostics.push(loadFailure(id, loaded));
    return empty(root, id, namespace, diagnostics, notes, installed, available);
  }

  const validation = ports.validate(loaded.doc, {
    id,
    // Exactly as `resolve.ts` spells it. A `url:` reference names no item and
    // therefore cannot mismatch one; passing the id instead would manufacture a
    // `name-mismatch` on every URL ref.
    expectedName: parsed.kind === "namespaced" ? parsed.name : null,
    redactedUrl: loaded.redactedUrl,
  });
  diagnostics.push(...validation.diagnostics);

  if (!validation.ok) {
    return empty(root, id, namespace, diagnostics, notes, installed, available);
  }

  const detail = toItemDetail(validation.item, loaded.redactedUrl);
  const files = placeFiles(detail, config, id, namespace, installed, diagnostics);

  return {
    id,
    registry: namespace,
    root,
    available,
    installed,
    detail,
    files,
    diagnostics: sortDiagnostics(diagnostics),
    notes: sortNotes(notes),
    ok: blockingExitCode(diagnostics, false) === EXIT_OK,
  };
}

/**
 * Where each of the item's files would land in THIS project.
 *
 * `config.target` rather than a fresh `createAliasResolver`: `LoadedConfig`
 * documents that the alias-backing check which let loading succeed ran against
 * exactly this matcher and this `exists` injection, and a second resolver built
 * with a different one can disagree about where a file lands.
 *
 * Driven off `ItemDetail.files`, which `toItemDetail` maps 1:1 and in order from
 * `ValidatedItem.files` — so the joined list below stays aligned with the
 * projection the contract exposes, and the file CONTENT never has to be reached
 * for again.
 */
function placeFiles(
  detail: ItemDetail,
  config: LoadedConfig,
  id: CanonicalId,
  namespace: string | null,
  installed: InstalledItem | null,
  diagnostics: Diagnostic[],
): InfoFile[] {
  const recorded = new Map<string, InstalledFile>(
    (installed?.files ?? []).map((file) => [file.destination, file]),
  );

  return detail.files.map((file): InfoFile => {
    const resolved = config.target(
      // Truthy rather than `!== undefined`, matching `resolve.ts`: an empty
      // `target` is not a target, and passing `""` through would ask the
      // resolver to place a file at the project root.
      { path: file.path, type: file.wireType, ...(file.target ? { target: file.target } : {}) },
      { id, namespace },
    );

    if ("refused" in resolved) {
      // Emitted as a diagnostic too, with `add`'s exact shape — both refusal
      // codes the resolver can produce are non-forceable errors, so reporting
      // this only as a per-file field would let `info` exit 0 on an item `add`
      // refuses outright.
      diagnostics.push(diag(resolved.refused, resolved.detail, { items: [id], path: file.path }));
      return {
        ...toBase(file),
        destination: null,
        receiptPath: null,
        refused: { code: resolved.refused, detail: resolved.detail },
        folded: false,
        local: null,
      };
    }

    const { destination } = resolved;
    // D5. `resolve.ts` absorbs a file landing exactly on `config.theme` into the
    // fold before it ever reaches the write list, so nothing is written here and
    // no item ever owns the theme — which is also why `local` stays null.
    const folded = config.themeDestination !== null && destination === config.themeDestination;
    const record = folded ? undefined : recorded.get(destination);

    return {
      ...toBase(file),
      destination,
      receiptPath: toReceiptPath(destination, config.root),
      refused: null,
      folded,
      local: record === undefined ? null : localStatus(record),
    };
  });
}

function toBase(
  file: ItemDetail["files"][number],
): Pick<InfoFile, "path" | "wireType" | "target" | "bytes"> {
  return { path: file.path, wireType: file.wireType, target: file.target, bytes: file.bytes };
}

/**
 * The item's entry in its registry's index, or `null` plus a note.
 *
 * `readAvailable` does the fetching, the parsing, the sanitizing and every
 * degrade-to-a-note branch. Scoped to one namespace so `info` costs one index
 * fetch rather than one per configured registry.
 *
 * A `url:` reference names no registry, so no index can be configured for it and
 * there is nothing to look it up in — `null`, and deliberately no
 * `not-in-index` note, which would claim a registry that does not exist.
 */
async function readAvailableItem(
  config: LoadedConfig,
  namespace: string | null,
  id: CanonicalId,
  ports: InfoPorts,
  notes: InventoryNote[],
): Promise<AvailableItem | null> {
  if (namespace === null) return null;

  const listing = await readAvailable(
    config,
    { load: ports.index, env: ports.env },
    { registries: [namespace] },
  );
  notes.push(...listing.notes);

  const found = listing.items.find((item) => item.id === id) ?? null;

  // Only when the index was actually read. A registry that publishes no index,
  // or whose index could not be fetched, has already contributed a note saying
  // so, and "not listed" would be a second note about the same absence.
  if (found === null && listing.registries.length > 0) {
    const [group] = listing.registries;
    notes.push({
      code: "not-in-index",
      registry: namespace,
      itemId: id,
      ...(group === undefined ? {} : { redactedUrl: group.redactedUrl }),
      message: `${namespace}'s index does not list ${id}. It may still be fetchable — an index is a catalog, not the registry's contents.`,
    });
  }

  return found;
}

/**
 * A failed item fetch, in `resolve.ts`'s exact vocabulary.
 *
 * Re-expressed rather than imported because `resolve.ts`'s `loadFailure` is
 * private to that module and takes a `WalkNode`. The wording is kept identical
 * on purpose: a 404 must read the same whether it stopped an install or an
 * inspection, and the `detail` a 404 carries is D21's did-you-mean, authored
 * inside the HTTP loader.
 *
 * `doc.detail` is authored by a loader from an errno or a status — never from an
 * error's `message`, which interpolates the URL and may therefore hold an
 * expanded `${VAR}`. Passing it through is safe for that reason and no other.
 */
function loadFailure(id: CanonicalId, doc: Extract<LoadedDoc, { ok: false }>): Diagnostic {
  const where = `${id} (${doc.redactedUrl})`;
  // Trailing punctuation stripped because the sentence appends its own — a
  // loader detail ending in a full stop otherwise renders as "today..".
  const detail = doc.detail === undefined ? "" : `: ${doc.detail.replace(/[.!?]+$/, "")}`;
  const extras = { items: [id], path: doc.redactedUrl };

  switch (doc.reason) {
    case "too-large":
      return diag("response-too-large", `${where} exceeded the response ceiling${detail}.`, extras);
    case "not-json":
      return diag("wire-invalid", `${where} did not return JSON${detail}.`, extras);
    case "status":
      return diag(
        "fetch-failed",
        `${where} responded ${doc.status ?? "with an error"}${detail}.`,
        extras,
      );
    case "network":
      return diag("fetch-failed", `${where} could not be reached${detail}.`, extras);
  }
}

/** Every arm that has no item document. Always carries at least one blocking
 *  diagnostic, so `ok` is false and the caller exits non-zero. */
function empty(
  root: string,
  id: CanonicalId,
  registry: string | null,
  diagnostics: Diagnostic[],
  notes: InventoryNote[],
  installed: InstalledItem | null = null,
  available: AvailableItem | null = null,
): InfoReport {
  return {
    id,
    registry,
    root,
    available,
    installed,
    detail: null,
    files: [],
    diagnostics: sortDiagnostics(diagnostics),
    notes: sortNotes(notes),
    ok: blockingExitCode(diagnostics, false) === EXIT_OK,
  };
}

// ---- rendering --------------------------------------------------------------
// `display`, `renderDiagnostic`, `renderConfigError` and `renderThrown` used to
// be copied into this file verbatim, because `cli/index.ts` kept them private
// and cannot be imported (it has a shebang and RUNS a program on import). They
// now live in `cli/render.ts`, which every shell shares, and the copies are
// gone — the deletion was a provable no-op precisely because they were verbatim.

/** Widest state verb (`not-installed`) plus a two-space gutter. Padding to the
 *  verb's own length would run it straight into the path. */
const STATE_WIDTH = 15;

/** A registry-supplied string bounded for one terminal line. */
const MAX_LINE = 200;

/**
 * The item, as text.
 *
 * Every registry-supplied string goes through `available.ts`'s `sanitize` on the
 * way out, and none of them is sanitized in the DATA. An item document is
 * registry-controlled text and this function paints it onto a terminal, where a
 * bidi override or an ANSI escape changes what the terminal DOES rather than
 * what it shows. `AvailableItem`'s fields arrive already sanitized (available.ts
 * does it at parse time); the item document's do not, and `--json` deliberately
 * keeps them verbatim — a consumer of JSON wants what the registry actually
 * said.
 */
export function renderInfo(report: InfoReport): string {
  const out: string[] = [];
  const { detail, available, installed } = report;

  const head = [clean(report.id)];
  if (detail !== null) head.push(clean(detail.wireType));
  else if (available?.type) head.push(clean(available.type));
  out.push(head.join("  "));

  if (detail !== null) out.push(`  ${display(detail.redactedUrl, report.root)}`);
  else if (installed !== null) out.push(`  ${display(installed.sourceUrl, report.root)}`);

  if (available?.title) out.push("", `  ${clean(available.title)}`);
  if (available?.description) out.push(`  ${clean(available.description)}`);

  // The DOCUMENT's name, not the reference's, and only when they differ — that
  // divergence is exactly what `name-mismatch` is about, and the diagnostic on
  // stderr is easier to act on with the two names side by side.
  if (detail !== null && available !== null && detail.name !== available.rawName) {
    out.push("", `  the document names itself "${clean(detail.name)}"`);
  }

  if (detail !== null) {
    out.push(...section("mantine", metaRows(detail)));
    out.push(...section("files", fileRows(report)));
    out.push(...section("dependencies", detail.dependencies.map(clean)));
    out.push(...section("devDependencies", detail.devDependencies.map(clean)));
    out.push(...section("registryDependencies", detail.registryDependencies.map(clean)));
    out.push(...section("css imports", detail.cssImports.map(clean)));
  }

  out.push(...section("installed", installedRows(report)));

  // NOTES ARE NOT IN HERE. They used to be — a `notes` section at the foot of
  // the stdout report — and that made `info` the one command of the five whose
  // notes were not on stderr. They now go through `cli/render.ts`'s `renderNote`
  // like every other command's, so `manteen info x | grep …` sees the item and
  // nothing else, and a note reads identically whichever command emitted it.

  return `${out.join("\n").replace(/^\n+/, "")}\n`;
}

/** A titled block, or nothing at all — an empty `dependencies` heading is noise
 *  that reads as a claim about the item. */
function section(title: string, rows: readonly string[]): string[] {
  if (rows.length === 0) return [];
  return ["", title, ...rows.map((row) => `  ${row}`)];
}

function metaRows(detail: ItemDetail): string[] {
  const rows: string[] = [];
  const { meta } = detail;
  if (meta.requires !== undefined) rows.push(`requires   ${clean(meta.requires)}`);
  if (meta.provider !== undefined) rows.push(`provider   ${clean(meta.provider)}`);
  if (meta.themeFragment !== undefined) {
    rows.push(
      `theme      ${clean(meta.themeFragment.path)}  ${bytes(meta.themeFragment.bytes)} (folded, never written at that path)`,
    );
  }
  if (meta.stylesApi !== undefined) {
    // Sorted: the wire is an object and its key order is the registry's choice.
    for (const [index, key] of Object.keys(meta.stylesApi).sort(byCodeUnit).entries()) {
      const selectors = (meta.stylesApi[key] ?? []).map(clean).join(", ");
      rows.push(`${index === 0 ? "stylesApi  " : "           "}${clean(key)}: ${selectors}`);
    }
  }
  return rows;
}

function fileRows(report: InfoReport): string[] {
  const width = Math.max(0, ...report.files.map((file) => (file.receiptPath ?? file.path).length));

  return report.files.map((file) => {
    const where = clean(file.receiptPath ?? file.path).padEnd(Math.min(width, 60));
    const tail = file.refused === null ? "" : `  ${clean(file.refused.detail)}`;
    return `${fileState(file).padEnd(STATE_WIDTH)}${where}  ${bytes(file.bytes).padStart(8)}  ${clean(file.wireType)}${tail}`;
  });
}

/**
 * What the receipt says, minus what the `files` block already showed.
 *
 * Every recorded destination that the item STILL ships appears above with its
 * local status on it, so repeating it here would be the same fact twice. What is
 * left over is the interesting half: a destination manteen wrote that this
 * version of the item no longer ships. Nothing in v1 deletes a file manteen
 * wrote, so those stay on disk and the user is the only one who can decide.
 */
function installedRows(report: InfoReport): string[] {
  const { installed } = report;
  if (installed === null) return [];

  // `ownerLabel`, not a re-spelled `registry ?? sourceUrl`. `installed.ts`
  // exports it precisely so four renderers do not each write the convention out,
  // and this was the last copy of it.
  const rows = [
    `from ${clean(ownerLabel(installed))}, ${installed.direct ? "installed directly" : "pulled in as a dependency"}`,
  ];

  // Gated on `detail`, not on `files.length`. With no item document there is
  // nothing to have been dropped FROM, and labelling every recorded file "no
  // longer shipped" because the registry was unreachable is a claim `info` has
  // no evidence for — so the whole recorded list is printed plainly instead.
  const known = report.detail !== null;
  const shipped = new Set(
    report.files.map((file) => file.destination).filter((path): path is string => path !== null),
  );

  for (const file of installed.files) {
    if (known && shipped.has(file.destination)) continue;
    const tail = known ? "  (recorded here, no longer shipped by the item)" : "";
    rows.push(`${localStatus(file).padEnd(STATE_WIDTH)}${clean(file.receiptPath)}${tail}`);
  }
  return rows;
}

/**
 * `--json`.
 *
 * `detail.files` is dropped: `InfoFile` is a superset of `DetailFile` and
 * `report.files` is the same list in the same order, so emitting both would ask
 * every consumer to decide which one is authoritative.
 *
 * `diagnostics` and `notes` stay two keys. See `InfoReport.diagnostics`.
 */
export function renderInfoJson(report: InfoReport): string {
  const detail =
    report.detail === null
      ? null
      : {
          name: report.detail.name,
          wireType: report.detail.wireType,
          redactedUrl: report.detail.redactedUrl,
          dependencies: report.detail.dependencies,
          devDependencies: report.detail.devDependencies,
          registryDependencies: report.detail.registryDependencies,
          meta: report.detail.meta,
        };

  return renderJson({
    command: "info",
    root: report.root,
    ok: report.ok,
    id: report.id,
    registry: report.registry,
    available: report.available,
    installed: report.installed,
    detail,
    files: report.files,
    diagnostics: report.diagnostics,
    notes: report.notes,
  });
}

/** The `--json` shape, for a consumer. `InfoReport` minus `detail.files` (see
 *  `renderInfoJson`) and with `cli/render.ts`'s three envelope keys in front. */
export interface InfoJsonDocument extends JsonEnvelope {
  command: "info";
}

/** Locale-independent, never `localeCompare` — this repo asserts byte-identical
 *  output and `localeCompare` makes it depend on `LANG`. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Registry-controlled text, made safe for a terminal. */
function clean(value: string): string {
  return sanitize(value, MAX_LINE);
}

/**
 * A byte count, formatted without `toLocaleString`.
 *
 * `toLocaleString` would put a `4.2` on one machine and a `4,2` on another, and
 * this repo asserts byte-identical output.
 */
function bytes(count: number): string {
  if (count < 1024) return `${count} B`;
  return `${(count / 1024).toFixed(1)} kB`;
}

// ---- the command ------------------------------------------------------------

export interface InfoFlags {
  /** `--cwd`. The project directory containing `manteen.json`. */
  cwd: string;
  /** `--json`. */
  json?: boolean;
}

/**
 * `manteen info <ref>`, from argv to an exit code.
 *
 * Exit codes come from `blockingExitCode` rather than from a mapping written
 * here, so `info` and `add` cannot disagree about whether an unknown namespace
 * is 1 or 2 — §1's refusal table is the single source, expressed as data in
 * `DIAGNOSTIC_CODES`.
 *
 *   0    the item was described
 *   1    a blocking diagnostic — unknown item, unreachable registry, a document
 *        that is not a registry item, a file the alias resolver refuses
 *   2    a config problem found before anything was fetched
 *
 * Exit 1 does NOT mean nothing was printed. An item whose `meta.mantine
 * .requires` is malformed is still worth describing, and saying so while also
 * reporting that `add` would refuse it is more useful than either alone.
 *
 * Stream split, following `cli/index.ts`: the REPORT goes to stdout and
 * diagnostics go to stderr, so `manteen info x --json | jq` works and
 * `manteen info x 2>&1 | grep fetch-failed` still finds the refusal. `notes` are
 * part of the answer rather than commentary on it, so they render into the
 * stdout report.
 */
export async function runInfo(
  ref: string | undefined,
  flags: InfoFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  if (ref === undefined || ref.trim() === "") {
    streams.stderr("manteen info: name one item, e.g. `manteen info @house/data-table`.\n");
    return EXIT_USAGE;
  }

  // The shared exit-2 boundary; see `loadProjectConfig`.
  const loaded = loadProjectConfig(flags.cwd, streams.stderr);
  if (!loaded.ok) return loaded.exit;

  const config = loaded.config;
  // Mutates `process.env` (see `loadEnv`) and is this command's ONLY read of it.
  // Everything downstream takes the returned map as a parameter.
  const env = loadEnv(config.root);

  let report: InfoReport;
  try {
    report = await readInfo(config, ref, createInfoPorts(config, env));
  } catch (error) {
    // The hasher's non-absence throws land here (EACCES, EISDIR), by design:
    // `installed.ts` states a read-only command must not degrade one into
    // `currentSha256: null`, which would report the file as deleted.
    streams.stderr("error  info\n");
    streams.stderr(renderThrown(error));
    return EXIT_REFUSED;
  }

  if (flags.json) {
    // One document, notes inside it, nothing on stderr — the `JsonEnvelope`
    // rule. Diagnostics ride along in the document rather than being printed
    // twice.
    streams.stdout(renderInfoJson(report));
    return blockingExitCode(report.diagnostics, false);
  }

  renderDiagnostics(report.diagnostics, report.root, streams.stderr);
  streams.stderr(renderNotes(report.notes));
  streams.stdout(renderInfo(report));

  return blockingExitCode(report.diagnostics, false);
}
