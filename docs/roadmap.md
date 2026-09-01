# Road to a production tool

`contracts/client-build-plan.md` covers the client's phases. This covers everything else between here
and something a stranger can depend on, and how the remaining work is sequenced.

For the authority order, current repository snapshot, and distinction between active contracts and
historical receipts, start with [`project-context.md`](project-context.md).

## Definition of done

"Production" is not "the phases are finished." It is all six of these:

1. **Correct** — every refusal in the plan's table is emitted and tested; no gate fails open.
2. **Complete enough to be useful alone** — install, update, inspect. A tool that can only
   install is a demo, because the second week is when you need `diff`.
3. **Portable** — Windows and macOS, npm/pnpm/yarn/bun, Node 22/24/26. Untested equals broken.
4. **Installable** — published, versioned, with a changelog and provenance.
5. **Legible** — a README that gets a stranger from zero to an installed component, and
   errors that say what to do next.
6. **Maintainable** — a linter, dependency automation, and a license file that matches what
   `package.json` claims.

Today: all six criteria are public through `manteen-kit@0.3.0` and `manteen@0.9.0`, including the
agent-native authoring, machine-command, SDK, verification, and guidance surfaces. W6 `init` is
complete through its built-Node acceptance tier, W7 closed with a green hosted runtime, OS and
package-manager matrix, and W8 established provenance-bearing releases. The final accepted
Astro/Pages deployment was commit `a695c0052c2429adba79be540646b25b4ca19bc6`, run
[`31421895691`](https://github.com/arimxyer/manteen/actions/runs/31421895691); it serves the public
Agent Guide, both LLM context files, and the complete 22-item catalog with corrected consumer usage
metadata. The
catalog-content milestone itself remains commit `8853a720352c8842ce6957a494f919ec7cccda67`, run
[`31198437310`](https://github.com/arimxyer/manteen/actions/runs/31198437310). That deployment is
historical: the Astro application and Pages workflow were removed on 2026-08-31, and the repository
currently has no site or registry deployment path.

The public `manteen-kit@0.3.0` and `manteen@0.9.0` release moves the client and kit command envelopes directly to schema v2,
adds exact reviewed rerun actions and dependency-command previews, introduces receipt-aware
registry and script-discovered verification configuration commands, adds the foreground
`manteen-kit dev` last-good server, and replaces author-profile v1 with v2 ownership for Styles API,
props, and usage evidence. The repository's unit, typecheck/site-check, lint, guard, registry-build,
package-build, built-Node client/kit e2e, and Fumadocs production-build tiers pass locally. Signed
tags, hosted CI, npm provenance, and a fresh public consumer are accepted in the
[`0.9 release handoff`](./releases/v0.9-release-handoff.md). Public registry bytes and site
deployment remain unchanged; the repository has no workflow that publishes either artifact.

The next unreleased reliability increment is implemented locally: receipt-first offline installed
inventory, co-located scaffold targets, machine-explicit verification scope, digest-gated complete
scaffold registration, ephemeral dev-server replacement previews, and author-owned build/dev
verification hooks. A second clean-room dashboard run then made update failure outcomes truthful,
preserved dry-run identity through resolution refusals, aligned the Paper-backed Styles API scaffold
with Paper props, and added direct kit package-version output. The next evaluation closed five more
agent-operability gaps: dependency-safe machine stdout, source-free corrupt-receipt errors,
wrapper-safe dev shutdown events, fail-closed alias-like targets, and truthful no-op update outcomes.
These changes have no public-version,
hosted-CI, npm, tag, release, registry, or deployment receipt yet.

The agent-native release is public at `manteen-kit@0.2.1` and `manteen@0.7.0`. It adds
transactional generated registry ownership, one stable JSON command envelope, complete display
metadata, an opaque SDK facade, offline status, expected-plan digests, deterministic discovery
filters, transaction-bound verification for add/update/remove, and packaged agent guidance. The
signed OIDC releases, npm integrity/provenance, fresh public consumers, hosted portability matrix,
and Pages deployment are accepted. Its frozen contract is
[`agent-native-build-plan.md`](./contracts/agent-native-build-plan.md), and its receipts are in the
[`agent-native release handoff`](./releases/agent-native-release-handoff.md).

The public `manteen@0.8.0` release amends discovery so queried rows are explainably,
deterministically relevance-ranked within stable registry groups; it also makes init refusal
dry-run reporting truthful, accepts bounded named Vite `App` exports, and clarifies that offline
status health is not application build proof. A follow-up keeps dependency subprocess output out of
machine stdout and narrowly completes absent canonical registry/theme config without overwriting
authored values. Successful adds now also distinguish registry installation from application
integration without guessing an application placement. Its signed tag, hosted matrix, npm
provenance, isolated public agent acceptance, and separately deployed registry/docs correction are
recorded in the [`0.8 release handoff`](./releases/v0.8-release-handoff.md).

The client-only `manteen@0.3.0` release now carries Wu's receipt v3, committed pristine bases and
three-way updates; the apply-time state-versioning advisory; and Wv's opt-in post-update project
verification. Merge commit `123d3c1a1ef047994326cdcb3ffba7cc07e3dea9`, the signed
`manteen-v0.3.0` tag, green main/release workflows, npm publication with SLSA provenance, a fresh
public npm-plus-HTTPS consumer, and controlled two-revision update acceptance are recorded in the
[`0.3 release handoff`](./releases/v0.3-release-handoff.md). The tagged package release itself did not
dispatch Pages; the separately reviewed post-release registry/docs train subsequently did.

The client-only `manteen@0.4.0` release adds Wp's explicit upstream-file removal without changing
receipt v3, the wire format, registry content, the kit or Pages. Its merge, signed tag, single
trusted release run, npm integrity/provenance and fresh controlled public-consumer lifecycle are
recorded in the [`0.4 release handoff`](./releases/v0.4-release-handoff.md).

The client-only `manteen@0.5.0` release adds only D41's automatic conservative AST-assisted
fallback after remaining `.ts`/`.tsx` line-diff3 conflicts. Its signed tag, single trusted release
run, npm provenance, accepted/refused controlled public-consumer boundaries and separate Pages
acceptance are recorded in the
[`0.5 release handoff`](./releases/v0.5-release-handoff.md).

## Known gaps, by kind

**Client.** W4's apply surface, W5's command set, W6 `init`, and W7 portability hardening are
complete. The findings and hosted closure receipt are recorded in
[`w7-hardening-handoff.md`](./handoffs/w7-hardening-handoff.md).

**Commands.** `init`, `add`, `list`, `info`, `diff`, `update` and the narrow `remove` mode ship. The
public `0.9.0` also has reviewed `registry list/add/remove` and `verification show/set/clear`
configuration surfaces. In
public `0.3.0` and later, `update` uses Wu's receipt-v3 three-way model. In public `0.4.0` and later,
`remove --upstream-removed` adds explicit exact-selected upstream-file pruning; its contract and
acceptance are in [`upstream-removal-handoff.md`](./handoffs/upstream-removal-handoff.md). Public `0.5.0`
adds the conservative TypeScript fallback shared by `diff` and `update`, with its
exact-byte/refusal contract in [`ast-merge-integration-decision.md`](./contracts/ast-merge-integration-decision.md).
`search` does not
exist and is not currently assigned to a wave; whether it belongs in v1 remains undecided. The
historical public post-update verification contract is recorded in
[`update-verification-handoff.md`](./handoffs/update-verification-handoff.md). The current
agent-native transaction instead runs configured operation checks before releasing Manteen's
managed journal; a failure restores those bounded preimages and reports `rolled-back` without
claiming reversal of dependency-manager, cache, generated-artifact, or arbitrary script effects.
The current unreleased client also closes update's pre-result failure boundary: corrupt receipts
are failed operations rather than successful no-ops, thrown selection/planning/apply/verification
stages retain typed machine payloads and requested dry-run mode, and rollback recovery reports
relative paths without assuming a Git worktree. Returned verification rejections retain the
`verification-failed` cause after a successful restore; failed rollback reports conservative
durable mutation with unique relative recovery paths; and receipt I/O failures name the ownership
file with bounded recovery guidance without exposing the project root.

**Portability.** The built tier passes on Linux Node 22.12, 24 and 26 plus macOS and Windows at the
Node floor. Packed npm, pnpm, Yarn PnP and Bun consumers pass, including the native Windows
`.cmd`/caret path. The macOS image lacks a usable supported `script(1)` invocation, so its pty cases
skip with that named reason while Linux supplies the positive 3/3 pty probe. `jsconfig`-only
projects refuse, as `jsconfig-typescript-unsupported`, on any planned item that ships `.ts`/`.tsx` —
built to §6's letter after a review found the row unimplemented (`load.ts` died at the generic
"tsconfig.json does not exist" error, and its own hint — pointing `tsconfig` at `jsconfig.json` —
was a working bypass that let TypeScript write into a JS project at exit 0). The refusal now fires
in `plan()`, the bypass routes into the same refusal rather than around it, and both are covered by
unit tests.

**Distribution.** `manteen-kit@0.3.0` and `manteen@0.9.0` are public on npm as `latest`. Both lines
were published from tagged GitHub Actions OIDC workflows and expose npm publish plus SLSA
provenance attestations. The current client resolves the public `manteen-kit@^0.3.0`; the earlier
client-only `0.3.0`, `0.4.0` and `0.5.0` releases correctly kept
the prior kit range and created no kit tags. The
initial trusted-release receipts are in
the [`W8 release handoff`](./releases/w8-release-handoff.md), the public `0.2.0` package/Pages receipts are in
the [`0.2 release handoff`](./releases/v0.2-release-handoff.md), and the completed client-only `0.3.0`,
`0.4.0` and `0.5.0` boundaries are in the [`0.3 release handoff`](./releases/v0.3-release-handoff.md),
[`0.4 release handoff`](./releases/v0.4-release-handoff.md),
[`0.5 release handoff`](./releases/v0.5-release-handoff.md), and the
[`agent-native release handoff`](./releases/agent-native-release-handoff.md). The public client `0.8.0`
follow-on is recorded in the [`0.8 release handoff`](./releases/v0.8-release-handoff.md); the current
kit/client train is recorded in the [`0.9 release handoff`](./releases/v0.9-release-handoff.md).

**Project hygiene.** The MIT license, Biome, Dependabot, editorconfig and rename are done.
`SECURITY.md` and contributor ceremony remain deliberately deferred until the repository has
outside contributors.

**Documentation.** `apps/manteen` is the sole documentation application. CI checks and builds it,
but no workflow deploys the site or `public/r`. The Astro/Starlight application was deleted without
migrating its implementation or content. Future Fumadocs design starts fresh; any future deployment
must separately define and verify the site artifact, registry publication, base path, and manual
release boundary. Local or CI acceptance is not deployed-site evidence.

**Content.** The source catalog and separately deployed public Pages registry now both have 22
items. All 22 item endpoints and the index passed exact-byte public HTTP acceptance in Pages run
`31338680074`; the eight-item content tranche originally closed in run `31198437310`. The initial
six-item tranche and the Carousel/Dropzone extension stress cases
compile, install and production-build in disposable consumers; their exact evidence and
non-evidence are recorded in the
[`Wc handoff`](./handoffs/wc-registry-content-handoff.md). The
[`required-global-styles contract`](./handoffs/global-styles-handoff.md) is implemented, released and accepted
through a fresh public npm-plus-HTTPS Vite consumer. A
[`second hand-authored live registry`](./handoffs/second-registry-handoff.md) also passes discovery, install,
build and maintenance under two consumer-selected namespaces. Broader cross-framework visual
acceptance remains. Every new item exercises the client harder than a fixture does.

**Catalog detail and Styles API follow-on.** The parallel Fumadocs registry route, compiled reader,
navigation, detail UI, and island-only tests were removed on 2026-08-31. The ordinary Fumadocs MDX
registry overview remains. A fresh per-item design must participate in Fumadocs' normal content,
page-tree, navigation, and search model while preserving independently valuable truth boundaries,
such as not executing source or inventing documentation. Curated previews and additional prop
descriptors remain item-sized follow-ups rather than generic platform work.

Styles API support runs beside that work as a bounded contract milestone; it does not pause the
site and is not implied by an editable CSS module. Every current catalog declaration now has a
matching per-item test that closes the declared selector list against the implementation and checks
instance `classNames` / `styles`, stable selector classes, component CSS and theme-level extension.
The optional `manteen-kit` author profile now generalizes that ownership invariant without an
`@house` assumption. Its public v2 replaces v1 and independently binds current Styles API
item/component, props item/export, and usage item claims in both directions. Each evidence path is
globally unique and resolves to an ordinary repository-contained file. The profile remains
author-only and is absent from wire output and consumer installs. Generic validation does not
inspect or execute evidence; the house adapter adds the narrower requirement that its mapped files
lie on the root `bun test` discovery surface.
Components without a declaration may keep editable internal CSS, but later catalog additions still
need an explicit adopt-or-keep-internal decision rather than silence.

## The program

Each phase gets a workflow **designed for its shape**, not templated. The gate between phases
is a judgment call, which is exactly why they are separate runs.

| # | Workflow | Shape | Why that shape |
|---|---|---|---|
| W4 | Apply surface | narrow + deep: 2–3 agents on one seam, adversarial | Prompt/TTY/CI behaviour is where subtle bugs live. `CI=1` already nearly shipped a hang. Parallelism buys nothing; probing buys everything. |
| W5 | Command set — `list`, `info`, `diff`, `update` | wide: 4 parallel, shared receipt reader frozen first | Four genuinely independent commands over one contract. The classic freeze-then-fan-out. |
| W6 | [`init`](./handoffs/w6-init-handoff.md) | complete: probe → checkpoint → contract → per-framework adapters → integration → built-Node review → disposable dogfood | The adapters preserve generated work; the shared plan/apply boundary makes dry-run, cancellation, install failure and rollback observable; required Tailwind/manual work is separate from mutations; fresh config is list-ready. |
| W7 | [`Hardening`](./handoffs/w7-hardening-handoff.md) | complete: matrix-driven, findings-first, hosted retry | Real Windows and macOS CI exposed path and line-ending defects that local Linux could not. |
| W8 | [`Release`](./releases/w8-release-handoff.md) | complete: both `0.1.1` packages published through tagged OIDC with provenance | Publish ordering, provenance, changelog, docs. Little to parallelise and high blast radius. |
| Wc | [`Registry content`](./handoffs/wc-registry-content-handoff.md) | first eight-item tranche complete; later catalog growth summarized above | Independent of all of the above; doubles as client stress-testing without turning fixtures into product evidence. |
| Wm | [`Mantine custom-component alignment`](./contracts/mantine-component-alignment-plan.md) | toolchain work complete on `main`; the rejected candidate item-detail architecture survives only in historical evidence after its code removal | Makes author assertions mechanically accountable and aligns Manteen metadata and tooling with Mantine 9.5 custom-component capabilities without requiring `factory`. |
| Wt | [`Theme builder`](#wt--theme-builder-proposed) | proposed: one page, plan-first | Preview-then-install for the one registry item every consumer is expected to edit. Depends on nothing; blocked by nothing. |
| Wu | [`Update merging`](./handoffs/update-merge-handoff.md) | complete and public in `0.3.0`: receipt v3, exact bases, three-way plan, explicit reset, three-axis diff, built-Node and controlled-revision acceptance | Changes ordinary source maintenance from skip-or-replace to reproducible three-way merging without weakening the existing plan/apply transaction. |
| Wv | [`Update verification`](./handoffs/update-verification-handoff.md) | complete and public in `0.3.0`: post-apply orchestration, fail-fast bounded project scripts, drift detection, built-Node and fresh-consumer acceptance | Lets a consumer define what “the merged component still works here” means without placing arbitrary scripts inside Manteen's rollback journal. |
| Wp | [`Upstream removal`](./handoffs/upstream-removal-handoff.md) | complete and public in client `0.4.0`: explicit selection, adapted-file opt-in, one journal, built/hosted/public acceptance | Adds explicit, exact-selected pruning for ordinary files proven absent upstream without turning update into implicit deletion or inferring renames. |
| Wa | [`AST-assisted fallback`](./contracts/ast-merge-integration-decision.md) | complete and public in client `0.5.0`: exact source splicing, built/hosted/public accepted-and-refused acceptance | Reduces a narrow class of adjacent TypeScript line conflicts without allowing an AST printer or ambiguous structural mapping to emit bytes. |
| Wn | [`Agent-native interface`](./contracts/agent-native-build-plan.md) | complete and public: kit `0.3.0`, client `0.9.0`, hosted portability and npm consumers accepted; prior Pages evidence remains historical | Makes discovery, planning, refusal, mutation, verification, and guidance safe to drive without an interactive human loop. |

**Not workflow-shaped, do directly:** the hygiene set (LICENSE, linter, SECURITY, CONTRIBUTING,
dependabot, README rename). Single-file, single-concern, no discovery — a workflow would be
pure overhead.

## Wm — Mantine custom-component alignment (complete)

The implementation contract is frozen in
[`mantine-component-alignment-plan.md`](./contracts/mantine-component-alignment-plan.md); the
original [research proposal](./research/mantine-custom-component-improvement-plan.md) preserves the
audit and detailed alternatives.

The completed train binds every house `stylesApi` declaration to explicit, unique evidence in both
directions, generalizes that invariant through the kit's optional author-only profile, and validates
Mantine range coherence before output planning. The house catalog uses the exact `>=9.5.0 <10`
band; full-house disposable production builds passed at both 9.5.0 and 9.5.2. The independent
author-truthfulness checkpoint also passed: a hand-authored temporary `@workshop` catalog built
under real Node 20.11 with a plain evidence file and its own `>=8 <11` gate; its generated tree
digest remained `06603a1038200f57dafed06867d035e2563c85defaf237e73a5a070bd54cebb8`
across an invalid-range refusal. That temporary local proof was removed and is neither hosted nor
public evidence.

The later milestones added a syntax-only theme summary, retired the superseded prototype routes,
built the first compiled-registry item-detail experiment (removed on 2026-08-31), and added
source-only author scaffolds with exact JSON dry-run/apply plans, stale-plan protection, guarded
filesystem transactions, and pinned Node 20.11 plus Mantine 9.5.0/9.5.2 consumer proof. Hosted CI
closed through [PR #32](https://github.com/arimxyer/manteen/pull/32) run
[`32671203617`](https://github.com/arimxyer/manteen/actions/runs/32671203617),
[PR #33](https://github.com/arimxyer/manteen/pull/33) run
[`32672920515`](https://github.com/arimxyer/manteen/actions/runs/32672920515),
[PR #34](https://github.com/arimxyer/manteen/pull/34) run
[`32676695010`](https://github.com/arimxyer/manteen/actions/runs/32676695010),
[PR #35](https://github.com/arimxyer/manteen/pull/35) run
[`32884150486`](https://github.com/arimxyer/manteen/actions/runs/32884150486),
[PR #36](https://github.com/arimxyer/manteen/pull/36) run
[`32887672760`](https://github.com/arimxyer/manteen/actions/runs/32887672760),
[PR #37](https://github.com/arimxyer/manteen/pull/37) run
[`32895657010`](https://github.com/arimxyer/manteen/actions/runs/32895657010), and
[PR #38](https://github.com/arimxyer/manteen/pull/38) run
[`32899596122`](https://github.com/arimxyer/manteen/actions/runs/32899596122).

Broader `componentApi` metadata remains deliberately deferred until a concrete CLI,
documentation, scaffold, or machine consumer justifies its fields. Curated live previews follow the
same demand-driven rule, one item at a time. Wt remains a separate proposed product track. No Wm
receipt publishes packages, creates a tag or release, or deploys documentation or registry output.

## Wt — theme builder (proposed)

Not started. Recorded 2026-08-04 so the idea stops living in a conversation.

`registry/lib/theme.ts` is already the opinions layer and already installable (`manteen add
theme`). What is missing is any way to *see* a theme before installing it, or to produce a
modified one without hand-editing a file you have never previewed. The shape: one docs route
that lifts `createTheme` input into user-controlled state, renders the real catalog underneath
it, and emits the `theme.ts` you would install.

The retired Astro playground adapters no longer exist and must not be ported into Fumadocs. This
proposal needs a fresh product and implementation review before it can be scheduled; its earlier
"cheap assembly" assumption is no longer current.

Scope notes, so the plan does not have to rediscover them:

- Controls map onto what `theme.ts` actually declares — `primaryColor`, `defaultRadius`,
  `fontFamily`, `headings.fontWeight`, and the Button/Card/Paper/Modal `defaultProps`. It
  declares no `colors` key today.
- An arbitrary brand colour needs a generated ten-shade tuple. `@mantine/colors-generator`
  ships a version matched to the pinned Mantine line; adding it re-resolves the workspace, so
  it is one deliberate install, never a casual one.
- The output is a **file**, not a variable block. Mantine themes through `createTheme`, so
  shadcn's "paste these CSS variables into globals.css" has no equivalent here — the install
  path already exists and the page should feed it.

**Explicitly out of scope: choosing a base component library.** shadcn's CLI asks that question
because it sits on top of Radix or Base UI. manteen does not ask it and should not — Mantine is
the base, and the strength of that base is the reason this project exists.

Open before it starts: whether the `theme` card on the catalog index becomes this page's entry
point. If it does, polishing that mini is wasted work — which is why the interim fix is only to
stop it lying (it currently draws Surface/Success/Text swatches for tokens `theme.ts` does not
define).

## Sequencing and dependencies

```
Phase 3 ✔ ─> W4 apply surface ✔ ─┬─> W5 command set ✔ ──┐
                                 └─> W6 init ✔ ─────────┴─> W7 hardening ✔ ─> W8 release ✔
Wc registry content ......... any time, independent
Wm component alignment ...... complete on main; no publish, release, or deployment implied
Wt theme builder ............ any time, independent, not started
Wu update merging ........... complete; public in client 0.3.0
Wv update verification ...... complete; public in client 0.3.0
Wp upstream removal ......... complete; public in client 0.4.0
Wa AST-assisted fallback .... complete; public in client 0.5.0
Wn agent-native interface ... complete; public in kit 0.3.0 and client 0.9.0; prior Pages proof is historical
hygiene ..................... done, direct
```

**Done so far.** W4 closed the write seam (overwrite decision, dry-run, cancel,
failure reporting). W5 added `list`, `info`, `diff` and `update` over one frozen
inventory contract, with `update` routed through the existing `plan()`/`apply()` rather than
writing files itself. W6 added finite framework detection, four AST adapters, bounded shared
config transforms, an init-specific plan/apply contract, text/JSON CLI output and built-Node
fixtures for Vite, both Next routers, their hybrid and React Router. A disposable full-app run then
closed the generated-config-to-`list` seam and added exact legacy migration. W7 then closed the
runtime, OS, package-manager, real-prompt and packed-tarball boundaries through its hosted matrix.
W8 completed the manual bootstrap, trusted-publisher binding, ordered tagged releases and
independent npm provenance verification.

W4 through W8 are complete. Wc's first eight adapted items are publicly dogfooded, including the
released import-only global-styles lifecycle and its Carousel/Dropzone stress cases. The second
hand-authored live registry closes the client-agnostic boundary for the declared interchange
subset. The [documentation-site milestone](./handoffs/docs-site-handoff.md) adds a searchable Starlight
surface and executable third-party authoring/sharing guide while preserving the `/r` contract; its
implementation, local acceptance, hosted CI, public deployment, browser acceptance, and sampled
registry-byte receipt are complete. Wc remains an independent, ongoing content stream rather than
a release blocker; its next boundaries are further small curated tranches and broader
framework-specific visual acceptance.

Wu is complete and public in `0.3.0`. It replaced ordinary update's inherited skip-or-replace
behavior with an explicit add/update operation, exact committed bases, conflict-free three-way
planning, `--take-upstream` as the named destructive reset, and a three-axis `diff`. Its local,
built-Node, hosted and controlled-revision receipts are in the
[`update merge handoff`](./handoffs/update-merge-handoff.md).

Wv is complete and public in `0.3.0`. Verification stays outside `apply()` and the journal,
resolves ordered project script names during planning, runs them fail-fast with a per-check timeout
only after a successful non-dry update, and detects changes to the exact
Manteen-managed/control snapshot. A verification failure leaves the coherent update applied and
exits 1; it is evidence about the consumer's configured checks, not a rollback or a universal
runtime guarantee. Its handoff records local, built-Node, hosted and public-consumer acceptance.

Wn deliberately supersedes that transaction boundary in the local `0.7.0` candidate: configured
checks are now operation-specific for add, update, and remove and run before the owning journal is
released. A failure restores captured Manteen-managed and control preimages while making no claim
about dependency-manager or arbitrary verifier side effects. The paragraph above remains the
truthful historical contract for the public `0.3.0` through `0.5.0` client line.

Wp is complete and public in client `0.4.0`, with local source, built-Node, hosted matrix and fresh
public-consumer acceptance. It introduces only
`manteen remove --upstream-removed`: discovery through an unselected dry run, exact repeated file
selection for a real transaction, a second opt-in before discarding adapted bytes, and one journal
for source/base/receipt removal. D42 rejects `update --prune`, bulk confirmation flags, rename/AST
inference, theme/styles/dependency cleanup and implicit item uninstall. Its exact refusals,
transaction and evidence boundary are in the
[`upstream removal handoff`](./handoffs/upstream-removal-handoff.md).

The post-release read-only AST classification spike is complete in
[`ast-assisted-merge-spike.md`](./research/ast-assisted-merge-spike.md). It demonstrates one narrow
structurally independent case that line diff3 reports as a conflict, with zero false-independent
results in its nine-case controlled corpus. It does not change D41 or production merging; the
corpus has one real source path and synthetic local adaptations, so it supports neither an AST
output algorithm nor a population conflict-rate claim.

The broader [`AST integration decision`](./contracts/ast-merge-integration-decision.md) is also complete.
Exact whole-anchor source splicing passed its history, adversarial, symmetry, byte-preservation and
runtime gates, and rescued five constructed adjacent-anchor conflict shapes without an AST printer.
It is public in the client-only `0.5.0` release, only as an automatic
`.ts`/`.tsx` fallback after line diff3 conflicts. `diff` and `update` share the same merge path;
clean diff3 results return before
parsing, conservative refusal preserves the original conflict, and exact source slices remain the
only emitted bytes. Source, plan/diff and packaged-Node acceptance are recorded in the decision.

## On one large program workflow

`workflow()` can invoke other workflows inline, one level deep, so a program workflow *can*
chain W5 → W6 → W7 with acceptance gates between them and fail-stop at the first red.

Worth doing for **W5, W7, W8** — mechanical, well-specified, and their gates are objective
(does it publish, do the tests pass on Windows).

Worth *not* doing for **W4 and W6**. Their gates are judgment: "is this prompt flow right",
"is init good enough to hand someone." A script cannot evaluate those, and a five-hour
unattended run that goes wrong in its first hour wastes four. The probe→read→adjust loop that
made Phase 3 work depends on a human reading the probe.

## Decisions taken — 2026-07-28

- **Version policy: `0.x` until `init` lands.** Breaking changes stay cheap while the config
  shape and the `meta.mantine` surface are still moving. `1.0` is the signal that `manteen.json`
  and the receipt format are stable. `init` has now landed; W8 owns the explicit first-release
  version decision rather than this completed milestone changing package versions implicitly.
- **Publish the kit ahead of the client.** It is finished, independently useful, and verified
  as a consumer install. The client now declares the publishable `manteen-kit@^0.1.0` range, so the
  kit must exist before that client version can be installed from npm.
- **Windows is best-effort.** Not a target; say so in the README rather than implying support.
  *Caveat worth keeping visible:* being a Node tool does not make it portable by itself —
  path separators, `.cmd` shims, and argument quoting around a `^` range all differ, and the
  code already carries Windows-aware handling in places. W7's `windows-latest` built and packed
  jobs now pass, including the native `.cmd`/caret path. That is current positive evidence, while
  the best-effort policy keeps future platform drift from becoming an unsupported promise.
- **`update` re-merges directly.** The original decision applied truthfully to the structured
  theme fold but left ordinary component source on add's skip-or-replace surface. Wu supersedes
  that half: ordinary tracked files use a durable pristine base and fail-closed three-way merge;
  the theme keeps `mergeThemeSource`, and `manteen.css` remains generated. See
  [`update-merge-handoff.md`](./handoffs/update-merge-handoff.md).

## Releasing

`.github/workflows/release.yml` is designed to publish on a per-package tag using npm **trusted
publishing over OIDC** — no stored token. W7's audit found that the checked-in Node/npm pair was
below npm's trusted-publishing minimum and that the client lacked exact repository metadata. W8's
[`release handoff`](./releases/w8-release-handoff.md) freezes the repair at Node 24.18.1, npm 11.18.0 and Bun
1.3.14, plus a mechanical pre-publish guard.

**The first release of each package could not use it.** npm requires a package to have been
published before a trusted publisher can be configured, so an unpublished package had no
trusted-publisher path yet.

The maintainer therefore performed this private bootstrap once per package:

1. `npm login` (in a terminal, not through an agent session — nothing about it belongs in a
   transcript).
2. Publish `0.1.0` with `--provenance=false`; the package manifest requests provenance, but a local
   bootstrap has no OIDC attestation and must not imply one.
3. On npmjs.com, or with npm 11.15+, add the trusted publisher: `arimxyer` / `manteen` /
   `release.yml`, allowing `npm publish`.

After that, `0.1.1` became the first trusted release, tagged one package at a time. The kit
published and resolved before the client tag was pushed. The exact hosted and npm receipts are in
[`w8-release-handoff.md`](./releases/w8-release-handoff.md).

Future releases keep the same dependency-first rule without inventing a package release. When kit
and client both change, publish and verify `manteen-kit` before tagging `manteen`. A client-only
release first verifies that its declared public kit range resolves, then tags only `manteen`.
Pages remains a separate accepted deployment boundary. The tagged `0.3.0` client release did not
dispatch it; the post-release PR #11/PR #12 registry/docs train dispatched only after its own
review and receipts. Pages does not deploy on every `main` push because doing so could expose
items that require an unpublished client contract. The
[`0.2 release handoff`](./releases/v0.2-release-handoff.md) records the first completed two-package use of
that sequence, and the [`0.3 release handoff`](./releases/v0.3-release-handoff.md) records the completed
client-only receipt-v3 release. The [`0.4 release handoff`](./releases/v0.4-release-handoff.md) records the
completed client-only upstream-removal release.

The tradeoff: that first version has no provenance attestation, because provenance requires
the OIDC path. Storing an `NPM_TOKEN` just for it would reintroduce the long-lived credential
the whole setup exists to avoid, for the sake of one version.

## Carried into W7 — closed

**Test the real `clackOverwritePrompt` through a pty.** The header of
`packages/cli/e2e/apply-surface.node-e2e.mjs` states that neither tier runs it — the ~15 lines
translating a multiselect into an `OverwriteAnswer`. Everything downstream of the port's answer
is covered; the widget itself is verified only by a hand-run recipe recorded in that header.

Its stated rationale is half wrong and the file now says so. "`script(1)` is not on Windows or
macOS by default" does not justify omitting a test — the same file already carries
`{ skip: !CAN_DENY_WRITES }` two hundred lines further down. A platform guard is the answer, not
omission.

The other half is real, and the mechanism is worth writing down because it is not guessable:

> **clack renders one character at a time, redrawing the whole line between each.** So
> `"would be replaced"` never exists as a contiguous string in the pty output — every character
> is separated by a carriage return and a redraw. Waiting for the prompt's text to appear
> therefore cannot work, and a fixed `sleep` is the only reason the hand-run recipe uses one.

Readiness has to be detected some other way. Two that would:

- **Output quiescence** — wait until the pty emits nothing for ~200 ms. Still timing-based, but
  it adapts to a slow machine instead of guessing, which is the actual objection to `sleep`.
- **A terminal emulator** — parse the cursor movements and reconstruct the screen. Correct, and
  a real dependency for a dev-only test.

W7 implemented quiescence plus an explicit platform/mechanism skip in
`packages/cli/e2e/pty-prompt.node-e2e.mjs`. Keep, select and cancel now pass through the real widget
on Linux. The hosted macOS image reports that its BSD `script(1)` invocation cannot establish the
supported pty mechanism, so those three cases skip with that exact reason and the Linux 3/3 run is
the smaller positive replacement. Windows remains a named skip because this mechanism is a Unix
pty test.

## Deferred, with a reason

- **Linting.** Biome (one binary, lint + format, near-zero config; `tsc --noEmit` already covers
  what type-aware ESLint rules would add). Not installed yet — adding a dependency re-resolves
  the workspace, and phase 3's agents are running against it. First task once that lands.
  *(Landed 2026-07-28; kept here because the reasoning still explains the config.)*
- **`CONTRIBUTING.md`, issue and PR templates, `SECURITY.md`.** Ceremony for an audience of one.
  Revisit if the repo gets contributors.
