# manteen

## Unreleased

- Replace update's skip-or-overwrite behavior with exact three-way source merging backed by
  committed pristine bases. Local-only adaptations are preserved, upstream-only changes apply,
  clean two-sided changes merge, and overlapping changes refuse before mutation.
- Add receipt v3 with separate accepted-result and pristine-base hashes under `.manteen/bases/`.
  Legacy receipts are rejected because no released consumer relies on them.
- Replace update's overwrite/yes flags with the explicit destructive `--take-upstream` operation,
  and render base-to-local, base-to-incoming, and local-to-result patches in `manteen diff`.

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
