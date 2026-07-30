# manteen

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
