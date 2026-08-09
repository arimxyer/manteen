# Agent-native release handoff

Status: local release candidate complete; publication and deployment authorized on 2026-08-09,
but not yet performed.

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

## Explicit release gate

At this checkpoint, no signed tag, npm publish, GitHub release workflow, Pages deployment, or
hosted/public consumer verification had been performed. The existing public package and Pages
state was not used as evidence for this candidate.

If release is approved:

1. Re-run the release guard and the built/packed lanes from a clean candidate checkout.
2. Keep the machine milestone inside the fully verified `0.7.0` candidate; do not construct or
   publish a separate `0.6.0` package.
3. Sign and push `manteen-kit-v0.2.1`; verify the trusted OIDC run, npm integrity, provenance, and a
   fresh public kit consumer.
4. Sign and push `manteen-v0.7.0`; independently verify npm metadata/integrity/provenance and a
   fresh public consumer using the public kit.
5. Review and dispatch Pages separately, then verify the Agent Guide, `llms.txt`, `llms-full.txt`,
   unchanged 22-item registry contract, and sampled public bytes.
6. Run or wait for the hosted Node/package-manager/OS matrix before describing portability beyond
   the local Linux/npm evidence in this handoff.
