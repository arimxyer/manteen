/**
 * The CLI's vocabulary, in one module.
 *
 * Every shell in this package prints the same four kinds of thing — a
 * diagnostic, an inventory note, a config problem, an unanticipated throw — and
 * before this file existed each of them was re-expressed per command. `add`
 * kept four private renderers in `cli/index.ts`, `info` copied three of them
 * verbatim, `diff` demanded one be passed in because it could not import
 * `cli/index.ts` (that module has a shebang and RUNS a program on import), and
 * `list` reached for `formatConfigErrors` instead. Four copies of one format is
 * four places for it to drift, and the drift is invisible until a user pipes two
 * commands into the same log.
 *
 * This module is a LEAF on purpose: it imports types and `config/load`, and
 * nothing that reads `process.argv` or sets an exit code. That is what lets
 * `cli/index.ts` and every command module share it without a cycle.
 *
 * SHAPE, and it is one shape:
 *
 *   <severity>  <code>  <subject>
 *     <path or url>
 *     <message, one line per line>
 *
 * `severity` is `error`/`warn`/`info` for a `Diagnostic` and the literal word
 * `note` for an `InventoryNote`. A note is NOT given a severity, because
 * `InventoryNoteCode` and `DiagnosticCode` share two spellings —
 * `unknown-namespace` and `receipt-unreadable` — with opposite consequences, and
 * a note printed under `error` is exactly what teaches a reader to switch on the
 * code alone.
 *
 * STREAMS. Diagnostics and notes go to STDERR in text mode, in every command, so
 * `manteen list | grep table` and `manteen diff --json | jq` both see only the
 * answer. Under `--json` the notes travel inside the single stdout document
 * instead — a consumer parsing stdout while the reason its answer is short goes
 * to stderr is a consumer that silently sees a short answer.
 *
 * SECRETS. Nothing here expands anything. Every string it receives is already
 * redacted at its source: `Diagnostic.path` is authored from a `redactedUrl`,
 * `InventoryNote.redactedUrl` is the template with `${VAR}` left literal, and
 * `ConfigError` never sees an expanded value.
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { createPatch } from "diff";

import { CONFIG_FILENAME, loadConfig } from "../config/load";
import type { ConfigError, LoadedConfig } from "../config/types";
import type { InventoryNote } from "../inventory/types";
import type { ApplyOutcome, Diagnostic, Plan } from "../plan/types";
import { machineStderr, machineStdout } from "./machine";

// ---- streams ----------------------------------------------------------------

/** One write. A parameter rather than `process.stdout` so a command is drivable
 *  in-process, which is how several shells are tested. */
export type Writer = (text: string) => void;

export interface Streams {
  stdout: Writer;
  stderr: Writer;
}

/**
 * The real streams.
 *
 * `void` on each write because `write()` returns a backpressure boolean that no
 * caller here acts on, and an ignored return is a lint finding waiting to
 * happen. The `process` reads are inside the closures, so importing this module
 * still touches nothing.
 */
export const PROCESS_STREAMS: Streams = {
  stdout: machineStdout,
  stderr: machineStderr,
};

// ---- paths ------------------------------------------------------------------

/**
 * Root-relative and POSIX, so output is identical on Windows.
 *
 * The scheme early-out is load-bearing and carries a recorded bug:
 * `Diagnostic.path` holds either a filesystem path or a registry URL, and
 * `relative()` collapses `https://` into `https:/` — a `fetch-failed` once
 * printed a URL that 404s when copy-pasted.
 */
export function display(pathOrUrl: string, root: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return relative(root, pathOrUrl).split(sep).join("/");
}

// ---- diagnostics ------------------------------------------------------------

/**
 * `severity  code  ids` on the first line, then path and message indented.
 *
 * The code is printed rather than only the prose because it is the stable
 * handle: e2e assertions and user bug reports both grep for `target-collision`,
 * and `Diagnostic.message` is free to be reworded.
 */
export function renderDiagnostic(diagnostic: Diagnostic, root: string): string {
  const ids = diagnostic.items?.length ? `  ${diagnostic.items.join(", ")}` : "";
  const lines = [`${diagnostic.severity}  ${diagnostic.code}${ids}`];
  if (diagnostic.path) lines.push(`  ${display(diagnostic.path, root)}`);
  for (const line of diagnostic.message.split("\n")) lines.push(`  ${line}`);
  return `${lines.join("\n")}\n`;
}

/** Every diagnostic, in order, to stderr. `info` severity is kept — a command
 *  that wants it dropped (`diff` does) filters before calling. */
export function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  root: string,
  stderr: Writer,
): void {
  for (const diagnostic of diagnostics) stderr(renderDiagnostic(diagnostic, root));
}

// ---- notes ------------------------------------------------------------------

/**
 * One inventory note.
 *
 * SUBJECT is one token — `itemId ?? registry` — mirroring `renderDiagnostic`'s
 * single `items` slot, so the two channels line up on one terminal. A note that
 * carries both is always about the item; the registry is already named in its
 * message.
 *
 * The `redactedUrl` line is CONDITIONAL, and the condition is measured rather
 * than assumed. Exactly six note codes ever carry one, and they split evenly:
 *
 *   ends with the URL       `index-unreachable`, `index-invalid`,
 *                           `index-missing-env`   (all in `available.ts`)
 *   carries it, silently    `index-entry-dropped`, `index-name-uninstallable`
 *                           (`available.ts`), `not-in-index` (`list.ts`, `info.ts`)
 *
 * Printing it unconditionally doubles it for the first group; dropping it loses
 * it for the second. `list` had chosen the second reading and `diff` the first,
 * and each was right about half the codes. So the line is emitted only when the
 * message does not already end in it.
 *
 * This does couple rendering to message WORDING, which is the cost. A seventh
 * code is free either way; re-wording one of the six is what to watch.
 */
export function renderNote(note: InventoryNote): string {
  const subject = note.itemId ?? note.registry;
  const lines = [`note  ${note.code}${subject === undefined ? "" : `  ${subject}`}`];
  if (note.redactedUrl !== undefined && !note.message.endsWith(note.redactedUrl)) {
    lines.push(`  ${note.redactedUrl}`);
  }
  for (const line of note.message.split("\n")) lines.push(`  ${line}`);
  return `${lines.join("\n")}\n`;
}

/** The notes block, or `""`. Newline-terminated so it never runs into the
 *  report that follows it on the other stream. */
export function renderNotes(notes: readonly InventoryNote[]): string {
  return notes.map(renderNote).join("");
}

/**
 * (registry, code, message), by CODE UNIT.
 *
 * This is `inventory/available.ts`'s own ordering, restated here as the single
 * exported one. It matters that it is the SAME key: `readAvailable` returns its
 * notes already sorted, and a command that merged them into its own list under a
 * different comparator would silently reorder them. Two of the four commands had
 * begun to — `diff` keyed on (code, subject, message) — which is how one note
 * ends up in two places depending on which command printed it.
 *
 * Never `localeCompare`: it makes output depend on `LANG`, and this repo asserts
 * byte-identical output.
 */
export function sortNotes(notes: readonly InventoryNote[]): InventoryNote[] {
  return [...notes].sort((a, b) => {
    const left = `${a.registry ?? ""} ${a.code} ${a.message}`;
    const right = `${b.registry ?? ""} ${b.code} ${b.message}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

// ---- what a write run did ---------------------------------------------------
// `add` and `update` are the same operation over different ref sets, so they
// print the same two reports. These moved out of `cli/index.ts` verbatim when
// `update` was wired: an update that rendered its own verbs would give the two
// commands two vocabularies for one act.

/** Widest verb in either vocabulary — `identical`, `overwrite`, `unchanged`. */
export const VERB_WIDTH = 9;

/**
 * What `--dry-run` prints: `Disposition`, which is what plan() PREDICTED.
 *
 * Read off the Plan rather than off `ApplyOutcome.files`, because under D19 the
 * outcome's `WriteResult` describes writes that were never attempted.
 */
export function renderDryRun(planned: Plan): string {
  const lines = planned.files.map(
    (file) => `${file.disposition.padEnd(VERB_WIDTH)}  ${display(file.destination, planned.root)}`,
  );
  if (planned.theme) {
    const verb = planned.theme.changed ? "merge" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(planned.theme.destination, planned.root)}`);
  }
  if (planned.styles) {
    const verb = planned.styles.changed ? "compose" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(planned.styles.destination, planned.root)}`);
  }
  lines.push("", "Dry run — nothing was written.");

  const patch = themePatch(planned);
  if (patch !== null) lines.push("", patch);

  return `${lines.join("\n")}\n`;
}

/**
 * The theme merge, as a unified diff.
 *
 * A dry run can show every other decision as one verb per destination, but
 * `merge  src/lib/theme.ts` is the one line that hides its whole content: the
 * fold is the only thing manteen does that REWRITES a file the user wrote, and
 * "merge" alone gives no way to see what it kept. So the theme — and only the
 * theme — gets its content previewed.
 *
 * FULL CONTEXT rather than the usual three lines, up to a bound. Three lines
 * around a `components.Table` insertion shows the tail of the entry above it and
 * nothing else, which answers "what was added" while leaving "what survived"
 * — the question a user with a hand-edited theme actually has — unanswered. A
 * theme is one small file, so printing it whole is affordable and is the point.
 * `MAX_FULL_CONTEXT` keeps a pathological theme from flooding the terminal.
 *
 * Reads the base off disk rather than from the Plan: `PlannedTheme` carries the
 * base's `sha256` but not its text (`plan/types.ts` is frozen), and the fold
 * itself needs only the hash. A re-read is safe here because this renders a
 * PREVIEW — a file that changed since `plan()` makes the diff stale, never
 * wrong, and the real run's preflight refuses on exactly that drift.
 */
const MAX_FULL_CONTEXT = 400;

function themePatch(planned: Plan): string | null {
  const theme = planned.theme;
  if (theme === null || !theme.changed) return null;

  // `base === null` is a theme being created, so the "before" side is empty and
  // every line renders as an addition — which is the truth.
  let before = "";
  if (theme.base !== null) {
    try {
      before = readFileSync(theme.destination, "utf8");
    } catch {
      // Unreadable between plan() and here. The preview degrades to nothing
      // rather than to a diff against "" that would claim the whole file is new.
      return null;
    }
  }

  const label = display(theme.destination, planned.root);
  const lineCount = before.split("\n").length;
  const patch = createPatch(label, before, theme.text, "on disk", "after merge", {
    context: lineCount <= MAX_FULL_CONTEXT ? lineCount : 3,
  });

  // jsdiff prefixes every patch with `Index: <file>` and a rule of `=`, which is
  // an RCS artifact and not part of a unified diff. The `---`/`+++`/`@@` body is.
  return patch.split("\n").slice(2).join("\n").trimEnd();
}

/** What a real run prints: `WriteResult`, which is what apply() OBSERVED. */
export function renderOutcome(outcome: ApplyOutcome, root: string): string {
  const lines = outcome.files.map(
    (file) => `${file.result.padEnd(VERB_WIDTH)}  ${display(file.destination, root)}`,
  );
  if (outcome.theme) {
    const verb = outcome.theme.written ? "written" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(outcome.theme.path, root)}`);
  }
  if (outcome.styles) {
    const verb = outcome.styles.written ? "written" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(outcome.styles.path, root)}`);
  }
  if (outcome.receipt.written) {
    lines.push(`${"written".padEnd(VERB_WIDTH)}  ${display(outcome.receipt.path, root)}`);
  }
  // `installed` unconditionally, because `dependencies.command` is what apply
  // RAN and `install-deps.ts` only appends a batch to it AFTER that batch
  // returned — so a non-null command names batches that landed, even on the
  // partial-install failure where `dependencies.installed` is false. The old
  // `installed ? … : "skipped"` printed `skipped  npm install @mantine/core@^9`
  // for a command that had already rewritten the user's package.json, which is
  // the same class of misreport as a `written` line for a rolled-back file.
  // Nothing ran ⇒ `command` is null ⇒ no line at all.
  if (outcome.dependencies.command) {
    lines.push(`${"installed".padEnd(VERB_WIDTH)}  ${outcome.dependencies.command}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * Required follow-up after a mutating run changed Manteen's update ancestry.
 *
 * This is intentionally an APPLY advisory rather than a plan diagnostic:
 * `diff` constructs an update-shaped Plan but writes nothing, and only apply
 * knows whether phase 1 accepted a file and phase 6/7 actually changed a base
 * or receipt. Keeping it on stderr preserves the stdout report for pipelines.
 *
 * `info`, not `warn`, and the reason is its firing rate rather than its
 * importance. D39 rules out inspecting Git, so this cannot know whether the
 * project already versions both paths — which means it fires after essentially
 * every successful `add` and every real `update`. A warning that is present on
 * the whole happy path stops being read, and takes the genuinely conditional
 * warnings beside it down too. The severity states what it is: a standing fact
 * about how Manteen stores state, not a report that something is wrong.
 */
export function renderUpdateStateAdvisory(outcome: ApplyOutcome, plan: Plan): string {
  if (!outcome.ok || outcome.dryRun || !outcome.updateState.changed) return "";
  return renderStateVersioningAdvisory(plan.stateIgnored);
}

/** Shared D39 wording for any successful lifecycle transaction that observed
 * a receipt/base mutation. Callers must establish success and real mutation;
 * discovery and previews never reach this function. */
export function renderStateVersioningAdvisory(stateIgnored: boolean): string {
  if (!stateIgnored) {
    return (
      "info  state-versioning-required\n" +
      "  This run changed Manteen's update state.\n" +
      "  Version manteen.lock.json and .manteen/bases/ together; do not ignore .manteen/.\n" +
      "  A clone missing either cannot safely merge local adaptations during update.\n"
    );
  }
  // `warn`, not `info`, precisely because this half is CONDITIONAL — the reason
  // the unignored case was demoted does not apply to a project that has already
  // made the mistake. Naming the file and the effect rather than the fix: the
  // rule may be deliberate, and Manteen is in no position to edit it.
  return (
    "warn  state-versioning-required\n" +
    "  This run changed Manteen's update state, and .gitignore appears to ignore .manteen/.\n" +
    "  The pristine bases under .manteen/bases/ are how update merges registry changes\n" +
    "  around your local adaptations. Without them a fresh clone cannot update at all:\n" +
    "  every run refuses with merge-base-unreadable until the bases are restored, and the\n" +
    "  only way through is `manteen update --take-upstream`, which discards adaptations.\n" +
    "  Un-ignore .manteen/ and commit it with manteen.lock.json.\n"
  );
}

/** An apply failure, in `renderDiagnostic`'s head-then-indented shape. */
export function renderApplyFailure(outcome: ApplyOutcome, root: string): string {
  const failure = outcome.failure;
  if (failure === null) return "";

  const lines = [`error  ${failure.kind}`];
  for (const line of failure.message.split("\n")) lines.push(`  ${line}`);
  for (const path of failure.paths ?? []) lines.push(`  ${display(path, root)}`);
  return `${lines.join("\n")}\n`;
}

// ---- the --json envelope ----------------------------------------------------

/**
 * The one shape every `--json` document starts with.
 *
 * Four commands emitted four unrelated top-level objects before this existed —
 * `list` a bare `{registries, notes}`, `diff` its `DiffResult`, `info` a
 * hand-assembled record. A consumer could not tell which command produced a
 * document it was handed, could not find the project root in three of the four,
 * and had to know per command whether success was reported at all.
 *
 * The rule, stated once so no renderer has to re-decide it:
 *
 *   command       which command wrote this. The discriminator.
 *   root          ABSOLUTE project root. The only absolute path in any
 *                 document — everything else is POSIX and root-relative, per
 *                 `InstalledFile.receiptPath`.
 *   ok            did the command produce the answer it was asked for. Equals
 *                 `exit code === 0`. `diff` is always true: a difference is the
 *                 ANSWER to diff, never a failure of it.
 *   …payload      the command's own keys.
 *   diagnostics   present only where a command has a `Diagnostic[]` at all.
 *   notes         ALWAYS present, ALWAYS last, and always inside the document
 *                 rather than on stderr — a consumer parsing stdout must not
 *                 have to read a second stream to learn its answer is partial.
 *
 * `diagnostics` and `notes` stay two keys, permanently. `unknown-namespace` and
 * `receipt-unreadable` are values of BOTH `DiagnosticCode` and
 * `InventoryNoteCode` and they mean opposite things — the diagnostic blocks, the
 * note does not. Merging them for a tidier payload makes an informational
 * `not-installed` indistinguishable from a refusal.
 */
export interface JsonEnvelope {
  command: "init" | "add" | "list" | "info" | "diff" | "update" | "remove" | "status" | "agent";
  root: string;
  ok: boolean;
}

/**
 * Two-space indented and newline-terminated, so the document is diffable and so
 * a shell prompt does not land on the closing brace.
 *
 * Generic over the envelope rather than typed `JsonEnvelope & Record<string,
 * unknown>`: a declared `interface` has no index signature, so the intersection
 * would reject exactly the named document types the commands want to publish.
 */
export function renderJson<T extends JsonEnvelope>(document: T): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

// ---- config -----------------------------------------------------------------

/**
 * Same three-part head as a diagnostic — `severity  subject  where` — so config
 * failures and plan failures read alike. `hint` is separated by a blank line
 * because it is the user's next action, not more description of the problem.
 */
export function renderConfigError(error: ConfigError): string {
  // `pointer` is a JSON Pointer (`/aliases/ui`) and is the empty string when the
  // problem is the file as a whole, which would otherwise print a dangling head.
  const lines = [error.pointer ? `error  config  ${error.pointer}` : "error  config"];
  for (const line of error.message.split("\n")) lines.push(`  ${line}`);
  if (error.hint) {
    lines.push("");
    for (const line of error.hint.split("\n")) lines.push(`  ${line}`);
  }
  return `${lines.join("\n")}\n`;
}

/** A throw, as opposed to a returned failure — a bug, or an fs error nobody
 *  anticipated. Two spaces on every line, newline-terminated. */
export function renderThrown(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${message
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n`;
}

/** `manteen.json`'s absolute path, for a message that has to name the file. */
export function configPathFor(root: string): string {
  return resolve(root, CONFIG_FILENAME);
}

export type ConfigOutcome =
  | { ok: true; root: string; config: LoadedConfig }
  /** Always 2. Named rather than inlined so a caller cannot accidentally
   *  return 1 for a problem that happened before there was a Plan. */
  | { ok: false; exit: 2 };

/**
 * Resolve `--cwd`, load `manteen.json`, and report a failure exactly once.
 *
 * All six configured-project shells need this and each had written it: `loadConfig` reports
 * authored problems by RETURNING (there can be several at once — three unbacked
 * aliases are three edits), while an EACCES on `tsconfig.json` or a bug still
 * throws. Both are exit 2, because both happened before there was anything to
 * report on. `add` established that split and this is its implementation.
 *
 * Errors are rendered PER `ConfigError`, which is `add`'s shape — not a single
 * `formatConfigErrors` block, which `list` had reached for. The tiebreak is not
 * aesthetic: the 62-test e2e tier already asserts against `add`'s output, so
 * `add` is the shape that cannot move.
 */
export function loadProjectConfig(cwd: string, stderr: Writer): ConfigOutcome {
  const root = resolve(cwd);

  let loaded: ReturnType<typeof loadConfig>;
  try {
    loaded = loadConfig(root);
  } catch (error) {
    stderr("error  config\n");
    stderr(renderThrown(error));
    return { ok: false, exit: 2 };
  }

  if (!loaded.ok) {
    for (const configError of loaded.errors) stderr(renderConfigError(configError));
    return { ok: false, exit: 2 };
  }

  return { ok: true, root, config: loaded.config };
}
