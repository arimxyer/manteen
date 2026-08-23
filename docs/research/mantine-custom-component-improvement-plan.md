# Mantine custom-component alignment plan

Status: proposal for review, not an adopted product contract  
Prepared: 2026-08-23  
Reference: Mantine 9.5.2 and the current
[custom-component guide](https://mantine.dev/guides/custom-components/)

## Why this exists

Manteen and Mantine custom components already fit together at the important boundary: Mantine owns
component runtime and authoring conventions; Manteen distributes ordinary source, preserves local
adaptations, and carries the metadata a consumer needs to install and maintain it. Manteen should
make a well-authored Mantine component easier to publish and understand without becoming another
component runtime or requiring Mantine's `factory` APIs.

The current repository proves much of that model, but several seams remain loose:

- `manteen-kit` validates catalog shape and emitted wire documents, but author claims such as
  `stylesApi`, `props`, and `usage` are not tied to named evidence.
- The house registry declares a public Styles API for 9 items and has 9 matching behavioral tests,
  but no guard requires that one-to-one relationship to remain true.
- 21 items declare `mantine: ">=9"` while their install directives use the v9 package line. The
  ranges currently intersect, but no author-side guard proves that dependency ranges stay inside
  the compatibility claim, and `>=9` accidentally claims compatibility with a future v10.
- `stylesApi` carries selectors only. It cannot describe public CSS variables, variants,
  polymorphism, compound exports, or theme extension even when a component intentionally exposes
  them.
- Authors manually coordinate source, CSS, usage, catalog metadata, and evidence tests. There is no
  collision-safe scaffold for the common patterns in Mantine's custom-component guide.
- Theme fragments are visible to `info` as a path and byte count, but not as a safe structural
  summary of the theme keys and component extension channels they contribute.
- The Fumadocs candidate explains the registry protocol but does not yet provide the planned item
  detail surface. The discarded registry-port branch should not be merged wholesale; the feature
  should be rebuilt against the contracts frozen here.

The workspace currently declares `@mantine/core` and `@mantine/hooks` as `^9.5.0` and resolves
9.5.0. Moving the workspace to 9.5.2 is a separate dependency update, not evidence that every item
supports every earlier 9.x release.

## Boundaries to preserve

1. Ordinary React components remain valid registry content. `factory`, `polymorphicFactory`,
   `useStyles`, CSS variables, and compound components are optional Mantine capabilities, not
   Manteen eligibility requirements.
2. The compiler and installer do not infer a public API from arbitrary source. Public component
   capabilities remain author assertions backed by author-owned tests.
3. No install-time source execution, TypeScript evaluation, callback composition, or runtime import
   of the consumer's `@mantine/core` is introduced.
4. Installed source remains the primary customization surface. Metadata supplements source
   ownership; it does not hide or replace it.
5. Existing registries remain installable. New metadata must be optional and older `stylesApi`
   documents must retain their current meaning.
6. Generated registry proof, local tests, built-Node evidence, hosted portability evidence, public
   package proof, and documentation deployment proof remain separate.
7. Publication, version tags, GitHub releases, Pages deployment, and replacement of `apps/docs`
   require later explicit approval.

## Decisions to freeze before implementation

Use `MC` identifiers so this proposal does not collide with the client's established D1-D44
decisions.

| ID | Proposed decision | Why |
| --- | --- | --- |
| MC1 | Component capability metadata is optional and descriptive. | Manteen must support both full Mantine factory components and simple source-owned components. |
| MC2 | Generic tooling verifies catalog semantics and evidence ownership; author tests prove runtime behavior. | A kit cannot truthfully infer selectors or prop behavior from arbitrary third-party source. |
| MC3 | Every supported Mantine band has an explicit upper bound and a tested floor. | `>=9` silently claims v10 and says nothing about the actual lowest compatible 9.x release. |
| MC4 | Mantine package ranges for one item must have a non-empty common intersection and must not select versions outside the item's compatibility gate. | The gate and install directives must describe one coherent consumer state. |
| MC5 | Derived theme summaries are syntax-only and never execute source. Dynamic regions are reported as dynamic, not guessed. | Introspection must not become a code-execution or callback-composition seam. |
| MC6 | Scaffolding is explicit, dry-run first, collision refusing, and catalog-surgical. | A convenience command must not overwrite authored source or reserialize the catalog. |
| MC7 | Polymorphism is opt-in. | Mantine documents the TypeScript and autocomplete cost; most components do not need it. |
| MC8 | New author checks and scaffolds use the kit's versioned JSON command envelope. | Agents need stable plans, codes, paths, and mutation truth rather than display-text parsing. |
| MC9 | The Fumadocs detail surface consumes compiled registry documents and curated adapters; it does not scrape arbitrary source to invent docs or previews. | The registry remains the contract and missing evidence stays visibly missing. |
| MC10 | Prototype routes and unused promoted alternatives are cleanup candidates, not production dependencies. | Design evidence can remain in research documents without shipping publicly routable laboratories forever. |

MC3 requires a specific follow-up decision: either prove an earlier v9 floor or set the supported
floor to the version actually exercised by the repository. Updating to 9.5.2 alone does not answer
that question.

## Workstreams

### A. Close the house conformance seam

First add a repository guard that enforces both directions:

- every house item declaring `stylesApi` owns one matching conformance test; and
- every Styles API conformance test points to an item that still declares the matching component.

The guard should derive the set from the catalog and a small explicit evidence map. Filename
convention alone is too weak; a renamed test can exist without proving the intended item. The
existing 9 tests remain the runtime evidence: selector closure, instance `classNames` and `styles`,
stable generated selector classes, CSS-module presence, and theme-level `.extend()` behavior.

After the house guard has proven the useful minimum, generalize it into an optional author
conformance profile for `manteen-kit`. The first generic profile should record evidence ownership
only; it should not run arbitrary commands or pretend to read test semantics. A later author can
bind catalog claims to their own test runner while `manteen-kit` verifies that every required claim
has a real, unique, repository-relative evidence path.

Acceptance:

- deleting a declaration, deleting its evidence mapping, or mapping two items to one accidental
  file fails mechanically;
- a third-party fixture proves the helper contains no `@house` assumptions; and
- the normal test runner remains the authority that behavioral evidence passed.

### B. Make compatibility ranges coherent

Add author-side semantic validation after JSON-schema validation:

- `mantine` is a valid semver range;
- any item declaring an `@mantine/*` runtime dependency also declares `mantine`;
- all `@mantine/*` dependency ranges have a common satisfiable version band;
- installable Mantine dependency ranges are subsets of the item compatibility gate, not merely
  intersecting it; and
- a bounded major policy prevents the house catalog from accidentally claiming an untested v10.

Do not infer package requirements from source imports in the generic compiler. The authoring
catalog is the contract. Source-level checks may exist only as house-specific guards.

Freeze the house range only after disposable consumer tests establish the chosen lower bound and
9.5.2. Test `@mantine/core`, `@mantine/hooks`, and extension packages together at each boundary so
peer compatibility is part of the evidence.

Acceptance fixtures must fail for malformed ranges, disjoint Mantine package ranges, a dependency
outside the declared gate, an unbounded next major, and a Mantine package without a gate. Valid
independent registries must continue compiling.

### C. Describe richer public component capabilities

Keep legacy `stylesApi` unchanged and add a new optional `componentApi` contract rather than
silently changing the value type of an established field. Proposed shape:

```json
{
  "componentApi": {
    "ExampleComponent": {
      "selectors": ["root", "inner"],
      "cssVariables": { "root": ["--radius"] },
      "variants": ["filled", "outline"],
      "themeExtension": true,
      "polymorphic": { "defaultComponent": "div" },
      "compound": ["Item", "Panel"]
    }
  }
}
```

Every nested capability is optional. Do not add an `implementation: "factory"` flag: consumers
care about the public contract, not which helper produced it. A non-factory component may implement
the same public behavior deliberately.

The compiler carries the assertion under `meta.mantine`; `manteen info` reports it; Fumadocs can
render it. The installer does not block on display-only capability metadata. Malformed optional
metadata follows the existing visible degrade-to-note policy rather than turning a cosmetic typo
into permission to install incompatible source.

Before adopting the exact field names, test them against the 9 current factory components and at
least one deliberately simple non-factory component. Avoid metadata that has no consumer or docs
use case.

### D. Add safe author scaffolds

This depends on MC1-MC8 and the first conformance-profile shape. Add a `manteen-kit scaffold`
surface with explicit templates:

- `component-basic` for an ordinary source-owned Mantine component;
- `component-styles-api` for `factory`, typed selectors, `useProps`, `useStyles`, CSS module,
  usage example, catalog capability metadata, and a conformance-test starting point; and
- `component-polymorphic` only when explicitly selected.

The command produces a complete dry-run plan before writing, refuses every occupied destination,
does not install packages, and edits `manteen.registry.json` surgically without reserializing it.
It should report required package declarations instead of mutating `package.json` implicitly. A
second run is either an exact no-op or a named collision; it never refreshes authored files
silently.

Acceptance includes JSON plan stability, zero-write dry run, stale-plan refusal, path/symlink
safety, exact catalog preservation outside the insertion, compilation of the scaffolded registry,
and a disposable consumer build.

### E. Summarize theme fragments safely

Reuse the kit's existing TypeScript AST dependency to derive a syntax-only `themeSummary` during
registry compilation. The useful minimum is:

- top-level `createTheme` keys;
- component names under `components`;
- channels present per component: `defaultProps`, `classNames`, `styles`, and `vars`; and
- a visible `dynamic` marker wherever the structure cannot be summarized without evaluation.

Do not serialize callback bodies, computed values, or inferred final theme values. The full theme
fragment remains the merge input and source of truth. `manteen info` and the docs display the
summary beside the existing path and byte count.

Acceptance covers static fragments, callbacks, computed keys, aliases, malformed source, stable
ordering, no source execution, and no change to merge output bytes.

### F. Build the Fumadocs registry detail surface anew

Do not resurrect the discarded registry-port branch wholesale. Build against the current
Fumadocs application and the frozen metadata contracts.

The route contract remains `Preview · Usage · Props · Styling · Source`. The first stage should
provide grouped navigation, base-path-safe item routes, copyable install commands, source files,
and truthful metadata states. Tabs with no trustworthy data are omitted or explicitly marked not
applicable. Curated previews follow item by item; arbitrary source is never evaluated to fabricate
one.

`componentApi` and `themeSummary` enrich this surface but should not block a first source/metadata
route. The reader must consume generated `/r` bytes and share the same contract used by the live
registry. A missing generated registry must fail the guard rather than skip with exit 0.

Acceptance includes production build, route enumeration, base-path proof, exact generated-registry
reads, missing-output failure, keyboard/accessibility checks for the tabs, and explicit separation
from Pages deployment.

### G. Retire design laboratories deliberately

Once the promoted homepage components are confirmed independent, remove the three public
`/prototypes/*` route suites and the unused `InteropStages` comparison component. Preserve the
design method and decisions in the existing research documents. This is an independent cleanup
change and should not be bundled into a schema or CLI PR.

## Dependency graph and execution shape

```text
CI optimization (already delegated) ───────────────────────────────┐
                                                                  │
MC1-MC10 contract freeze (one writer)                              │
  ├─ A1 house evidence guard ──> A2 generic author profile         │
  ├─ B compatibility semantics + boundary consumers                ├─> integration gate
  ├─ C componentApi schema ─────> D safe scaffold                  │
  ├─ E themeSummary ────────────> F Fumadocs styling/detail data   │
  └─ F route shell can begin after its reader contract freezes     │
                                                                  │
G prototype cleanup and existing Wt theme builder are independent ┘
```

The shared contract freeze is intentionally sequential. It owns the authoring schema, compiled
metadata shape, CLI validation policy, and machine diagnostics. No parallel implementer edits
those files.

After that commit, use separate Herdr worktrees for A, B, E, F's route shell, and G because their
owned files can be disjoint. Use stacked PRs only for real dependencies:

1. `contract/mantine-component-api` — MC decisions, schemas, shared types, diagnostics;
2. `feature/author-conformance` — house guard, then generic profile;
3. `feature/component-scaffold` stacked on the conformance and component contracts;
4. `feature/theme-summary` — AST analysis and metadata;
5. `feature/fumadocs-registry-detail` stacked on the reader contract, with metadata enrichment
   layered after C and E;
6. `cleanup/retire-prototypes` independent; and
7. `feature/theme-builder` independent unless its final design chooses to consume theme summaries.

Give `manteen.registry.json`, each schema, shared CLI types, and the Fumadocs registry reader one
writer at a time. Parallel agents may return requested spine edits as notes; the integrator applies
them after the owning branch is stable.

## Milestones and stop points

### M0 — Approve the plan

Freeze MC1-MC10, choose the supported Mantine floor, decide whether `componentApi` earns all six
proposed capability fields, and confirm prototype retirement. No implementation begins before
these choices are explicit.

### M1 — Author truthfulness

Land A and B. At this point declarations have named evidence and compatibility/install ranges
cannot drift apart. Stop and validate the design against one independent registry before growing
the metadata vocabulary.

### M2 — Component and theme description

Land C and E. Prove backward compatibility with old item documents and visible degradation of bad
optional metadata. Stop if any field lacks a concrete CLI or docs consumer.

### M3 — Author ergonomics

Land D only after M1 and M2. The scaffold must generate the accepted contract rather than freezing
an earlier guess into templates.

### M4 — Documentation surface

Land F and G, with curated previews as later item-sized commits. This is local/CI acceptance only;
replacing the deployed site remains a separate decision.

### M5 — Release candidate

Run the full repository sequence, built-Node e2e glob, both documentation builds, independent
registry author acceptance, and fresh consumers at the chosen Mantine floor and 9.5.2. Only then
decide package versions, tags, publication, and deployment in separate approved steps.

## Required verification

Use the repository's normal full gate for shared-contract or release-candidate milestones:

```bash
bun run test
bun run typecheck
bun run lint
bun run guard
bun run build:registry
bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs
bun run build:site
bun run site:build
```

Add milestone-specific proof rather than treating the full gate as sufficient:

- fail-before/pass-after fixtures for evidence ownership and range coherence;
- old-document compatibility for `stylesApi`;
- no-execution AST fixtures for `themeSummary`;
- zero-write and stale-plan scaffold tests;
- a hand-authored independent registry, not only `@house`;
- fresh consumers at both compatibility boundaries; and
- hosted CI timing and portability receipts distinct from local success.

## Questions for review

1. Is the supported floor all of Mantine 9, 9.5.0, or 9.5.2? Evidence should choose it, not the
   convenience of the current lockfile.
2. Should the first `componentApi` release include every proposed capability, or only selectors,
   CSS variables, variants, and theme extension?
3. Is an evidence-path profile enough for the first generic conformance release, or should the kit
   also define a pure assertion-helper API for author tests?
4. Should scaffolding update the catalog in the first release, or initially generate a reviewed
   catalog patch beside the source plan?
5. Can the promoted homepage components replace all public prototype routes now?
6. Does the theme builder stay independent, or should it wait for `themeSummary` so the catalog can
   explain what the installed theme already controls?

Those are decision checkpoints. They should not be answered implicitly by whichever implementation
branch happens to land first.
