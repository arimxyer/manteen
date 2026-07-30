# Wave 7 hardening handoff

Wave 7 is a findings-first portability pass over the complete W4-W6 client. It does not add
commands or broaden framework support. Its job is to turn the portability claims in
[`roadmap.md`](roadmap.md) into executable evidence and to fix only defects those probes expose.

## Question and stopping condition

**Question:** can the package that will ship run its built-Node suite and one real consumer install
across the supported runtime, operating-system and package-manager boundaries?

Wave 7 stops when all of the following are true:

1. The complete built-Node e2e tier passes on Node 22.12, 24 and 26 on Linux.
2. The complete built-Node e2e tier passes on macOS at the minimum supported Node, or any excluded
   case has a named platform reason and a smaller positive replacement probe.
3. A real `windows-latest` job exercises the built `.cmd` shim and proves a dependency range that
   contains `^` survives through install. A green result closes the current evidence gap without
   changing the repository's best-effort Windows policy.
4. npm, pnpm, Yarn and Bun each run the packed client against the same `file:` registry fixture and
   perform a real dependency install in a disposable project.
5. Yarn PnP reaches the documented `undeterminable` Mantine-version warning under the packed CLI;
   it is not described as an npm-style `node_modules` install.
6. A supported Unix runner drives the real `clackOverwritePrompt` through a pty for keep, select and
   cancel. Readiness is output quiescence, not a fixed startup sleep.
7. The ordinary source tests, typecheck, lint, guards, build and full local built-Node tier remain
   green.

A hosted runner result is part of the receipt. A locally parsed workflow file or a Linux emulation
of Windows is not enough to close the Windows/macOS claims.

## Evidence and non-evidence

| Lane | Evidence produced | Does not prove |
| --- | --- | --- |
| Built-Node matrix | The shipped `dist/` executes under each named Node and OS runner. | That an npm tarball contains installable dependency metadata. |
| Packed-consumer matrix | A consumer installs tarballs, invokes the generated bin and lets manteen spawn the selected package manager. | Publication, provenance or registry availability. |
| Windows install | The real npm `.cmd` path preserves `package@^range` and writes both dependency and component. | An indefinite Windows support guarantee; the policy remains best-effort. |
| Yarn PnP | The packed CLI runs through Yarn's loader and emits the intentional PnP warning. | That arbitrary third-party PnP plugins are compatible. |
| Unix pty | Real clack keystrokes translate to keep/select/cancel outcomes. | Windows terminal rendering, where the test is skipped deliberately. |

Every disposable consumer and package-manager install is created with `mkdtemp()`. Nothing stages
or relinks this repository's `node_modules`.

## Frozen matrix

The CI topology is intentionally asymmetric:

- **Quality:** one Ubuntu/Bun job owns source tests, typecheck, lint and guards.
- **Runtime:** Ubuntu runs the complete built-Node tier on 22.12, 24 and 26. macOS and Windows run it
  at 22.12 so OS failures are not multiplied by runtime combinations.
- **Consumer package managers:** Ubuntu/Node 22.12 runs npm, pnpm, Yarn and Bun. Windows/Node 22.12
  adds the required npm `.cmd`/caret case.
- **Pty:** Linux and macOS run the pty case when a supported pty mechanism exists; Windows skips it
  with the platform reason in the test output.

Versions used only to provision a runner are pinned in the workflow. The consumer fixture's
`packageManager` field is also explicit, so `nypm` never learns a manager from an ancestor lockfile
or the runner's argv.

## Milestone order and ownership

1. **Contract freeze (solo):** this file and the roadmap status. No implementation lane may change
   the matrix or shared CI files.
2. **Disjoint implementation:** one lane owns the portable packed-consumer harness; one owns the
   pty test; platform/runtime lanes probe their assigned matrix and report findings. Only the
   integrator edits `.github/workflows/*`, package manifests, shared helpers and planning docs.
3. **Integration:** fix demonstrated defects, wire the final jobs, and run every locally available
   lane. Review starts only after integration is stable.
4. **Hosted receipt:** commit first. Pushing or opening a pull request is a separate external action;
   Wave 7 is not documented as complete until the hosted Windows/macOS checks have actually run.

## Findings ledger

### F1 — the client tarball is not installable by npm

Observed locally on 2026-07-29 with Node 26.4.0 and npm 12.0.1:

- `npm pack` succeeds for both packages.
- `package/package.json` inside `manteen-0.1.0.tgz` still declares
  `"manteen-kit": "workspace:*"`.
- Installing the kit and client tarballs together into a fresh `mkdtemp()` consumer refuses with
  npm `EUNSUPPORTEDPROTOCOL`, `Unsupported URL Type "workspace:"`.

This disproves the release workflow comment that the workspace protocol is rewritten during the
current npm pack step. The bounded remedy is a real semver dependency compatible with the kit-first
publish order, followed by an install of both local tarballs in the Wave 7 smoke. It does not
publish either package and is not evidence of npm provenance.

**Resolved in the first implementation milestone.** The client now declares `manteen-kit@^0.1.0`.
Bun continues to link the version-matching local workspace package, while the npm tarball contains
the real range. A fresh npm consumer installed the local kit and client tarballs together and ran
the packed `manteen --version` successfully. This is the package-shape half of the smoke; the
cross-manager add harness below owns the behavioral half.

### F2 — two Unix permission tests and one path assertion were not Windows-safe

The apply tier already skipped mode-bit denial tests on Windows and when running as root. The gates
tier had two equivalent tests without the guard: Windows ignores `chmod(0o555)`, the write succeeds,
and the fallback assertion compared an absent `process.getuid` to `0`. The same file also matched an
installed manifest using hard-coded `/` separators even though the diagnostic intentionally prints
the native absolute path it read.

**Resolved and hosted.** Both permission injections now carry the same explicit non-root Unix guard,
so a skip cannot be mistaken for rollback evidence, and the manifest-path assertion accepts both
native separators. The corrected full Windows built tier passed with its eight named platform skips
and no failures.

### F3 — the real overwrite widget had only a manual recipe

The downstream `OverwritePrompt` contract was exhaustive, but the clack multiselect translation
was outside both automated tiers. Waiting for a phrase is invalid because clack redraws one
character at a time; a fixed sleep was the only mechanism in the old hand-run recipe.

**Resolved and hosted.** `pty-prompt.node-e2e.mjs` uses a real util-linux/BSD `script(1)` pty and sends
input only after 250 ms of output quiescence. Bare Enter keeps the file, Space then Enter overwrites
it, and Ctrl-C reports the CLI's own exit 130 with whole-tree equality. It skips with a named reason
on Windows or without a supported pty. Linux passed 3/3. The hosted macOS image could not establish
the supported BSD `script(1)` invocation, so it produced the named skip required by the contract and
Linux remains the smaller positive replacement probe.

### F4 — the release workflow has a separate W8 trusted-publishing blocker

The Wave 7 audit checked the already-present release job without widening this phase into a
publication change. npm's current
[`trusted-publishers` documentation](https://docs.npmjs.com/trusted-publishers/) requires Node
22.14 or newer, npm 11.5.1 or newer, and an exact GitHub `repository.url` in the package manifest.
The workflow currently selects Node 22.12 without upgrading npm, and the client manifest lacks the
repository block that the kit already has.

**Deferred explicitly to W8.** Wave 7 does not publish, change release credentials or imply that
OIDC was exercised. W8 must update and pin the release runtime/npm pair, add the client repository
metadata, and then obtain the real trusted-publisher receipt after each package's manual first
publish boundary.

### F5 — `npm pack` failed during `prepare` on the Node 22.12 floor

The first exact CI rehearsal found a runtime-dependent build seam. tsdown 0.22's automatic config
loader uses native TypeScript loading on newer Node releases, but selects its optional `unrun`
loader on Node 22.12. That peer is absent, and its current release requires Node 22.13 anyway, so
adding it would have violated the client engine floor. Both packages therefore built and packed on
Node 24/26 while `npm pack` failed on the supported minimum.

**Resolved locally.** Both tsdown configs are plain ESM `.mjs` files and the build/prepare scripts
select the native loader explicitly. A real Node 22.12 `npm pack` now runs `prepare` and produces
both tarballs. The packed-consumer harness also accepts npm 10's lifecycle output before the JSON
pack report instead of assuming stdout contains only JSON. The exact Node 22.12 manager matrix then
passed npm 10.9.2, pnpm 10.30.1, Yarn 4.9.2 PnP and Bun 1.3.14.

### F6 — package preparation and the full built tier cannot share `dist/`

The first integrated rehearsal ran the opt-in packed-consumer test inside the ordinary full e2e
glob. Its real `npm pack` invokes `prepare`, which cleans and rebuilds the shared package `dist/`
while other test files are importing that same output. Eleven `MODULE_NOT_FOUND` failures followed;
they were a concurrent test-isolation defect, not evidence that the active Node runtime could not
load the package.

**Resolved locally.** The packed-consumer file skips unless `MANTEEN_E2E_PM` names a manager, and CI
runs it alone in the package-manager job. The ordinary built tier therefore sees one stable build,
while the isolated smoke deliberately retains the real prepare lifecycle that consumers and
publishers will execute.

### F7 — the first hosted run exposed native path and line-ending assumptions

The first hosted matrix ran on 2026-07-29 as
[GitHub Actions run 30500539995](https://github.com/arimxyer/manteen/actions/runs/30500539995).
All Linux runtime and package-manager lanes passed, while macOS and both Windows lanes found five
distinct portability defects:

- macOS reports its `/var` temporary directory through canonical `/private/var` from `getcwd(3)`;
  the JSON-envelope fixture now compares the same canonical project root the CLI sees.
- Node's Windows ESM loader requires an absolute path to be converted to a `file:` URL before a
  dynamic import. The dist-shape test now crosses that boundary explicitly.
- Init containment used a literal `/` suffix, classifying every native Windows child path as
  outside its own root. Init now reuses the client's relative-path containment helper.
- Receipt destinations are deliberately POSIX on every platform, so the packed Windows assertion
  no longer constructs its expected receipt path with native separators.
- ts-morph formatted a CRLF base theme as LF after an additive merge, making the preview and write
  look like a whole-file replacement. The kit now preserves the base file's CRLF style and has a
  direct regression test.

**Resolved and hosted.** The corrected commit passed all 11 jobs in the hosted retry described
below, including the full macOS and Windows built tiers and the native Windows packed npm consumer.

## Local integrated receipt — 2026-07-29

The integrated branch has the following local evidence:

- Source gates: `bun run test` passed 152 tests with 0 failures; `bun run typecheck`,
  `bun run lint`, and `bun run guard` passed, including all 41 diagnostic vectors.
- Built package: after one registry and CLI build, the complete e2e tier passed under exact Node
  22.12.0, 24.18.1 and 26.5.1. Each run discovered 94 tests: 93 passed, 0 failed, and the sole skip
  was the intentionally disabled packed-consumer smoke. All three Linux pty cases ran.
- Packed consumer: exact Node 22.12.0 passed npm 10.9.2, pnpm 10.30.1, Yarn 4.9.2 PnP and Bun
  1.3.14. Both package tarballs were produced through their real `prepare` scripts.
- Workflow shape: `actionlint` 1.7.7 reported no findings. It was run in Docker, which validates
  the workflow statically but is not macOS or Windows runtime evidence.

This local receipt alone did **not** close Wave 7. The hosted receipt below does.

## Hosted closure receipt — 2026-07-29

[GitHub Actions run 30501066891](https://github.com/arimxyer/manteen/actions/runs/30501066891)
completed successfully against remediation commit `af2f227c346e7d135529ff0d4e4bcb8891376a16`:

- All 11 jobs passed: quality; built Node on Ubuntu 22.12/24/26, macOS 22.12 and Windows 22.12;
  packed npm/pnpm/Yarn/Bun on Ubuntu; and packed npm on Windows.
- The macOS built tier discovered 94 tests: 90 passed, 0 failed and 4 skipped. One skip is the
  isolated packed-consumer test; the three pty skips name the unavailable supported BSD
  `script(1)` invocation, with Linux's 3/3 pty run supplying the positive replacement.
- The Windows built tier discovered 94 tests: 86 passed, 0 failed and 8 named platform skips. The
  isolated Windows packed npm job passed 1/1, proving the native `.cmd` invocation, exact caret
  range, dependency install, component write and receipt.

This satisfies every stopping condition above. Wave 7 is complete; publication, provenance and the
release workflow prerequisites remain explicitly W8 work.
