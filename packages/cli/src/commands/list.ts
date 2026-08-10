/**
 * `manteen list [@namespace...]` — what can be installed, across configured
 * registries, and what this project already has.
 *
 * The command is three layers on purpose, because the integrator wires the
 * outermost one and the tests drive the innermost:
 *
 *   buildList()      LoadedConfig + ports -> ListResult. No fs, no network of
 *                    its own — both arrive as parameters, so the whole join is
 *                    testable against a `file:` index and a fixture receipt.
 *   renderList*()    ListResult -> text. Pure, deterministic, no streams.
 *   runList()        argv -> exit code. The only impure layer: it resolves the
 *                    root, loads config, loads `.env`, wires production ports
 *                    and writes to two streams.
 *
 * NOTHING HERE WRITES to the project. `list` is read-only in the strong sense —
 * it does not even hold a `Plan`.
 *
 * ---
 *
 * **Exit codes**, and the rule that produced them rather than a table invented
 * here. `InventoryNote` is a separate channel from `Diagnostic` (see
 * `inventory/types.ts`), but five of its codes name the same situation a
 * `DiagnosticCode` names, and `DIAGNOSTIC_CODES` already decides what those
 * cost. So:
 *
 *   0    a listing was produced — INCLUDING an empty one. Zero registries, zero
 *        items, and a registry that declares no `index` are all successes: D21
 *        made `index` optional, so a registry without one is a valid config and
 *        exiting non-zero on it would call the user's own configuration broken.
 *   1    the listing is INCOMPLETE because something failed —
 *        `unknown-namespace`, `index-missing-env`, `index-unreachable`,
 *        `index-invalid`, `receipt-unreadable`. Every one of those has a
 *        `DiagnosticCode` counterpart with `exit: 1` in `plan/diagnostics.ts`
 *        (`unknown-namespace`, `missing-env`, `fetch-failed`, `wire-invalid`,
 *        `receipt-unreadable` respectively), so a user who types an
 *        unregistered namespace gets the same code from `list` as from `add`.
 *   2    `manteen.json` is missing or unusable. Matches `add`: the split between
 *        1 and 2 is "did we get far enough to have something to report".
 *   130  unreachable — `list` never prompts.
 *
 * `no-receipt`, `no-index`, `index-entry-dropped`, `index-name-uninstallable`
 * and `not-in-index` are deliberately NOT in the exit-1 set. Each describes a
 * complete answer with something worth saying about it, and a discovery command
 * that exits 1 the first time a stranger runs it in a fresh project teaches them
 * to ignore its exit code.
 *
 * ---
 *
 * **Secrets.** Every URL this file can reach is already redacted:
 * `RegistryListing.redactedUrl` is built from `IndexRequest.redactedUrl`, and
 * `InventoryNote.message` is authored secret-free by `available.ts`. The one
 * expanded map in play is `loadEnv`'s, and it is handed straight to
 * `AvailablePorts.env` — never logged, never interpolated, never stored on a
 * result.
 */
import type { JsonEnvelope, Streams } from "../cli/render";
import {
  loadProjectConfig,
  PROCESS_STREAMS,
  renderJson,
  renderNotes,
  renderThrown,
  sortNotes,
} from "../cli/render";
import { loadEnv } from "../config/load";
import type { LoadedConfig } from "../config/types";
import {
  type AvailableItem,
  type AvailablePorts,
  createIndexLoader,
  createInstalledPorts,
  type InstalledItem,
  type InstalledPorts,
  type InventoryNote,
  type InventoryNoteCode,
  itemsById,
  type ListGroup,
  type ListQueryMatchField,
  type ListQueryRank,
  type ListResult,
  type ListRow,
  type LocalStatus,
  localStatus,
  readAvailable,
  readInstalled,
} from "../inventory/index";
import { NAMESPACE_PATTERN } from "../plan/ref";
import type { CanonicalId } from "../plan/types";

// ---- ports ------------------------------------------------------------------

/**
 * Both readers' ports, in one bag.
 *
 * Not flattened into a single interface: `InstalledPorts` and `AvailablePorts`
 * are the inventory contract's own shapes, and re-spelling their fields here
 * would mean a change to either has to be mirrored in four commands.
 */
export interface ListPorts {
  installed: InstalledPorts;
  available: AvailablePorts;
}

/**
 * `undefined` means every configured registry; a non-empty array filters.
 *
 * `readAvailable` branches on `registries === undefined`, so passing `[]` lists
 * NOTHING and exits 0 — a silent empty listing that looks like a working
 * command. `toAvailableOptions` below makes that state unrepresentable rather
 * than trusting each caller to remember, because the natural spelling from
 * commander (`.argument("[namespaces...]")`) hands you `[]` for the bare
 * invocation.
 */
export interface ListOptions {
  registries?: readonly string[];
  /** Case-insensitive substring match over the canonical id and the index's
   * sanitized name, title and description. Matching rows are deterministically
   * relevance-ranked within each registry. Empty strings do not filter. */
  query?: string;
  /** Exact wire item types. Multiple values are OR-ed; an empty array does not
   * filter. Authored order is irrelevant and never reorders the listing. */
  types?: readonly string[];
  /** Keep only rows that have a receipt entry. */
  installed?: boolean;
}

// ---- the join ---------------------------------------------------------------

/**
 * What the registries offer, joined against what the receipt records.
 *
 * MAY THROW, and that is the contract rather than an oversight: `FileHasher`
 * must throw for any read failure that is not absence (`installed.ts` states the
 * rule at the injection point), and a read-only command deliberately does not
 * catch EISDIR — answering `null` would report a file as deleted when a
 * directory is merely sitting where it used to be. `runList` catches at the
 * shell boundary and exits 1. It is never converted into a note: a note says
 * "reported", and "unreadable" is not reported.
 *
 * `readAvailable` never throws — every failure mode there is already a note.
 */
export async function buildList(
  config: LoadedConfig,
  ports: ListPorts,
  options: ListOptions = {},
): Promise<ListResult> {
  const available = await readAvailable(config, ports.available, toAvailableOptions(options));
  const installed = readInstalled(config.root, ports.installed);
  const byId = itemsById(installed);
  const query = normalizedQuery(options.query);

  const unfilteredGroups: ListGroup[] = available.registries.map((listing) => ({
    registry: listing.registry,
    redactedUrl: listing.redactedUrl,
    title: listing.title,
    homepage: listing.homepage,
    // NOT re-sorted. `parseIndex` sorts by the RAW name; sorting again by the
    // sanitized `name` would hand a hostile index control over our output order
    // and is not even a total order — two different raw names can sanitize equal.
    rows: listing.items.map(
      (item): ListRow => ({
        item,
        // `item.id === null` is an uninstallable published name, and an
        // uninstallable name cannot have been installed. The lookup is skipped
        // rather than allowed to answer, so `list` can never mark a row
        // installed that `add` would have refused.
        installed: item.id === null ? null : (byId.get(item.id) ?? null),
        queryMatches: queryMatchFields(item, query),
        queryRank: queryRank(item, query),
      }),
    ),
  }));

  return {
    groups: filterGroups(unfilteredGroups, options),
    // Sorted through `cli/render.ts`'s `sortNotes`, which is `available.ts`'s
    // own (registry, code, message) comparator exported once. Merging three
    // sources under a different key would silently reorder the notes
    // `readAvailable` already sorted, and a note would then read in a different
    // place depending on which command printed it.
    notes: sortNotes([
      ...installed.notes,
      ...available.notes,
      // Compare the receipt with the complete fetched indexes. A presentation
      // filter must never turn a merely hidden row into a false not-in-index
      // warning.
      ...missingFromIndex(unfilteredGroups, byId),
    ]),
  };
}

/**
 * Apply presentation filters without changing registry order or group
 * membership. A query relevance-ranks rows inside each group; every other
 * filter preserves row order. Keeping an empty group is intentional: the renderer can
 * then distinguish "this registry matched no rows" from "this registry could
 * not be inspected", the latter of which is represented by a note and no
 * group.
 */
function filterGroups(groups: readonly ListGroup[], options: ListOptions): ListGroup[] {
  const query = normalizedQuery(options.query);
  const types = new Set(options.types ?? []);
  const filterByType = types.size > 0;
  const installedOnly = options.installed === true;

  if (query === "" && !filterByType && !installedOnly) return [...groups];

  return groups.map((group) => ({
    ...group,
    rows: rankQueryRows(
      group.rows.filter((row) => {
        if (installedOnly && row.installed === null) return false;
        if (filterByType && (row.item.type === null || !types.has(row.item.type))) return false;
        return query === "" || row.queryMatches.length > 0;
      }),
      query,
    ),
  }));
}

function normalizedQuery(query: string | undefined): string {
  return query?.toLowerCase() ?? "";
}

function queryMatchFields(item: AvailableItem, lowerQuery: string): ListQueryMatchField[] {
  if (lowerQuery === "") return [];
  const values: readonly [ListQueryMatchField, string | null][] = [
    ["id", item.id],
    ["name", item.name],
    ["title", item.title],
    ["description", item.description],
  ];
  return values
    .filter(([, value]) => (value ?? "").toLowerCase().includes(lowerQuery))
    .map(([field]) => field);
}

const QUERY_RANKS: readonly ListQueryRank[] = [
  "exact-id",
  "exact-name",
  "exact-title",
  "title-prefix",
  "identity-substring",
  "title-substring",
  "description-substring",
];

function queryRank(item: AvailableItem, lowerQuery: string): ListQueryRank | null {
  if (lowerQuery === "") return null;
  const id = item.id?.toLowerCase() ?? "";
  const name = item.name.toLowerCase();
  const title = item.title?.toLowerCase() ?? "";
  const description = item.description?.toLowerCase() ?? "";

  if (id === lowerQuery) return "exact-id";
  if (name === lowerQuery) return "exact-name";
  if (title === lowerQuery) return "exact-title";
  if (title.startsWith(lowerQuery)) return "title-prefix";
  if (id.includes(lowerQuery) || name.includes(lowerQuery)) return "identity-substring";
  if (title.includes(lowerQuery)) return "title-substring";
  if (description.includes(lowerQuery)) return "description-substring";
  return null;
}

function rankQueryRows(rows: readonly ListRow[], query: string): ListRow[] {
  if (query === "") return [...rows];
  return rows
    .map((row, priorIndex) => ({ row, priorIndex }))
    .sort((left, right) => {
      const leftRank = left.row.queryRank;
      const rightRank = right.row.queryRank;
      const rankDifference =
        (leftRank === null ? QUERY_RANKS.length : QUERY_RANKS.indexOf(leftRank)) -
        (rightRank === null ? QUERY_RANKS.length : QUERY_RANKS.indexOf(rightRank));
      return rankDifference === 0 ? left.priorIndex - right.priorIndex : rankDifference;
    })
    .map(({ row }) => row);
}

/** See `ListOptions`. `[]` and `undefined` mean the same thing to a user and
 *  opposite things to `readAvailable`, so only one of them survives this. */
function toAvailableOptions(options: ListOptions): { registries?: readonly string[] } {
  const requested = options.registries;
  return requested === undefined || requested.length === 0 ? {} : { registries: requested };
}

/**
 * Installed items their own registry's index no longer advertises.
 *
 * Emitted because the alternative is the failure this command exists to avoid,
 * applied to the installed axis: a user who has `@house/data-table` installed
 * from a registry that has since dropped or renamed it sees a listing where
 * their component is simply absent — a short list that looks complete.
 *
 * A NOTE, never a synthetic row. `ListRow.item` requires a real
 * `AvailableItem`, and fabricating one would make `list` advertise
 * installability it has no index entry to back.
 *
 * Scoped three ways. Only items with a non-null `registry` (a `url:` item has no
 * index and could never appear in one), only registries that actually produced a
 * listing (a registry skipped for `no-index` or a fetch failure already has a
 * note, and a second one would blame the item for the registry's problem), and
 * only within whatever namespace filter was applied — `groups` is already
 * filtered, so iterating it rather than the receipt gets that for free.
 */
function missingFromIndex(
  groups: readonly ListGroup[],
  byId: ReadonlyMap<CanonicalId, InstalledItem>,
): InventoryNote[] {
  const notes: InventoryNote[] = [];

  for (const group of groups) {
    const listed = new Set(group.rows.map((row) => row.item.id).filter((id) => id !== null));

    const absent = [...byId.values()]
      .filter((item) => item.registry === group.registry && !listed.has(item.id))
      .map((item) => item.id)
      .sort(byCodeUnit);

    for (const itemId of absent) {
      notes.push({
        code: "not-in-index",
        registry: group.registry,
        itemId,
        redactedUrl: group.redactedUrl,
        message: `${itemId} is installed, and ${group.registry}'s index does not list it — it may have been renamed or removed upstream. \`manteen info ${itemId}\` fetches the item document directly.`,
      });
    }
  }

  return notes;
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---- exit code ----------------------------------------------------------------

/**
 * The five notes that mean "this listing is incomplete because something
 * failed". See the module docblock for where each number comes from.
 */
const FAILING_NOTES: ReadonlySet<InventoryNoteCode> = new Set<InventoryNoteCode>([
  "unknown-namespace",
  "index-missing-env",
  "index-unreachable",
  "index-invalid",
  "receipt-unreadable",
]);

/** Exported so the integrator wires the rule rather than re-deriving it, and so
 *  a test can assert it without going through a stream. */
export function listExitCode(result: ListResult): 0 | 1 {
  return result.notes.some((note) => FAILING_NOTES.has(note.code)) ? 1 : 0;
}

// ---- text rendering -------------------------------------------------------------

/**
 * A row's cells, in column order: status, name, type, requires, title.
 *
 * Every one is either sanitized registry text (`available.ts` collapses `\s+`
 * and strips control characters, so nothing here can break a padded column) or
 * one of our own three status words.
 */
const COLUMN_COUNT = 5;

/**
 * `installed` when the receipt records it, `unusable` when the registry
 * publishes a name that cannot be a `CanonicalId`, blank otherwise.
 *
 * `unusable` is shown per row rather than left to the `index-name-uninstallable`
 * note, because that note says HOW MANY names are unusable and a user reading a
 * listing needs to know WHICH — otherwise the only way to find out is to run
 * `add` and be refused.
 *
 * Deliberately NOT a drift marker. `list` has the hashes to say "installed and
 * locally modified", but that is one third of the three-way answer `diff` gives,
 * and a listing that half-answers the drift question is how a user comes to
 * trust the wrong command with it.
 */
function statusOf(row: ListRow): string {
  if (row.installed !== null) return "installed";
  return row.item.id === null ? "unusable" : "";
}

function cellsOf(row: ListRow): string[] {
  const item = row.item;
  return [
    statusOf(row),
    item.name,
    item.type ?? "",
    item.mantine?.requires ?? "",
    item.title ?? "",
  ];
}

/**
 * Columns that are empty for EVERY row in a group are dropped, not padded.
 *
 * Not cosmetic. A third-party registry that publishes no `meta.mantine` would
 * otherwise get a column of placeholders in every row, and a project with
 * nothing installed would get a nine-space gutter down the left of a listing
 * whose whole job is to be scannable. Widths are per group because the groups
 * are printed as separate blocks anyway.
 */
function renderRows(rows: readonly ListRow[]): string[] {
  const cells = rows.map(cellsOf);

  const columns: number[] = [];
  for (let index = 0; index < COLUMN_COUNT; index += 1) {
    if (cells.some((row) => row[index] !== "")) columns.push(index);
  }

  const widths = columns.map((index) =>
    cells.reduce((width, row) => Math.max(width, (row[index] ?? "").length), 0),
  );

  return cells.map((row) => {
    const parts = columns.map((index, position) => {
      const value = row[index] ?? "";
      // The last kept column is never padded: trailing whitespace on a line is
      // invisible in a terminal and loud in a byte-identical assertion.
      return position === columns.length - 1 ? value : value.padEnd(widths[position] ?? 0);
    });
    return `  ${parts.join("  ")}`.trimEnd();
  });
}

/**
 * One registry block.
 *
 * The head is `@namespace  <the index's own name>`, then the index URL and the
 * registry's homepage indented under it — the same head-then-indented-detail
 * shape `renderDiagnostic` uses in `cli/index.ts`, so the two read alike.
 *
 * A registry whose index lists nothing prints `(no items)` rather than a bare
 * header. An empty listing is a success (see the module docblock) and it has to
 * LOOK like an answer, not like output that got truncated.
 */
function renderGroup(group: ListGroup): string[] {
  const lines = [group.title === null ? group.registry : `${group.registry}  ${group.title}`];
  lines.push(`  ${group.redactedUrl}`);
  if (group.homepage !== null) lines.push(`  ${group.homepage}`);
  lines.push("");
  lines.push(...(group.rows.length === 0 ? ["  (no items)"] : renderRows(group.rows)));
  return lines;
}

/**
 * The listing, for stdout. Notes are NOT in here — they go to stderr via
 * `renderListNotes`, so `manteen list | grep table` sees rows and nothing else.
 *
 * Returns `""` when there is nothing to list, which is the correct output for a
 * project whose every registry was skipped: the notes on stderr say why, and
 * stdout stays a clean empty listing rather than a header for a group that has
 * no content.
 */
export function renderList(result: ListResult): string {
  if (result.groups.length === 0) return "";
  return `${result.groups.map((group) => renderGroup(group).join("\n")).join("\n\n")}\n`;
}

/**
 * Notes, for stderr.
 *
 * A thin alias over `cli/render.ts`'s `renderNotes`, kept as a named export
 * because it is part of this module's tested surface. The BODY moved: this file
 * used to print a two-token subject (`registry  itemId`) and drop `redactedUrl`
 * on the claim that every message ending carries it — which is true of three
 * note codes and false of three others (`index-entry-dropped`,
 * `index-name-uninstallable`, `not-in-index` all carry a URL their message does
 * not repeat). The shared renderer prints one subject token and emits the URL
 * only when the message does not already end in it.
 */
export function renderListNotes(notes: readonly InventoryNote[]): string {
  return renderNotes(notes);
}

// ---- JSON rendering ---------------------------------------------------------------

/**
 * The `--json` document.
 *
 * Declared as its own shape rather than `JSON.stringify(result)`, for two
 * reasons that are both about what `ListResult` carries:
 *
 *  - `InstalledFile.destination` is ABSOLUTE, and `receiptPath` exists precisely
 *    so output is identical on every machine (`inventory/types.ts`: "Print THIS,
 *    not the absolute form"). Emitting the absolute form would make the document
 *    unusable for anything that compares two runs.
 *  - The recorded/current sha256 pair is dropped in favour of `localStatus`.
 *    Hashes are `diff`'s currency, and publishing them from `list` invites
 *    somebody to build a diff on top of a command that never fetched upstream
 *    and therefore knows only two thirds of the answer.
 *
 * `rawName` is likewise absent: `AvailableItem.rawName` is documented "may
 * contain anything; do not print it", and a JSON document is printed.
 */
export interface ListJsonFile {
  /** POSIX, root-relative, exactly as the receipt stores it. */
  path: string;
  status: LocalStatus;
}

export interface ListJsonInstalled {
  direct: boolean;
  /** REDACTED. */
  sourceUrl: string;
  files: ListJsonFile[];
}

export interface ListJsonItem {
  /** `null` when the published name cannot be a canonical id — listed, not
   *  installable. This is the field to test, not a separate boolean. */
  id: string | null;
  name: string;
  type: string | null;
  title: string | null;
  description: string | null;
  requires: string | null;
  provider: string | null;
  /** Stable match provenance for the active `--query`. */
  queryMatches: ListQueryMatchField[];
  /** Strongest match used for deterministic relevance ranking. */
  queryRank: ListQueryRank | null;
  installed: ListJsonInstalled | null;
}

export interface ListJsonRegistry {
  namespace: string;
  /** REDACTED index URL. */
  index: string;
  title: string | null;
  homepage: string | null;
  items: ListJsonItem[];
}

export interface ListJsonNote {
  code: InventoryNoteCode;
  message: string;
  registry: string | null;
  itemId: string | null;
  /** REDACTED, or `null`. */
  redactedUrl: string | null;
}

/** `cli/render.ts`'s envelope, then this command's own two keys. `root` is the
 *  only absolute path in the document; every path inside `registries` is the
 *  root-relative `receiptPath` form. */
export interface ListJsonDocument extends JsonEnvelope {
  command: "list";
  registries: ListJsonRegistry[];
  notes: ListJsonNote[];
}

export function toListJson(result: ListResult, root: string): ListJsonDocument {
  return {
    command: "list",
    root,
    // Equals `listExitCode(result) === 0` by construction — the listing is
    // complete unless a note says a registry or the receipt could not be read.
    ok: listExitCode(result) === 0,
    registries: result.groups.map((group) => ({
      namespace: group.registry,
      index: group.redactedUrl,
      title: group.title,
      homepage: group.homepage,
      items: group.rows.map((row) => toJsonItem(row)),
    })),
    notes: result.notes.map((note) => ({
      code: note.code,
      message: note.message,
      registry: note.registry ?? null,
      itemId: note.itemId ?? null,
      redactedUrl: note.redactedUrl ?? null,
    })),
  };
}

function toJsonItem(row: ListRow): ListJsonItem {
  const item: AvailableItem = row.item;
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    title: item.title,
    description: item.description,
    requires: item.mantine?.requires ?? null,
    provider: item.mantine?.provider ?? null,
    queryMatches: row.queryMatches,
    queryRank: row.queryRank,
    installed:
      row.installed === null
        ? null
        : {
            direct: row.installed.direct,
            sourceUrl: row.installed.sourceUrl,
            files: row.installed.files.map((file) => ({
              path: file.receiptPath,
              status: localStatus(file),
            })),
          },
  };
}

export function renderListJson(result: ListResult, root: string): string {
  return renderJson(toListJson(result, root));
}

// ---- the shell ----------------------------------------------------------------

export interface ListFlags {
  /** As commander supplies it — `--cwd`, defaulted to `process.cwd()`. */
  cwd: string;
  json?: boolean;
  query?: string;
  /** Commander's accumulated values for repeatable `--type <type>`. */
  type?: string[];
  installed?: boolean;
}

/**
 * The two streams, injected — `cli/render.ts`'s `Streams`, which every shell in
 * the package now takes. A parameter rather than `process.stdout` because the
 * whole command is otherwise testable without a network or a filesystem, and a
 * renderer that writes to the process is the one seam that would force a
 * subprocess to assert on output.
 */
export type ListIo = Streams;

/**
 * A namespace as typed, normalized only when normalizing cannot change which
 * registry is meant.
 *
 * `manteen list house` is a plausible thing to type and the config schema pins
 * every registry key to `^@[a-z0-9-]+$` (mirrored by `ref.ts`'s
 * `NAMESPACE_PATTERN`), so a leading `@` is never ambiguous — there is no
 * configurable namespace that lacks one.
 *
 * The guard is on the RESULT, not the input: `@House` and `blocks/x` pass
 * through untouched so `readAvailable`'s `unknown-namespace` note echoes exactly
 * what the user typed. A normalizer that rewrote them would report a name the
 * user never entered, which is the one thing an "is not a registered namespace"
 * message must not do.
 */
export function normalizeNamespace(argument: string): string {
  if (argument.startsWith("@")) return argument;
  const prefixed = `@${argument}`;
  return NAMESPACE_PATTERN.test(prefixed) ? prefixed : argument;
}

/**
 * The production wiring: root -> config -> ports -> streams -> exit code.
 *
 * `loadEnv(root)` is called HERE and exactly once. It reads `.env` / `.env.local`
 * and mutates `process.env` as a side effect, and its return value holds
 * expanded secrets — so it lives at the impure boundary, is handed straight to
 * `AvailablePorts.env`, and never reaches a render, a note or a throw.
 */
export async function runList(
  namespaces: readonly string[],
  flags: ListFlags,
  io: ListIo = PROCESS_STREAMS,
): Promise<number> {
  // The shared exit-2 boundary. This used to render a `formatConfigErrors`
  // block under one head line; it now renders one `error  config  <pointer>`
  // per `ConfigError`, which is `add`'s shape. The tiebreak is not aesthetic —
  // `add` is the only one of the five with an installed base of assertions
  // against its output, so it is the shape that cannot move.
  const loaded = loadProjectConfig(flags.cwd, io.stderr);
  if (!loaded.ok) return loaded.exit;

  const { root, config } = loaded;
  const ports: ListPorts = {
    installed: createInstalledPorts(),
    available: { load: createIndexLoader(), env: loadEnv(root) },
  };

  let result: ListResult;
  try {
    result = await buildList(config, ports, {
      registries: namespaces.map(normalizeNamespace),
      query: flags.query,
      types: flags.type,
      installed: flags.installed,
    });
  } catch (error) {
    // The `FileHasher` contract's escape hatch — EACCES or EISDIR at a recorded
    // destination. Rendered rather than swallowed, and never demoted to a note.
    io.stderr("error  list\n");
    io.stderr(renderThrown(error));
    return 1;
  }

  if (flags.json) {
    // Everything in ONE document on stdout, notes included: a `--json` consumer
    // parsing stdout while the reason its listing is short goes to stderr is a
    // consumer that silently sees a short listing.
    io.stdout(renderListJson(result, root));
    return listExitCode(result);
  }

  io.stderr(renderListNotes(result.notes));
  io.stdout(renderList(result));
  return listExitCode(result);
}
