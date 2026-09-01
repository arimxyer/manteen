# Repository context and documentation map

This is the entry point for engineering context. It identifies which documents describe current
contracts, which record current direction, and which are bounded evidence from completed work.
When two documents appear to disagree, use the authority order below rather than blending them.

## Current snapshot

Snapshot date: 2026-09-01. These claims are repository-derived unless a linked handoff records
separate public evidence.

| Area | Current state | Authority or evidence |
| --- | --- | --- |
| Packages | This tree and public npm `latest` are `manteen-kit@0.3.2` and `manteen@0.9.3`. | `packages/*/package.json`, [`roadmap.md`](roadmap.md), [`v0.9.3-release-handoff.md`](./releases/v0.9.3-release-handoff.md) |
| Current release | The public client release makes generic Vite init portable across Vite 7 and 8 and gives distinct unreadable-receipt states actionable offline recovery. | [`client-build-plan.md`](./contracts/client-build-plan.md), [`v0.9.3-release-handoff.md`](./releases/v0.9.3-release-handoff.md) |
| Public package proof | The current public `0.3.2` and `0.9.3` packages have signed tags, successful trusted release workflows, npm provenance, and fresh public-consumer receipts. | [`v0.9.3-release-handoff.md`](./releases/v0.9.3-release-handoff.md) |
| Registry | The source catalog contains 22 items. Generated `public/r/` is local build output and must be rebuilt before use; no repository workflow currently publishes it. | [`roadmap.md`](roadmap.md), `manteen.registry.json` |
| Documentation | `apps/manteen` is the sole Next.js/Fumadocs application. CI checks and builds it; no workflow deploys it. | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`apps/manteen/README.md`](../apps/manteen/README.md) |
| Retired site | The Astro/Starlight application and its Pages workflow were removed on 2026-08-31 without migrating their implementation or content. Earlier deployment receipts remain historical evidence only. | [`docs-site-handoff.md`](./handoffs/docs-site-handoff.md) |
| Open direction | The roadmap is the only backlog/status narrative. Historical handoffs do not become active work merely because they preserve a once-open question. | [`roadmap.md`](roadmap.md) |

No local build, screenshot, browser probe, or green CI run proves that the Fumadocs site or a local
registry artifact is public. Any future publication requires a fresh, separately reviewed
deployment design and explicit approval.

## Folder layout

| Path | Purpose |
| --- | --- |
| [`roadmap.md`](roadmap.md) | Current sequencing, completion summary, and open work. |
| [`build-process.md`](build-process.md) | Repository workflow, guards, and incident-derived working rules. |
| [`contracts/`](contracts/README.md) | Current product contracts and adopted decisions. |
| [`handoffs/`](handoffs/README.md) | Completed implementation milestone receipts. |
| [`releases/`](releases/README.md) | Public package and deployment receipts. |
| [`research/`](research/README.md) | Point-in-time experiments and audits. |

## Authority order

1. **Executable sources own exact current facts.** Package manifests own versions; schemas and
   types own data shapes; guards own mechanically checked invariants; workflows own CI and deploy
   behavior.
2. **Frozen decision records own product contracts and rationale.** Use the client and agent-native
   build plans for behavior that code comments cite by decision number.
3. **The roadmap owns current sequencing and open work.** It summarizes completed evidence without
   replacing it.
4. **Handoffs own bounded historical evidence.** Their dates, versions, commands, and proof limits
   describe the named milestone. Later work may supersede their current behavior without making the
   original receipt false.
5. **Audit and experiment reports are point-in-time observations.** They do not become product
   contracts unless a decision record explicitly adopts them.

If a current statement changes, update the owning source and this snapshot or the roadmap as
appropriate. Do not rewrite a completed handoff to make it resemble the present; add a short
supersession note and link the later authority.

## Live contracts and working rules

| Document | Use it for |
| --- | --- |
| [`client-build-plan.md`](./contracts/client-build-plan.md) | Guarded refusal table and cumulative D1-D49 client decisions. Later numbered decisions override earlier prose. |
| [`agent-native-build-plan.md`](./contracts/agent-native-build-plan.md) | Frozen machine JSON, generated-output ownership, expected-plan, verification, SDK, and packaged guidance contract. |
| [`mantine-component-alignment-plan.md`](./contracts/mantine-component-alignment-plan.md) | Frozen Mantine 9.5 author-evidence, compatibility, metadata, documentation, and execution contract. |
| [`w6-init-handoff.md`](./handoffs/w6-init-handoff.md) | Approved init ownership and framework-transform boundary. Its implementation evidence is historical; the contract remains relevant. |
| [`build-process.md`](build-process.md) | Repository workflow, guards, workspace safety, and incident-derived engineering rules. |
| [`roadmap.md`](roadmap.md) | Current completion summary, open work, sequencing, and release/deployment boundaries. |

## Completed implementation and release evidence

These documents are receipts, not competing roadmaps:

- [`w7-hardening-handoff.md`](./handoffs/w7-hardening-handoff.md) and
  [`w8-release-handoff.md`](./releases/w8-release-handoff.md) close portability and the first trusted release.
- [`global-styles-handoff.md`](./handoffs/global-styles-handoff.md),
  [`update-merge-handoff.md`](./handoffs/update-merge-handoff.md),
  [`update-verification-handoff.md`](./handoffs/update-verification-handoff.md),
  [`upstream-removal-handoff.md`](./handoffs/upstream-removal-handoff.md), and
  [`ast-merge-integration-decision.md`](./contracts/ast-merge-integration-decision.md) record later client
  maintenance contracts and proof.
- [`agent-native-release-handoff.md`](./releases/agent-native-release-handoff.md) and
  [`v0.2-release-handoff.md`](./releases/v0.2-release-handoff.md) through
  [`v0.5-release-handoff.md`](./releases/v0.5-release-handoff.md), plus
  [`v0.8-release-handoff.md`](./releases/v0.8-release-handoff.md),
  [`v0.9-release-handoff.md`](./releases/v0.9-release-handoff.md),
  [`v0.9.1-release-handoff.md`](./releases/v0.9.1-release-handoff.md),
  [`v0.9.2-release-handoff.md`](./releases/v0.9.2-release-handoff.md), and
  [`v0.9.3-release-handoff.md`](./releases/v0.9.3-release-handoff.md), record public release boundaries.
- [`wc-registry-content-handoff.md`](./handoffs/wc-registry-content-handoff.md) records the first eight-item
  content milestone; [`roadmap.md`](roadmap.md) owns the later 22-item summary.
- [`second-registry-handoff.md`](./handoffs/second-registry-handoff.md) records the independent-registry
  interoperability proof.

## Documentation-site evidence

- [`docs-site-handoff.md`](./handoffs/docs-site-handoff.md) records the retired Starlight site's
  architecture and its point-in-time public acceptance. It is not current implementation guidance.
- [`docs-audit-remediation-plan.md`](./research/docs-audit-remediation-plan.md) is a completed, local audit of
  that retired site, not a release receipt or design authority for Fumadocs.
- [`authoring-descriptor-motion-retrospective.md`](./research/authoring-descriptor-motion-retrospective.md)
  records local design-process evidence from the Fumadocs site's prototype work. It is a
  reusable method and bounded retrospective, not a production decision or deployment receipt.
- [`interop-motion-concept-brief.md`](./research/interop-motion-concept-brief.md) is concept
  research for the Fumadocs site's interoperability illustration. It grounds its product claims
  in the kit and client sources, scores eight explanatory models against a stated threshold, and
  records rejected metaphors. Its later selection note records Study F's local promotion to
  `InteropPublication`; `InteropStages` remains checked in as a comparison. Neither the brief nor
  the local integration is deployment evidence.
- `apps/manteen/README.md` describes the remaining application's current integration and commands.
  Future design work starts from a fresh Fumadocs product direction, not the deleted site's content
  or visual implementation.

## Superseded experiments

[`ast-assisted-merge-spike.md`](./research/ast-assisted-merge-spike.md) is the read-only experiment that
initially recommended no integration. The later
[`ast-merge-integration-decision.md`](./contracts/ast-merge-integration-decision.md) satisfied the additional
gates and is the current production decision. The spike remains useful only for its corpus,
method, and evidence limits.

## Keeping context coherent

- Put current package numbers in manifests and query them; do not copy them into agent files.
- Put active work and deferrals in the roadmap; do not use a completed handoff as a todo list.
- Label source, local synthetic, built-Node, hosted CI, public package, and deployed-site evidence
  separately.
- Keep root `AGENTS.md` as the repository-wide contract. Scoped `AGENTS.md` files may add durable
  local invariants; their same-directory `CLAUDE.md` files import them. Do not restate volatile
  repository facts in either layer.
- When a later milestone supersedes a result, link forward from the old document and preserve what
  the earlier result actually proved.
