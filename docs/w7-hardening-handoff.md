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
   contains `^` survives through install. Windows remains best-effort until this evidence is green.
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
| Windows install | The real npm `.cmd` path preserves `package@^range` and writes both dependency and component. | Native Windows is a supported target until the job is actually green. |
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
