# manteen

## Unreleased

- Add `manteen remove --upstream-removed` as a separate, explicit lifecycle command for ordinary
  receipt-owned files their same current registry item no longer publishes. An unselected
  `--dry-run` discovers proven candidates; real removal requires repeated exact POSIX `--file`
  selections.
- Classify pruning candidates against their pristine `baseSha256` as unchanged, adapted, or
  already missing. Adapted source refuses unless the same exact selection also carries
  `--discard-adapted`; there is no broad `--all`, `--yes`, or `--force` deletion path.
- Remove selected project files, obsolete pristine bases, and their exact receipt records through
  one rollback journal with the receipt written last. Resolution is fail-closed across every
  receipt item and its current dependency closure, and never infers a rename, removes a package or
  item, or rewrites theme/managed-styles artifacts.
- Add deterministic text and JSON removal results, including candidate state, committed removals,
  projected and observed receipt state, diagnostics, and rollback failures without embedding file
  contents or expanded registry secrets. Built-Node acceptance covers literal POSIX selectors and
  raw CRLF byte classification on the hosted operating-system matrix.

## 0.3.0

- Bound each post-update verification check with a wall-clock ceiling, five minutes by default and
  configurable as `verification.timeoutMs`. The ceiling is per check rather than per run, so
  ordering never decides whether a suite fits, and a terminated check reports `timed-out` rather
  than `script-failed`.
- Raise `state-versioning-required` from `info` to `warn` when the project's own `.gitignore`
  carries a recognized rule hiding `.manteen/`, naming the `merge-base-unreadable` refusal it
  causes. The check is one-directional and gates nothing: no matching rule is not evidence the
  state is committed, so the advisory still prints either way.
- Terminate timed-out verifier process trees, including descendants that retain captured streams,
  through POSIX process groups or Windows `taskkill`.
- Preserve ordinary stdout/stderr streaming for Windows `.cmd` verification scripts while keeping
  explicit process-tree termination.
- Harden Windows merge-base preflight so a path below a non-directory parent is not mistaken for a
  creatable missing path, with exact CRLF base/update coverage.
- Replace update's skip-or-overwrite behavior with exact three-way source merging backed by
  committed pristine bases. Local-only adaptations are preserved, upstream-only changes apply,
  clean two-sided changes merge, and overlapping changes refuse before mutation.
- Add receipt v3 with separate accepted-result and pristine-base hashes under `.manteen/bases/`.
  Receipt v1 and v2 state is rejected rather than migrated; upgrading an existing project requires
  an explicit adoption or reset decision instead of an invented merge ancestor.
- Replace update's overwrite/yes flags with the explicit destructive `--take-upstream` operation,
  and render base-to-local, base-to-incoming, and local-to-result patches in `manteen diff`.
- `manteen update --take-upstream` no longer refuses when a pristine base is missing or corrupt.
  It reads no ancestor, so the explicit destructive reset repairs the sidecar too — previously
  recovery required expressing that reset indirectly as `add --overwrite`.
- `list` and `info` no longer fail when a base path is unreadable, and `diff`/`update`/`add` report
  it as `merge-base-unreadable` rather than dying with an uncoded error.
- Emit `state-versioning-required` only after a successful command changes the receipt or pristine
  bases, reminding the consumer to version both without pretending to inspect Git.
- Add opt-in post-update verification through ordered project-owned `package.json` scripts.
  Checks run fail-fast after the coherent update transaction, keep child output off JSON stdout,
  detect managed/control-byte drift, and report verification failure without claiming rollback.
- Add `--no-verify` for an explicit per-run skip while keeping malformed configuration invalid and
  `--dry-run` limited to validating and reporting the checks that would run.

## 0.2.0

- Initialize and maintain one explicitly configured, Manteen-owned package stylesheet without
  rewriting the consumer's host CSS or Tailwind/PostCSS ordering.
- Record managed stylesheet bytes and per-item contributions in receipt v2 while reading v1
  receipts compatibly and rewriting them only after a successful mutation.
- Include managed styles in dry-run, drift, `--force`, preflight, rollback, `diff` and `update`
  behavior.

## 0.1.1

First trusted release.

This release has the same CLI behavior as 0.1.0. It moves publication to the repository's GitHub
Actions OIDC workflow so npm can attach provenance without a stored registry token.

## 0.1.0

First release.

- Initialize Vite, Next App Router, Next Pages Router, hybrid Next and React Router projects while
  preserving their generated application structure.
- Install qualified registry items through a fail-closed Mantine version, alias, dependency,
  collision and ownership gate.
- Keep installed work observable through `list`, `info`, `diff` and `update`, backed by the
  committed `manteen.lock.json` receipt.
- Plan before applying, prompt once for the complete overwrite set, and roll back the file layer
  when a later write fails.
- Load authenticated HTTP registries without exposing expanded environment variables in output,
  diagnostics or receipts.
- Run as built Node ESM on Node 22.12 and newer, with packed npm, pnpm, Yarn PnP and Bun consumer
  coverage plus native macOS and best-effort Windows jobs.

`init` deliberately leaves an existing `@tailwindcss/postcss` configuration byte-identical and
reports the exact remaining Mantine block as required manual maintenance.
