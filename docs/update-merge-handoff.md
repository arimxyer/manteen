# Update merge handoff

Status: complete on 2026-08-05; source and built-Node acceptance are green.

## The question

Can `manteen update` bring current registry changes into component source without silently
discarding the adaptations that make the installed copy belong to its project?

The existing command cannot. It has the on-disk file and the current registry file, while
`manteen.lock.json` retains only a hash of the originally installed bytes. That is enough to say
that each side moved and not enough to attribute either change. Ordinary component files therefore
fall through the same skip-or-replace surface as `add`.

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
current item still ships, it writes pristine incoming bytes and restores a locally missing file.
It does not infer deletion for files the item stopped shipping.

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
operation: the user explicitly chose incoming bytes. `--force` never clears a source conflict or a
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
6. Source and built-Node acceptance cover clean merges, conflicts, missing/corrupt bases,
   local-only no-ops, explicit reset, new-file occupancy, removed-upstream retention and
   non-interactive dry-run. Existing later-write rollback coverage exercises bases through the
   same whole-tree manifest boundary.

Verification receipts from the completion run:

- `bun run test`: 225 passed, 0 failed.
- `bun run typecheck`: 0 errors; Astro reported two pre-existing deprecation hints.
- `bun run lint`: clean across 280 files.
- `bun run guard`: all five guards clean; 50 diagnostics emitted/documented, 0 pending.
- built Node e2e: 109 passed, 0 failed, 1 opt-in packed-consumer smoke skipped.

## Evidence boundary

Unit fixtures can prove deterministic merge classification, exact planned bytes, refusal, and
rollback. Built-Node e2e can prove the shipped CLI and committed base/receipt surface. Neither
proves that a conflict-free text merge preserves application behavior; only the consumer's own
typecheck/tests/runtime can establish that, and Manteen does not claim otherwise.
