# Manteen CLI scope

This file supplements the repository root `AGENTS.md` for `packages/cli`. The package is the
Node-ESM `manteen` client; it initializes consumer infrastructure, installs registry source, and
maintains that source without silently replacing local adaptations.

## Boundaries

- `src/cli/index.ts` owns argv, process streams, and exit codes. It is the binary shell.
- `src/index.ts` is the programmatic entrypoint. Importing it must not read argv, resolve cwd,
  write output, or perform any other work.
- Exported cores must expose the port factories needed to construct their arguments. The supported
  high-level façade is `createManteenClient()`; low-level exports remain available but are not a
  second stable façade.
- `src/plan/` reads and decides but never writes. `src/apply/` executes an accepted plan and adds no
  product decisions. `src/init/` and `src/removal/` have separate plan/apply contracts because
  their ownership models are not registry-item installation.

## Contracts that must stay aligned

- Diagnostics are data in `src/plan/diagnostics.ts`. Every new code needs a specification row, an
  emitter, a test, and a matching row in `docs/client-build-plan.md`; the diagnostics guard checks
  the mechanically provable parts.
- JSON mode writes exactly one command envelope to stdout and never prompts. Dependency-manager and
  verification output must not corrupt that channel.
- Expanded registry secrets never enter diagnostics, errors, receipts, plan digests, or command
  envelopes. Only redacted URLs are reportable.
- Mutating previews carry `planDigest`; apply with `--expect-plan` must bind the same normalized
  inputs to the reviewed plan.
- Verification is operation-specific for add, update, and remove. It runs while Manteen-managed
  preimages are still available, but no rollback claim extends to arbitrary verifier or package-
  manager side effects.
- `isInteractive` depends on a TTY, clack's CI detection, and `--yes`. Harnesses that require CI
  behavior set `CI=true`; `CI=1` does not select clack's CI branch.

## Verification

```bash
bun test packages/cli/test
bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs
```

The e2e tier runs built `dist/` under real Node. Use `e2e/helpers/child-env.mjs` for child-process
environments so inherited local variables cannot change exact stdout/stderr assertions.
