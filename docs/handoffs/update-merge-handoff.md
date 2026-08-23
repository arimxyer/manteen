# Update merge handoff

[Documentation map](../project-context.md) · [Implementation handoffs](README.md)

Status: complete on 2026-08-05 and public in `manteen@0.3.0` on 2026-08-07; source,
built-Node, hosted and controlled-revision acceptance are green.

## The question

Can `manteen update` bring current registry changes into component source without silently
discarding the adaptations that make the installed copy belong to its project?

The pre-`0.3.0` command could not. It had the on-disk file and the current registry file, while
`manteen.lock.json` retained only a hash of the originally installed bytes. That was enough to say
that each side moved and not enough to attribute either change. Ordinary component files
therefore fell through the same skip-or-replace surface as `add`.

This milestone replaces that behavior. There are no active consumer projects whose old receipts
need migrating, so the new receipt is one native version-3 contract: readers reject versions 1 and
2 rather than carrying a compatibility path that has no user to serve.

## Product rule

`manteen update` applies the registry's change onto user-owned source. It never silently resets a
local adaptation.

For one existing destination, let:

- **base** be the pristine registry bytes recorded by the last successful install/update;
- **local** be the bytes in the project now; and
- **incoming** be the bytes the registry serves now.

The default behavior is:

| Local versus base | Incoming versus base | Result |
| --- | --- | --- |
| unchanged | unchanged | no-op |
| changed | unchanged | keep local; no write |
| unchanged | changed | write incoming |
| changed | changed, clean merge | write the three-way merged result |
| changed | changed, conflicting merge | `update-conflict`; zero mutation |

Two boundary cases stay conservative in this milestone:

- A locally missing tracked file is an `update-conflict`; `--take-upstream` is the explicit way to
  restore it. Treating absence as permission to recreate would make an intentional deletion look
  like damage to repair.
- A file removed upstream is reported and retained, together with its receipt/base record. Update
  does not delete project source in this milestone. Automatic deletion needs its own contract for
  local edits and rename detection; it is not smuggled into three-way text merging.

A newly added upstream file is created when its destination is absent. If an unowned file already
occupies that destination, update refuses instead of treating a registry addition as permission to
replace it.

## Destructive reset is a separate operation

`--overwrite`, `--no-overwrite`, and `--yes` no longer belong to `update`; they remain `add`
options. A conflict-free update has no overwrite question: the command itself is the request to
apply the computed result, and `manteen diff` is the preview.

`manteen update --take-upstream` is the deliberately destructive alternative. For files the
current item still ships, it writes pristine incoming bytes and restores a locally missing file —
and, because it consults no ancestor, a locally missing or damaged base too. It does not infer
deletion for files the item stopped shipping.

`--yes` must never be the spelling of “discard my adaptations.” A non-interactive dry run needs no
extra overwrite flag.

## Durable base store and receipt v3

Pristine bases travel with the project under a Manteen-owned sidecar tree:

```text
.manteen/bases/<project-relative destination>.base
```

The suffix keeps mirrored `.ts`/`.tsx` sources outside compiler globs while leaving the content
plain and reviewable. `.manteen/` is reserved: a registry file may not target it. Each destination
has exactly one current base, so storage is proportional to installed files, not update count.

Every receipt file record distinguishes two hashes:

```text
installedSha256  hash of the result accepted at the last successful run
baseSha256       hash of the pristine upstream bytes in the sidecar
```

They are equal after a verbatim install and can differ after a clean merge. The distinction lets
the next run answer two separate questions: whether the project changed since the last run, and
which local changes must be carried from the last upstream base.

The sidecar write is part of the existing journal and lands after project files but before the
receipt. A failure restores project files, prior bases, and the receipt together. Apply preflight
re-hashes every base it plans to read or replace, so a concurrent edit or corrupt sidecar becomes a
zero-mutation stale-plan/refusal rather than an invented ancestor.

Theme and global styles do not use this store. The theme keeps its property-aware
`mergeThemeSource` fold; `manteen.css` remains a generated Manteen-owned artifact whose project
overrides belong in the later host stylesheet.

## Merge and conflict contract

The merge is exact, line-oriented, and three-way. Registry input, local input, and base input are
never formatted or normalized first; trailing newlines and line endings are bytes with meaning.
A clean textual merge is not claimed to prove semantic correctness, so output calls it
“conflict-free,” not “safe” or “correct.”

All merge computation happens in `plan()`. A conflict emits one non-forceable diagnostic per
destination, makes `plan.ok === false`, and carries enough bounded context for `diff`/JSON to name
the competing regions. No conflict markers are written into live source by default. As with every
other plan refusal, one conflict means no dependencies, project files, bases, theme, styles, or
receipt are mutated.

`--take-upstream` suppresses the merge-conflict diagnostic only because it changes the requested
operation: the user explicitly chose incoming bytes. It reads no ancestor, so a missing or corrupt
sidecar cannot refuse it, and the run rewrites the base from the bytes it installs. A path whose
pre-image cannot be read or safely replaced still refuses every operation that must land a base;
the journal cannot promise rollback there. `--force` still never clears a source conflict or a
missing/corrupt base.

## `diff` contract

For ordinary tracked source, `manteen diff` stops rendering only `local -> incoming`. It reports:

1. `base -> local` — the project's adaptations;
2. `base -> incoming` — the registry update; and
3. `local -> result` — what a conflict-free update would write.

JSON carries all three patches plus the proposed outcome (`unchanged`, `local-only`,
`upstream-only`, `merged`, `conflict`, `missing-local`, `removed-upstream`, `added-upstream`). Text
may summarize unchanged axes, but it must never call a two-way replacement patch a merge preview.

## Implemented surface

1. Receipt v3, sidecar path rules, plan types, and diagnostics are native; v1/v2 readers refuse.
2. `add` writes exact bases and the receipt through one pre-image journal.
3. The pure line-oriented planner handles local-only, upstream-only, clean two-sided merges and
   conflicts without emitting markers.
4. Update exposes `--take-upstream`, not overwrite/no-overwrite/yes, and conflict-free runs are
   non-interactive.
5. Diff text/JSON carries base-to-local, base-to-incoming and local-to-result patches plus the
   proposed outcome.
6. Source and built-Node acceptance cover clean merges, conflicts, missing/corrupt bases (both
   that they refuse a merging update and that `--take-upstream` repairs them), local-only no-ops,
   explicit reset, new-file occupancy, removed-upstream retention and non-interactive dry-run.
   Existing later-write rollback coverage exercises bases through the same whole-tree manifest
   boundary.

## Amendment — 2026-08-05, after review

The first implementation gated every base check on the presence of a valid ancestor regardless of
operation, so `update --take-upstream` refused a missing or corrupt sidecar even though it reads no
ancestor. That left `add --overwrite` as the only escape from a lost base, expressing the same
destructive reset indirectly through reinstall semantics, and it fired even when nothing had
changed upstream. `planUpdatedFile` now reads the ancestor only when it will merge against it, so
`--take-upstream` explicitly chooses upstream and overwrites a missing or corrupt sidecar.

The two base failures turned out to need separating, and the fix is only correct once they are:

- **Missing or corrupt** — the path is readable and holds the wrong bytes. An *input* problem. It
  blocks a merging update and nothing else; `--take-upstream` and `add` write over it.
- **Unusable output path** — a directory, permission failure, symlink loop or non-directory parent
  prevents the journal from reading a trustworthy pre-image and safely replacing it. Every
  operation that must land a base refuses, `--take-upstream` included. That refusal stays in
  `plan()`, where it is coded and reportable.

Probing that second case exposed a separate defect in the first implementation. `fromReceiptState`
hashed the base with the unguarded `hashFileBytes`, which by contract throws for anything that is
not ENOENT — and it runs *before* any gate. An unreadable sidecar therefore killed `list`, `info`,
`diff` and `update` alike with a bare `error <cmd>`, including the two commands that never consult
an ancestor. The inventory is a report, not a write phase, so it now answers `null` for both
absence and inaccessibility; every consumer already compares against `baseSha256` and treats a
mismatch as "no usable ancestor", and the coded refusal remains `plan()`'s.

`D30` was also marked superseded by `D32`, which it had contradicted since the version-3 receipt
landed.

Verification receipts as of the amendment, **2026-08-05**. These are a dated record of what Wu
proved on the day it closed, not a running total — later milestones add tests and diagnostics, so
a number here that no longer matches `bun run guard` is expected rather than stale:

- `bun run test`: 226 passed, 0 failed.
- `bun run typecheck`: 0 errors; Astro reported two pre-existing deprecation hints.
- `bun run lint`: clean across 280 files.
- `bun run guard`: all five guards clean; 50 diagnostics emitted/documented, 0 pending.
- built Node e2e: 111 passed, 0 failed, 1 opt-in packed-consumer smoke skipped.

## Evidence boundary

Unit fixtures can prove deterministic merge classification, exact planned bytes, refusal, and
rollback. Built-Node e2e can prove the shipped CLI and committed base/receipt surface. Neither
proves that a conflict-free text merge preserves application behavior; only the consumer's own
typecheck/tests/runtime can establish that, and Manteen does not claim otherwise.

## Public release acceptance — 2026-08-07

The exact implementation merged as commit
`123d3c1a1ef047994326cdcb3ffba7cc07e3dea9`, shipped under the signed `manteen-v0.3.0` tag, and
completed the trusted release workflow at
<https://github.com/arimxyer/manteen/actions/runs/31149087619>. The full publication/provenance and
fresh public-consumer receipts are in [`v0.3-release-handoff.md`](../releases/v0.3-release-handoff.md).

The canonical controlled receipt in the release handoff names registry ref `@proof/lifecycle` and
the exact item/source SHA-256 pairs for its old, new, conflict and failure revisions. Its command
sequence was `add`, clean `update --json`, refused `update --json`, explicit
`update --take-upstream --json`, and an applied update whose verifier exited `7`.

That sequence proved a local-only adaptation plus a non-overlapping upstream-only change, exact
source/base/receipt preservation and no verifier on conflict, explicit destructive recovery, and
coherent applied source/base/receipt state after verification failure. The two expected CLI
exit-1 results were the conflict refusal and the applied-but-unverified final update; the outer
assertion wrapper exited 0 after proving them. No conflict markers or verification certificate
were written.

This closes distribution and lifecycle execution for the line-oriented merge contract. That
controlled receipt did not itself deploy the source catalog. The separate post-release Pages
receipt subsequently deployed all 22 items from commit
`8853a720352c8842ce6957a494f919ec7cccda67` in accepted run
[`31198437310`](https://github.com/arimxyer/manteen/actions/runs/31198437310).

## AST investigation — 2026-08-06

A post-milestone investigation asked whether a TypeScript AST could reduce textual conflicts
without weakening the exact-byte ownership contract above. It did not implement or benchmark an
AST merger. It ran two bounded probes and classified the available registry history.

The printer probe rejected one specific output path. Parsing and returning untouched source text
was mostly exact only because no AST-produced replacement was emitted. Calling ts-morph's
`formatText()` on one 119-line TSX input changed 89 lines without changing program behavior; all
observed changes were whitespace. The tested printer path also did not preserve the exact CRLF/BOM
boundary. That is enough to reject an AST printer or formatter as the source of default merge
bytes: a merge that rewrites unrelated layout makes ownership and review worse even when it
compiles. It is not enough to reject an AST used read-only to classify edits or identify original
byte ranges.

The rename-versus-edit probe was synthetic. It showed that the current line merge can conflict on
that constructed shape and that a naive name-keyed structural merger can retain a rename while
losing an independent edit. It did not find such a rename in this repository. Any future
structural merger must treat an unmatched old declaration plus a modified counterpart as
delete-versus-modify unless it can prove the mapping; ambiguity refuses rather than choosing a
side.

The history classification was also narrower than a product corpus. After correcting the
merge-reachable population, it covered eight commits that modified existing registry source: 26
file events and 791 touched lines, dominated by one large Styles API sweep. Those are upstream
authoring changes only. The sample contains no independently authored consumer adaptations, no
naturally occurring three-way conflicts and no measured conflict rate. It therefore cannot support
a percentage claim about how often users will conflict or how many conflicts an AST approach would
remove.

D41 keeps the exact line-oriented merger for `0.3.0`, rejects AST-produced output bytes, and leaves
conservative AST-assisted classification open. Revisit it only against a corpus containing real or
controlled local adaptations and named old/new upstream revisions, with exact-output preservation,
conflict reduction and lost-edit refusal measured separately.

## Read-only classification follow-on — 2026-08-08

After public `manteen@0.4.0` acceptance, the bounded follow-on was run and committed as
[`ast-assisted-merge-spike.md`](../research/ast-assisted-merge-spike.md) plus its
[`machine report`](../research/ast-assisted-merge-spike.json). It uses two named real upstream pairs for one
historical registry TSX source and nine explicitly synthetic controlled local adaptations. The
production `mergeFile()` result is the baseline for every case.

The classifier emits no source. It parses read-only, records original-string line-token offsets,
keys imports by module specifier and uniquely named exported top-level declarations by kind plus
name, and labels only disjoint stable key sets as `independent-candidate`. Same-key, internal
rename/delete, parse, anonymous/default, duplicate-key and cross-file cases refuse.

Results: five baseline conflicts, two independent candidates, seven refusals, one reviewed
independent conflict recovered, zero false-independent results and zero false refusals. The
recovered case combines a real upstream change to the `@mantine/carousel` import with a controlled
local change to the adjacent `@mantine/core` import: diff3 conflicts on the neighboring lines,
while the keys are distinct.

This satisfies the spike's narrow positive stopping condition, but it does not supersede D41. One
source path and synthetic local sides prove neither a population conflict rate nor a safe merge
output algorithm. Production update/diff remain byte-exact and line-oriented; any integration
requires a separate contract and broader acceptance.

## Exact-splice integration decision — 2026-08-08

The separate [`AST integration decision`](../contracts/ast-merge-integration-decision.md) supplies that
contract and broader acceptance. It evaluates all 25 eligible
historical TS/TSX file events across 17 paths, 76 constructed disjoint boundary cases, 24 same-key
cases, dedicated ambiguity and exact-byte tests, symmetry, and preloaded runtime. Exact source
reconstruction produced zero unsafe authorizations and rescued five distinct constructed
adjacent-anchor conflict shapes; the real-history rescue remains one event on one path.

The positive narrow design is public in the client-only `0.5.0` release: line diff3 remains the
first path,
and exact whole-anchor source splicing runs automatically only for its remaining `.ts`/`.tsx`
conflicts. No AST printer emits bytes, every accepted side reconstructs exactly, ambiguity still
refuses, and a result remains "conflict-free" rather than semantically safe. `diff` and `update`
share that path, and source plus built-Node acceptance prove they reach the same result. The signed
tag, single trusted workflow, npm provenance and controlled exact-public-package accepted/refused
receipt are recorded in [`v0.5-release-handoff.md`](../releases/v0.5-release-handoff.md).
