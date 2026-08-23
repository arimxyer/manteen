# Update verification handoff

[Documentation map](../project-context.md) · [Implementation handoffs](README.md)

Status: complete in the source tree on 2026-08-06 and public in `manteen@0.3.0` on 2026-08-07.
Local, built-Node, hosted and fresh public-consumer acceptance are recorded below.

## The question

`manteen update` can prove that a proposed three-way text merge is conflict-free. It cannot prove
that the resulting component still typechecks, passes the consumer's tests, or builds in that
consumer's application. Those are project-specific claims, so the consumer has to name the checks
that establish them.

The tempting implementation is to run arbitrary project scripts while Manteen's write journal is
open and unwind when one fails. That would make a promise the journal cannot keep. A typecheck,
test, or build may write caches, snapshots, generated files, configuration, or anything else its
process can reach. The existing journal knows only Manteen's declared destinations and cannot
truthfully roll those other effects back.

This milestone therefore adds **post-update verification**, not a larger transaction. Manteen
first completes its existing coherent update through the receipt write. It then runs the
consumer-selected checks as a separate phase and reports whether the applied result passed them.

## Product rule

Verification is opt-in and project-owned. When `manteen.json` configures update checks, every
successful non-dry-run update runs them after apply succeeds, including an update whose planned
component, theme, style, base, and receipt bytes are all already current.

The boundary is deliberate:

- A plan refusal, merge conflict, cancellation, dependency-install failure, write failure, or
  rollback failure runs no verification script.
- `--dry-run` validates and reports the checks that would run, but executes none of them.
- `--no-verify` skips dynamic script planning, any refusal that dynamic planning would have
  produced, and execution.
- A verification failure exits 1 and leaves the completed update applied. It is never rendered as
  an apply rollback or as “nothing was written.”
- Verification runs outside `apply()` and outside its journal. Moving it into either one would
  weaken the meaning of both.

“Otherwise no-op update” above means a real installed selection whose update plan and successful
apply need no byte changes. A command with no installed candidates has no resulting update to
verify and keeps the existing `nothing-to-do` behavior.

## Configuration contract

`manteen.json` names ordered `package.json` script names:

```json
{
  "verification": {
    "update": ["typecheck", "test", "build"],
    "timeoutMs": 300000
  }
}
```

The `update` array is ordered, non-empty when present, and contains unique non-empty script names.
Order is authored behavior: Manteen does not sort it or infer a preferred typecheck/test/build
sequence. A project that needs arguments, workspace filters, environment setup, or several tools
behind one check can expose one wrapper script such as `manteen:verify`.

`timeoutMs` is the wall-clock ceiling for each check, not a shared run budget. It defaults to five
minutes (`300000`) and accepts integers of at least `1000`. A per-check ceiling keeps an earlier
script's duration from deciding whether a later script may finish, while ensuring a verifier that
never returns can still produce a bounded failure report.

The first contract accepts package-script names only. It does not accept shell command strings,
inline environment assignments, per-check working directories, or registry-auth-style `${VAR}`
expansion. That keeps shell parsing, quoting, and secrets out of `manteen.json` without pretending
the referenced package scripts themselves are safe or side-effect-free.

Planning resolves the configured names against the consumer's root `package.json`, records their
exact string definitions in authored order, and renders the commands using the package manager
already selected for the update. An absent, unreadable, non-object, or non-string script definition
is a verification-planning refusal before apply. `--force` does not turn an unknown command into a
known one.

`--no-verify` does not execute or dynamically resolve these scripts. It does not bypass schema
validation: a malformed `verification` object remains a configuration error with exit 2 because
the loader validates the whole document before command-specific flags are applied. A valid
configuration whose named script cannot be resolved produces `verification-script-unavailable`, a
non-forceable plan error with exit 1. If checks are configured but no package manager can be
selected, the existing `no-package-manager` exit-2 diagnostic still applies.

## Phase order

The existing update transaction remains intact:

```text
plan
  resolve registry graph and three-way result
  hash the exact root package.json bytes
  resolve configured verification scripts and exact definitions

apply
  0  exact-byte preflight
  1  decisions
  2  dependency installation, outside the journal
  3  component files            ┐
  4  theme                       │
  5  managed styles              ├─ one existing pre-image journal
  6  pristine bases              │
  7  receipt                     ┘

verification, outside apply and outside the journal
  8  re-read and compare the planned package-script definitions
  9  snapshot the Manteen-managed/control surface
  10 run the next configured project script under its per-check wall-clock ceiling
  11 re-hash the managed/control surface; stop on failure or drift
     repeat 10-11 in authored order
```

Apply's preflight still re-proves every existing destination/base/theme/styles/receipt pre-image
before mutation. Verification planning adds the whole-file SHA-256 of the exact root
`package.json` bytes, and preflight compares that hash before entering the mutation phases. A
change between plan and apply is therefore a stale plan even when it does not touch one of the
configured script definitions.

Dependency installation can legitimately edit unrelated parts of `package.json` and can run
lifecycle scripts, so the pre-apply whole-file hash is not expected to match after phase 2. After
dependency and apply phases finish, verification re-reads each planned script definition and
compares its exact string with the definition planned before mutation. If any planned definition
changed or disappeared, Manteen does not execute the replacement. The update remains applied,
verification fails with `definition-stale`, and the report says the planned command became stale.

No verification process starts before phase 7 succeeds. Receipt-last remains the final mutation of
Manteen's transaction; verification is a consumer process operating on the coherent result after
that transaction has closed.

## Failure and exit semantics

The update result and the verification result are separate facts:

```ts
type VerificationStatus = "not-configured" | "skipped" | "planned" | "passed" | "failed";
type VerificationCheckResult = "passed" | "failed" | "not-run";

type VerificationFailure =
  | { kind: "definition-stale"; script: string | null }
  | { kind: "spawn-failed"; script: string; message: string }
  | {
      kind: "script-failed";
      script: string;
      exitCode: number | null;
      signal: string | null;
    }
  | { kind: "timed-out"; script: string; timeoutMs: number; message: string }
  | { kind: "managed-byte-drift"; paths: string[] };
```

Checks run in authored order and fail fast. The first definition, spawn, timeout, non-zero/signal,
or managed-byte failure ends execution; every later check is retained in the public result as
`not-run`. A successful check is `passed`, and the check at which execution fails is `failed`.
The overall status is `failed` whenever `failure` is non-null. A process that outlives its ceiling
is terminated as a process tree and reports `timed-out`, never `script-failed`.

Status precedence is exact: no configured checks is `not-configured`; configured checks with
`--no-verify`, or with a preceding update that never reaches a successful real apply, are
`skipped`; configured checks on a dry run are `planned`; and configured checks after a successful
real apply end as `passed` or `failed`. No `skipped`, `planned`, or `not-configured` result is a
semantic pass.

| Apply state | Verification state | Exit | Project state |
| --- | --- | --- | --- |
| refused, cancelled, or failed | no verifier invocation | existing update exit | Existing apply contract; no new script ran |
| successful dry run with configured checks | `planned` | 0 | Nothing written and no script ran |
| successful real update, `--no-verify` | `skipped` | 0 | Coherent update applied; no semantic claim |
| successful real update, no configured checks | `not-configured` | 0 | Coherent update applied; no semantic claim |
| successful real update, all configured checks pass | passed | 0 | Coherent update applied; configured checks passed |
| successful real update, a definition becomes stale | failed | 1 | Coherent update applied; no changed command executed |
| successful real update, a check times out | failed | 1 | Coherent update applied; the verifier process tree is terminated |
| successful real update, a check fails to start or exits unsuccessfully | failed | 1 | Coherent update applied; no verification rollback attempted |
| successful real update, a check changes a managed/control path | failed | 1 | Update was coherent before the script; its later side effect is detected, not rolled back |

Terminal and JSON output must make “applied” and “verified” independently visible. In particular,
a verification failure must say that source, bases, and receipt were already applied and were not
rolled back. A script-caused managed-path drift must not claim the receipt still describes the
post-script tree.

The orchestration result belongs on `UpdateResult`, alongside its existing `plan` and
`ApplyOutcome`; it is not a field on `ApplyOutcome`. In text mode an unconfigured successful
update says nothing about verification. JSON always projects a verification object, with
`status: "not-configured"` and empty checks when no checks are configured, so consumers never
mistake a missing field for a semantic pass.

Both stdout and stderr from every child process are streamed to the CLI's stderr. This preserves
the CLI's stdout contract in ordinary and `--json` modes while keeping compiler and test
diagnostics visible. Manteen records no child-output transcript in `UpdateResult`, the receipt, or
the base store.

`--force` remains a plan-diagnostic policy and is not a “ignore failed tests” flag. There is no
flag in this milestone that converts a failed configured check into verified success.

## Managed-path drift and arbitrary side effects

Immediately before the first verification script, Manteen snapshots this exact
Manteen-managed/control set:

- `manteen.lock.json`;
- every ordinary installed destination recorded by the post-apply receipt;
- every pristine base referenced by that receipt;
- the current theme and managed-styles files recorded by the post-apply receipt when present;
- `manteen.json`; and
- the root `package.json`.

Each entry records both presence and exact bytes. After verification, Manteen re-hashes that same
set. A changed, created, or removed path makes verification fail with `managed-byte-drift` even
when the script returned zero. Package-manager lockfiles, host stylesheets, and arbitrary source
files that are not receipt-owned are deliberately outside this snapshot.

This check prevents a formatter or test script from silently rewriting installed source while the
CLI reports both a current receipt and a passed verification. It does **not** expand the rollback
journal and does not adopt the changed bytes into the receipt. The remedy is reported to the user;
Manteen does not guess whether the script's rewrite was desirable.

The scope is intentionally narrower than “everything the project process could touch.” Build
outputs, caches, coverage, snapshots outside the selected managed/control set, network calls,
external services, and files reached through arbitrary script logic are not snapshotted or rolled
back by this milestone. A configured script is user-authorized project code, not a sandbox.

## Evidence boundary

A passed result means only:

1. the named package-script definitions still matched the definitions planned before mutation;
2. each configured check covered by the chosen execution policy reported success against the
   applied live project; and
3. the selected Manteen-managed/control paths did not drift across verification.

It does not prove that unconfigured tests passed, that every application route works, that runtime
behavior is correct, or that a later machine/environment will reproduce the result.

Verification does not run a pre-update baseline. Therefore a passing result establishes current
health, while a failing result does not establish that the update introduced the failure. The
failure may have existed before the command. Regression attribution needs a separately designed
baseline or isolated-workspace model and is not implied here.

No verification certificate is written to `manteen.lock.json` or the base store. Those files are
durable ownership and ancestry state. Check results are time-, machine-, dependency-, and
environment-specific evidence and belong in the command result and CI log, not in the receipt.
Script output is likewise not persisted by Manteen as proof.

## Frozen acceptance contract

Source tests and built-Node e2e must cover at least:

1. The config schema accepts an ordered unique update-script list and rejects its invalid shapes.
2. Planning preserves authored order and exact script definitions.
3. A missing or unusable configured script refuses before apply and is not cleared by `--force`.
4. `--no-verify` invokes neither dynamic verification planning nor a verification process.
5. Dry-run validates and reports planned checks, invokes none, and writes nothing.
6. Merge conflict, cancellation, dependency failure, write failure, and rollback failure invoke no
   verification process.
7. A successful update runs configured checks, including when every update artifact is already
   current.
8. Passing checks produce exit 0 and a distinct passed-verification report.
9. The whole `package.json` pre-image is checked before apply. A changed package-script definition
   after dependency installation is never executed; the coherent update stays applied and the
   command exits 1 with `definition-stale`.
10. A check that fails to spawn, times out, or exits non-zero produces a distinct verification
    failure; timeout reports `timed-out` and terminates the process tree, while the coherent
    update, base, and receipt remain applied.
11. A check that returns zero but mutates a selected managed/control path is reported as drift and
    is not recorded as verified success.
12. An allowed build/cache artifact outside that selected set is not described as journalled or
    rolled back.
13. JSON preserves its single-document stdout contract while reporting apply and verification as
    separate facts; both child streams route to CLI stderr and cannot corrupt that document.
14. Neither successful nor failed verification adds a certificate or output transcript to the
    receipt.
15. The e2e tier invokes the built `dist/cli.mjs` under real Node. Source-tier stubs alone do not
    close this milestone.

Tests must assert the tree, not only the returned shape: on ordinary script failure, updated
source, the new pristine base, and the receipt stay present and mutually coherent. On conflict or
dry-run, no script marker or project mutation appears. On script-caused managed drift, the exact
changed path is observable and the output does not claim rollback.

## Resolved implementation choices

The implementation checkpoint closed every remaining fork:

1. Checks are fail-fast and bounded per check; later checks remain visible as `not-run`.
2. Public statuses are `not-configured`, `skipped`, `planned`, `passed`, and `failed`; public check
   results are `passed`, `failed`, and `not-run`; failures are `definition-stale`, `spawn-failed`,
   `script-failed`, `timed-out`, and `managed-byte-drift`.
3. Child stdout and stderr both stream to CLI stderr, and no transcript is persisted.
4. The snapshot is exactly the receipt, its ordinary destinations and bases, its recorded current
   theme and managed styles, `manteen.json`, and root `package.json`; package-manager lockfiles are
   outside it.
5. Malformed verification configuration remains an exit-2 schema error even with `--no-verify`.
6. Planning captures the whole `package.json` byte hash and exact script strings; preflight checks
   the former, and post-apply verification revalidates the latter after dependency lifecycle work.
7. Verification is update orchestration state on `UpdateResult`, never `ApplyOutcome` state.
8. Unconfigured text output is silent; JSON explicitly reports `status: "not-configured"`.
9. Every successful non-dry update with configured checks runs them, including an otherwise
   byte-identical no-op update. No-installed-candidate `nothing-to-do` still runs nothing.

## Expected implementation surface

The implementation is expected to touch the consumer schema/config types, plan contract and
preflight, a new verification runner behind an injected subprocess port, update orchestration,
text/JSON renderers, diagnostic guards, CLI help, README/roadmap decision records, focused source
tests, and a built-Node update-verification e2e tier.

The runner belongs beside update orchestration, not inside `src/apply/`. `apply()` must continue to
mean exactly the journalled update transaction documented today.

## Completion receipt

Closed locally on 2026-08-06 after integration:

- `bun run test`: 252 passed, 0 failed across 33 files, including 26 focused source tests for the
  verification schema, planning, package preflight, exact-definition revalidation, fail-fast
  execution and managed-byte drift.
- `bun run typecheck`: workspace links clean; TypeScript reported 0 errors; Astro reported 0
  errors and 2 existing deprecation hints.
- `bun run lint`: 285 files checked, no fixes or errors.
- `bun run guard`: workspace, dependency, runtime-API, diagnostic and release guards all clean;
  the diagnostic guard found 51 codes emitted and documented with 0 pending.
- `bun run build:registry && bun --cwd=packages/cli run build`: the 22-item registry and the Node
  22.12 CLI bundle built successfully.
- `node --test packages/cli/e2e/update-verification.node-e2e.mjs`: 12 passed, 0 failed under real
  Node against `dist/cli.mjs`.
- `git diff --check`: clean.

The receipt schema is unchanged. The built-Node cases also inspect successful and failed live
receipts and prove that neither verification status nor a child-output transcript is persisted in
them. The receipt remains ownership/ancestry state; verification remains command-result evidence.

Package-manager execution delegates to `tinyexec`'s established local-bin/Windows spawn path and
matches nypm's optional Corepack selection, with `tinyexec` declared directly rather than relied
on transitively. The local source tier proves that wiring, but this receipt does not claim a hosted
Windows execution of the new verification path; that belonged in the pre-release portability
matrix.

## Release hardening and public acceptance — 2026-08-07

The pre-release portability pass closed three boundaries after the local completion receipt:

- verifier timeouts terminate the package-manager process and its descendants, using a POSIX
  process group or Windows `taskkill`, so a descendant cannot keep captured streams open forever;
- Windows keeps ordinary `.cmd` stdout/stderr streaming while retaining explicit process-tree
  termination; and
- merge-base preflight distinguishes a creatable missing path from a non-directory parent on
  Windows, while exact CRLF base/update behavior remains covered.

The hardened implementation merged as
`123d3c1a1ef047994326cdcb3ffba7cc07e3dea9`. Main CI and the signed-tag release workflow completed
successfully at <https://github.com/arimxyer/manteen/actions/runs/31148992494> and
<https://github.com/arimxyer/manteen/actions/runs/31149087619>; the latter published
`manteen@0.3.0` with provenance.

A fresh public npm-plus-HTTPS consumer, run before the later 22-item Pages deployment, resolved
`manteen@0.3.0`, `manteen-kit@0.2.0` and the 14-item registry then live. It added
`@house/empty-state` and ran configured `typecheck` plus `build` checks at exit 0. Its v3
source/base hash was
`824cd4dab40597935615719f5392547d0ca2dde0437f6d871bca9134eaf6fcc4`, the pristine base was 979
bytes, and the receipt carried no `verification` field. The exact setup and command sequence are
recorded in [`v0.3-release-handoff.md`](../releases/v0.3-release-handoff.md).

The separately identified `@proof/lifecycle` revisions ran a verifier that exited `7`: the CLI
correctly exited 1 with `kind: "applied"` and `script-failed`, retained coherent updated
source/base/receipt state, wrote no verification certificate, and did not increment the prior pass
count. The outer assertion wrapper exited 0 only after proving that expected CLI failure. These
receipts close public distribution and both verification outcomes without claiming that
unconfigured checks or other environments passed. The subsequent 22-item Pages receipt in
[`v0.3-release-handoff.md`](../releases/v0.3-release-handoff.md) closes deployment without retroactively
widening this dated consumer proof.
