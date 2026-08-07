# Upstream removal handoff

Status: **implemented and locally accepted; hosted acceptance, merge and release remain open.**
This is the prospective client-only `manteen@0.4.0` lifecycle milestone. It changes neither
`manteen-kit@0.2.0`, receipt version 3 nor the registry interchange format, and it authorizes no
tag, npm publication or Pages deployment.

## The problem

`manteen diff` already reports `removed-upstream` when a receipt-owned ordinary file no longer
appears under the same current registry item. `manteen update` deliberately retains that source,
its pristine base and its receipt claim. That is the safe default: a registry omission is useful
information, but it is not permission to delete a project's file.

The missing operation is an explicit way to review and transactionally remove exactly those stale
ordinary files without turning update into an implicit prune or pretending a rename was proven.

## Command boundary

The command is:

```bash
manteen remove --upstream-removed --dry-run
manteen remove --upstream-removed --file src/components/ui/old.tsx --dry-run
manteen remove --upstream-removed --file src/components/ui/old.tsx
```

Its surface is deliberately small:

- `--upstream-removed` is the required mode. Bare `remove` exits 2.
- `--dry-run` with no `--file` discovers every proven candidate and writes nothing.
- `--dry-run` with repeated `--file` values previews that exact selection.
- A real run requires at least one repeated exact `--file`; no selection exits 2.
- `--file` is the POSIX root-relative destination exactly as recorded in
  `manteen.lock.json`. Absolute paths, backslashes, `./` aliases and inferred spellings are not
  normalized into authority.
- A duplicate `--file`, `--discard-adapted` without a selected preview/apply, or another
  contradictory flag combination exits 2.
- There are no positional item refs, prompts, `--all`, `--yes` or `--force`.
- `--json` produces the same facts as text on stdout as one document; diagnostics remain
  structured and secrets remain redacted.

Exit 0 means a successful discovery/preview, no candidates, or a completed selected transaction.
Exit 1 means resolution, selection, state, preflight, write or rollback refusal/failure. Exit 2 is
usage or configuration. Exit 130 is unreachable because this command never prompts.

## What proves a candidate

Candidate identity is the pair:

```text
(receipt item canonical id, exact receipt destination)
```

The resolution set is exact: seed it with **every** `receipt.items[].id`, including an item whose
`files` array is empty or whose only remaining provenance is theme/styles state. Those receipt root
ids are never rewritten by a name resolution—the candidate proof needs the same canonical id.
Configured resolutions still apply while walking the complete current transitive
`registryDependencies` closure from those roots. A dependency newly introduced upstream is
therefore in scope even when it has no receipt row. "Another current item" below means another
member of this bounded set; the command does not pretend it has enumerated an entire registry
universe.

All of the following must be true:

1. The v3 receipt is present, readable and structurally valid.
2. The current item with that same canonical id was fetched, wire-validated and fully resolved.
3. Its current ordinary file list omits the exact receipt destination.
4. No other successfully resolved current item claims that destination.
5. The destination is not the recorded/current theme or managed-styles destination.

Any unavailable or partially interpreted member fails closed for the **whole** discovery, preview
or transaction; the command never emits a partial candidate list. A missing index entry, an item
404, `fetch-failed`, `wire-invalid`, a contentless/refused ordinary wire file, a collision or an
unresolved target never becomes removal evidence. This all-roots-plus-closure graph is also the
complete cross-owner proof set: resolution is not narrowed to selected owners.

The command does not compare source paths, basenames or similar text. It does not infer a rename,
ask an AST to match declarations, or turn one item's removal plus another item's addition into a
move. Those remain two independent facts.

## Candidate states and destructive intent

Each proven candidate has one source state:

- `unchanged`: the destination is a regular file whose raw-byte SHA-256 equals the receipt's
  pristine `baseSha256`;
- `adapted`: the destination is a regular file and its raw-byte hash differs from
  `baseSha256`; or
- `missing`: the destination is absent locally.

`installedSha256` is not the adaptation boundary. A prior clean three-way update can accept a
merged local adaptation as the installed result, making current bytes equal `installedSha256`
while still differing from pristine upstream. Calling that unchanged would delete local work.

An adapted candidate must be named by exact `--file` and accompanied by `--discard-adapted`.
That flag changes the requested destructive operation; it does not downgrade a diagnostic.
Discovery without selection still lists adapted candidates, but a selected preview/apply without
the flag refuses as `remove-adapted-file`.

A missing source is explicit bookkeeping cleanup: a selected transaction removes its derived base
when present and its exact receipt file record. An absent base is already absent and is recorded as
such for stale-plan preflight. Here `corrupt` means a **readable regular** base whose raw-byte hash
does not equal the receipt's `baseSha256`; it may be removed as obsolete Manteen-owned state and its
contents are never used to decide whether project source is adapted. Every existing source, base
and receipt path must be a readable regular file reached without a symlink or junction in any
project-relative path component. A symlink, junction, directory, other non-regular type, or
lstat/read failure refuses as `remove-path-unsupported`, because the byte journal cannot prove
containment and restore that filesystem object exactly.

## Refusals

All removal-specific diagnostics are error, non-forceable, removal-plan/preflight phase, exit 1:

| Code | Meaning and remedy |
| --- | --- |
| `remove-file-unowned` | A selected spelling is not an exact ordinary destination owned by the receipt. Select a path printed by discovery. |
| `remove-file-still-published` | The same current item still publishes the selected destination. It is not an upstream-removal candidate. |
| `remove-file-reassigned` | Another current item now claims that destination. Resolve ownership explicitly; pruning cannot choose a winner. |
| `remove-file-artifact` | The destination is the recorded or current theme/managed-styles artifact, not an ordinary-file pruning candidate. Maintain that artifact through its owning lifecycle. |
| `remove-adapted-file` | Current source differs from pristine upstream. Preserve it, or repeat the exact selection with `--discard-adapted`. |
| `remove-path-unsupported` | Source, base or receipt is neither absent nor a readable regular file, so exact rollback is unavailable. Repair its type/permissions first. |

The applicable pre-removal surface is deliberately narrower than add/update:

- configuration loading and the structurally valid v3 receipt are required; a readable regular
  receipt with malformed JSON/schema uses `receipt-unreadable`, while an unsupported/unreadable
  filesystem object uses `remove-path-unsupported`;
- graph resolution may carry `unknown-namespace`, `missing-env`, `fetch-failed`, `wire-invalid`,
  `file-no-content`, `target-collision`, `target-escapes-root`, `target-reserved`,
  `target-refused-type`, `bare-dep-unresolvable`, `depth-exceeded`, `node-limit` and
  `response-too-large`, plus the non-blocking graph facts `resolution-applied`,
  `dependency-cycle` and `name-mismatch`; and
- exact receipt/current ordinary-target ownership plus theme/styles artifact exclusion emits only
  the removal-specific rows above.

Removal does **not** evaluate package-manager detection, dependency union/ranges, installed Mantine,
provider metadata, CSS/package styles, theme folding, managed-styles configuration/drift,
TypeScript/jsconfig compatibility, update merge/base/conflict, or configured verification scripts.
Their diagnostics cannot appear in a removal result and no dependency install or consumer
verification runs. Stale source/base/receipt state is an outcome failure, as are write and rollback
failures; they are not reclassified as registry diagnostics.

## Frozen result surface

Candidate and committed-removal rows are exact and destination-sorted:

```ts
interface RemoveCandidate {
  itemId: string;
  destination: string; // exact POSIX receipt path
  state: "unchanged" | "adapted" | "missing";
  base: "present" | "missing" | "corrupt";
  selected: boolean;
  discardAdaptedRequired: boolean; // true exactly when state === "adapted"
}

interface CommittedRemoval {
  itemId: string;
  destination: string;
  source: "removed" | "already-missing";
  base: "removed" | "already-missing";
}

interface RemovalFailure {
  kind: "stale-plan" | "write-failed" | "rollback-failed";
  message: string;
  paths?: string[]; // POSIX root-relative; present for rollback failures
}
```

`--json` extends the existing two-space-indented, newline-terminated envelope and keeps `notes`
last:

```ts
interface RemoveJsonDocument {
  command: "remove";
  root: string;
  ok: boolean;
  mode: "upstream-removed";
  dryRun: boolean;
  candidates: RemoveCandidate[];
  removals: CommittedRemoval[];
  receipt: { path: "manteen.lock.json"; projectedChange: boolean; written: boolean };
  updateState: { changed: true; versioningRequired: true } | null;
  failure: RemovalFailure | null;
  diagnostics: Diagnostic[];
  notes: InventoryNote[];
}
```

Unselected discovery has `projectedChange: false`; a valid selected set has `projectedChange: true`
even in preview or when an adapted-file refusal still withholds authority. Discovery/preview never
claims writes: `removals` is empty, `receipt.written` is false and `updateState` is null. A
refusal/failure likewise reports no committed removals; `written` means committed by a successful
transaction, not merely attempted. A successful rollback therefore reports false, while rollback
failure is explicitly non-coherent. Only a successful real transaction fills `removals`, sets
`receipt.written`, and reports observed `updateState`. Text prints the same candidate
state/selection, committed removal, receipt/state and failure facts; snapshots freeze wording.
Neither form includes source/base/receipt contents, expanded URLs, headers or secrets.

## Transaction

Removal has its own `RemovalPlan` and apply path. It does not fabricate an install/update `Plan`
and never calls normal `apply()`, which also owns dependency installation, ordinary updates, theme
folding and managed styles.

Planning records, in deterministic destination order:

- the exact selected owner/destination;
- source state plus its present raw-byte hash or expected absence;
- the derived base path plus its present raw-byte hash or expected absence;
- the exact receipt raw-byte hash and projected receipt bytes; and
- the diagnostics and projected receipt/base change, never an observed state-versioning fact.

Preflight rechecks containment, uniqueness, regular-file types and every present/absent source,
base and receipt fact. Any drift refuses before mutation. Apply then uses one pre-image journal:

1. remove each selected project source that is present;
2. remove each selected derived base that is present;
3. write the projected receipt last through temp-plus-rename; and
4. commit the journal only when all mutations succeed.

Any failure unwinds exact receipt, base and source pre-images in reverse order. A rollback failure
names the affected paths and does not claim coherence. Only a successful non-dry transaction may
report the observed state mutation and emit the existing state-versioning advisory; discovery,
preview, refusal and rolled-back failure never do.

The pure receipt projection filters only the selected `(item id, destination)` records. It keeps
the `ReceiptItem`, including sticky `direct`, even when `files` becomes empty. It preserves
`$schema`, item metadata and order, receipt theme/styles and their provenance. It does not remove
dependencies, directories, newly added upstream files, theme fragments, generated styles or an
item itself. A later explicit item-uninstall contract may clear `direct`; this one cannot.

## Required evidence

Source tests must prove:

- exact same-item/destination joins and no rename/content/AST inference;
- unavailable, invalid, cross-owner and still-published refusals with zero mutation;
- unchanged/adapted/missing classification against `baseSha256`;
- exact repeated selection, duplicate/invalid usage and adapted double opt-in;
- deterministic text/JSON output without source contents or expanded secrets;
- zero-file item retention and byte-identical theme/styles/dependency state;
- absent/corrupt regular base cleanup without using it as adaptation evidence;
- source/base/receipt stale-plan detection;
- injected failures at each mutation restore exact source/base/receipt bytes; and
- non-regular/symlink paths refuse before the journal opens.

The built-Node tier must install a controlled old revision, switch to a current revision that omits
one ordinary file, and exercise discovery, selected preview, unchanged removal, adapted refusal and
flagged discard, locally missing cleanup, unavailable/reassigned refusal, help, JSON and POSIX
`--file` spelling. Hosted Windows must cover CRLF/current-byte hashing and the same POSIX receipt
selector. Both source and built tiers run against disposable directories; no probe writes into this
repository's `node_modules`.

This evidence proves the explicit file-removal transaction and nothing broader. It does not prove
that a registry omission was intentional, infer that another file is a rename, uninstall a whole
item, remove now-unused packages or certify application behavior after deletion. Consumer-owned
verification remains a separate action after a coherent removal.

## Implementation ownership and release boundary

The safest implementation order is:

1. freeze D42, refusal rows and these types/outputs;
2. implement pure candidate discovery and receipt projection;
3. implement removal-specific preflight/journal apply;
4. wire the CLI/help/text/JSON surface;
5. add source and built-Node acceptance, then run the existing full gates; and
6. publish only through a separately reviewed client `0.4.0` tag if the hosted matrix and fresh
   public-consumer lifecycle proof pass.

The kit remains `0.2.0`. No registry item or Pages deployment is required for the CLI capability.
README, changelog and public CLI reference describe the implemented-but-unreleased surface. A
future tag still requires separate hosted matrix and fresh public-consumer lifecycle acceptance.

## Local implementation receipt — 2026-08-07

The implementation adds a narrow removal validator/planner, pure candidate discovery and receipt
projection, a dedicated preflighted journal transaction, the CLI/text/JSON shell, public docs, and
one self-contained built-Node lifecycle. The built lifecycle creates its registry and consumer in
`mkdtemp()`: no probe writes into this repository's `node_modules`.

One final local gate pass from the feature branch reported:

- `bun run test`: 300 passed, 0 failed;
- `bun run typecheck`: workspace guard clean, TypeScript clean, Astro 0 errors with two existing
  deprecation hints;
- `bun run lint`: 300 files checked, no fixes required;
- `bun run guard`: all five guards clean, including 57 diagnostics emitted/documented and none
  pending;
- `bun run build:registry && bun --cwd=packages/cli run build`: 22 registry items conformed and the
  flat Node 22.12 CLI bundle built; and
- `node --test packages/cli/e2e/*.node-e2e.mjs`: 128 passed, 0 failed, one opt-in package-manager
  smoke skipped.

Independent review then found and closed three issues before commit: parent symlink/junction
containment, relative wire-path rendering, and unrelated receipt-array reordering. The five new
regressions are included in the 300-test result above. After rebuilding the shipped bundle, the
dedicated built-Node removal lifecycle passed both of its tests again.

The new built-Node test covers help/usage, an unavailable receipt root withholding every candidate,
cross-owner reassignment refusal, literal POSIX selection and raw CRLF classification, selected
preview, unchanged and locally-missing cleanup, adapted refusal plus exact
`--discard-adapted`, zero-file/direct receipt retention, unrelated-byte preservation, JSON, and the
observed state-versioning advisory.

This is local product evidence for the built CLI, not hosted Windows/macOS/Linux evidence and not a
public npm consumer receipt. No version was bumped, tag created, package published, Pages workflow
run, or release claim made.
