# Agent-native release handoff

Status: package release and public-consumer acceptance complete on 2026-08-09; Pages deployment
pending as the final separate gate.

## Candidate boundary

- Frozen contract: `1ac8657` (`docs: freeze agent-native command contracts`)
- Registry-kit implementation: `06c4db1` (`feat(registry-kit): make registry output transactionally owned`)
- Client, SDK, skill, and docs implementation: `7909cbf` (`feat(cli): make Manteen agent-native`)
- Package candidates: `manteen-kit@0.2.1` followed by `manteen@0.7.0`

The machine-interface work was originally planned as `0.6.0`, but it is an internal contract
milestone included in the `0.7.0` candidate rather than a separate package release. There is no
`manteen@0.6.0` commit, tarball, tag, or publication in this release sequence.

## What is implemented

`manteen-kit@0.2.1` owns generated output transactionally: deterministic ownership markers,
read-only checks and planning, strict adoption/refusal, explicit drift replacement, recovery, JSON
commands, published schemas, and a real `merge-theme --write --json` write.

`manteen@0.7.0` includes the complete `0.6.0` machine layer and `0.7.0` workflow layer:

- one exact ten-key JSON envelope for recognized commands, including usage/config/unexpected
  paths, noninteractive add, typed remediation, truthful exit and durable-mutation facts;
- complete `docs`, `props`, and `usage` metadata plus deterministic list filters;
- the supported `createManteenClient()` facade with root-bound opaque plan handles;
- offline `status`, source-free plan digests, and `--expect-plan` on init/add/update/remove;
- operation-specific add/update/remove verification before journal release, with captured managed
  and control preimages restored on failure;
- a packaged canonical skill, data-only manifest, safe guide/install commands, repository
  `AGENTS.md`, public Agent Guide, and generated `llms.txt` surfaces.

## Local verification receipts

All commands ran sequentially from the repository root unless stated otherwise.

| Boundary | Receipt |
|---|---|
| Source suite | `bun run test`: 360 pass, 0 fail, 1,389 expectations across 49 files |
| Type safety | `bun run typecheck`: TypeScript clean; Astro 0 errors and 2 pre-existing deprecation hints |
| Formatting | `bun run lint`: 332 files clean |
| Mechanical guards | `bun run guard`: workspace/dependencies/runtime APIs/diagnostics/release all clean; 58/58 diagnostic codes emitted and documented |
| Built artifacts | `bun run build:registry && bun --cwd=packages/cli run build`: 22 registry items and both packages built |
| Shipped CLI | `node --test --test-concurrency=1 packages/cli/e2e/*.node-e2e.mjs`: 138 pass, 0 fail, 1 opt-in packed-consumer skip |
| Packed consumer | `MANTEEN_E2E_PM=npm node --test packages/cli/e2e/packed-consumer.node-e2e.mjs`: 1 pass, 0 fail |
| Documentation | `bun run build:site`: 33 pages; registry index plus 22 items copied; emitted CSS check clean; both llms files present |
| Packaged skill | `quick_validate.py packages/cli/skill/manteen`: valid |
| Forward usability | Two context-free agent probes completed consumer-update and registry-authoring scenarios; their initial command ambiguities were fixed and their rechecks found no normal-path guidance blocker |

The built-Node tier proves the shipped bundle rather than Bun source execution. It covers exact
JSON envelopes, pre-init status, packaged guide/install, digest-coupled init/add/update/remove, full
metadata and SDK imports, and rollback-producing add/update/remove verification.

## Local tarballs

These are disposable local `npm pack` artifacts, not public-registry receipts:

| Package | Packed / unpacked | Entries | SHA-1 | Integrity |
|---|---:|---:|---|---|
| `manteen-kit-0.2.1.tgz` | 22,845 / 85,226 bytes | 13 | `55ece39c2203a9fc6935ef7855afe05be3b46d84` | `sha512-XhUJzTyjxmM8RV1z2HXKZ4ClC92FQvaaJ5fAdvzwTHm+D9BrDohWlDsdOjirxd56TdDgtLbH3byH9RPsfq/L0Q==` |
| `manteen-0.7.0.tgz` | 222,197 / 756,737 bytes | 18 | `cda4a1f450c0035406a3504bc33441ed4aaa4b2a` | `sha512-Rr/60jC3QnJVCe3sN92ANb9rTh/mfoBFg1Janpc01fCPVH7uw+2jx6UOpfXMlkAdbN193VwKsuisStvqgauctQ==` |

The client tarball contains the command-envelope schema and all five skill files: `SKILL.md`,
`agents/openai.yaml`, and the authoring, consumer, and JSON-contract references. The kit tarball
contains both new command/output schemas.

## Hosted integration and portability

PR [#22](https://github.com/arimxyer/manteen/pull/22) merged at
`70bfc61944dfae0ec9b6cc8dbaacc6f8d6fa2a4c`. Its final CI
[run 31337452928](https://github.com/arimxyer/manteen/actions/runs/31337452928) passed all 11 jobs:
the source/type/lint/guard gate; built Node 22.12, 24, and 26 on Linux; Node 22.12 on macOS and
Windows; packed npm, pnpm, Yarn PnP, and Bun consumers on Linux; and the native packed npm consumer
on Windows.

The matrix exposed a real Windows-only synchronous verification defect before merge: Node could
neither resolve `npm` as a batch shim nor execute `npm.cmd` directly. A temporary isolated Windows
workflow proved the final `cross-spawn` path in
[run 31337140090](https://github.com/arimxyer/manteen/actions/runs/31337140090): the exact
npm-backed removal/rollback regression passed first, followed by the complete Windows built-Node
tier. The temporary branch was deleted and the historical workflow returned to its prior
manually-disabled state after that receipt.

## Trusted package releases

Both signed tags point at the accepted merge commit and were published through the pinned,
credential-free OIDC workflow:

| Package | Signed tag / release workflow | Public npm receipt |
|---|---|---|
| `manteen-kit@0.2.1` | `manteen-kit-v0.2.1`; [31337787210](https://github.com/arimxyer/manteen/actions/runs/31337787210) | Published `2026-08-09T21:51:50.183Z`; SHA-1 `5d2c362285eec541239488191eb24ac65cf1ef71`; integrity `sha512-Md8D4oPWUXc4MHJLOzF/VcdpPWoLZHSYnBodr4obELeY1NUZ1psNrpbA5BjN+s+MDcLIkq4ysenZ9GjttkBiwQ==` |
| `manteen@0.7.0` | `manteen-v0.7.0`; [31338005306](https://github.com/arimxyer/manteen/actions/runs/31338005306) | Published `2026-08-09T21:57:20.266Z`; SHA-1 `37e7a6a00f1d1e27e9c1c3db859ede7a0c0ccd32`; integrity `sha512-0MDIyWxdRYwg2pPe27M1cWDxPuCSCxrk+TQNUpy1D379AwbTnLr2qXyv//Uwe4rQABkUrVCgxfu5+C4OrRU4aQ==` |

npm exposes two attestations for each version: its publish predicate and SLSA provenance v1. The
SLSA statements name the matching tag, `https://github.com/arimxyer/manteen`, and
`.github/workflows/release.yml`; their subjects match the public SHA-512 integrity bytes.

No `manteen@0.6.0` tag or package was created. The public client declares and freshly resolves
`manteen-kit@^0.2.1`.

## Fresh public-consumer acceptance

A fresh npm consumer installed only public `manteen-kit@0.2.1`. Under real Node it imported
`compileRegistry`, `planRegistryWrite`, and `writeRegistry`; resolved and parsed the published
command/output schemas; ran the shipped `manteen-kit` binary; and reported the exact public npm
tarball in `npm ls`.

A second fresh npm consumer installed only public `manteen@0.7.0`, which resolved public
`manteen-kit@0.2.1`. The shipped binary reported `0.7.0`; pre-init `status --json`,
`agent guide --json`, and `agent install --dry-run --json` each returned the exact ten-key envelope
with truthful zero exit and `mutated: false`. The package exported `createManteenClient`, resolved
and parsed the command-envelope schema, and exposed the canonical skill plus its manifest and
three references. The dry-run manifest named all five packaged skill files and their hashes.

These are public npm distribution/import/CLI receipts. They do not yet prove the new documentation
or generated registry over public HTTPS; Pages remains deliberately undispatched until this
receipt-only documentation change is reviewed and merged.

## Remaining Pages gate

Dispatch Pages from the accepted receipt commit, then verify the Agent Guide, `llms.txt`,
`llms-full.txt`, the unchanged 22-item registry contract, and sampled public registry bytes. Do not
describe that public HTTPS boundary as complete until the hosted deployment and direct HTTP probes
pass.
