# Mantine component alignment contract

[Documentation map](../project-context.md) · [Contracts](README.md) ·
[Research proposal](../research/mantine-custom-component-improvement-plan.md)

Status: implementation contract approved 2026-08-23; author-profile v2 clean break adopted
2026-08-31; MC9 superseded 2026-08-31.

This contract aligns Manteen's authoring, metadata, and documentation surfaces with Mantine 9.5
custom-component conventions without making Mantine's `factory` helpers a registry requirement.
The linked research proposal preserves the audit, alternatives, and detailed acceptance notes.

## Boundaries

- Ordinary source-owned React components remain valid registry content. `factory`,
  `polymorphicFactory`, `useStyles`, CSS variables, and compound exports are optional.
- Public capabilities are author assertions backed by author-owned tests. Generic tooling does not
  infer them from arbitrary source or claim to understand test semantics.
- No install-time source execution, TypeScript evaluation, callback composition, or runtime import
  of a consumer's Mantine installation is introduced.
- Installed source remains the primary customization surface. Existing registries and legacy
  `stylesApi` documents retain their meaning.
- Generated-registry, local, built-Node, hosted CI, public-package, and deployed-site evidence stay
  distinct. Tags, publication, and deployment require later approval.

## Frozen decisions

| ID | Decision |
| --- | --- |
| MC1 | Component capability metadata is optional and descriptive; simple and factory-based components are equally valid. |
| MC2 | Generic tooling verifies catalog semantics and evidence ownership; only author tests prove runtime behavior. |
| MC3 | The house registry supports `>=9.5.0 <10`. Acceptance must prove fresh consumers at 9.5.0 and 9.5.2; neither the current lockfile nor a single latest-version build is sufficient evidence. |
| MC4 | An item's runtime `@mantine/*` ranges must have a non-empty common intersection and must be subsets of its declared Mantine compatibility band. An item with a Mantine runtime dependency must declare that band. |
| MC5 | Theme summaries are syntax-only. Dynamic regions are reported as dynamic and source is never executed to derive metadata. |
| MC6 | Scaffolding is explicit, dry-run first, collision refusing, and plan-digest bound. Its first release emits a reviewable catalog insertion beside the source plan; it does not mutate or reserialize `manteen.registry.json`. |
| MC7 | Polymorphism is opt-in because its type and autocomplete cost is not justified for every component. |
| MC8 | New author checks and scaffolds use the kit's versioned JSON command envelope and visible refusal codes. |
| MC9 | **Superseded 2026-08-31.** Registry pages belong inside Fumadocs' normal content, page-tree, navigation, and search model. A future thin adapter may consume compiled data, but it must not create a parallel registry application or invent documentation and previews from arbitrary source. |
| MC10 | The three public `/prototypes/*` route suites and unused `InteropStages` comparison component may be removed once direct import checks confirm promoted homepage components are independent. Research records preserve the design evidence. |
| MC11 | Author profile schema v2 replaces v1 without a compatibility reader. `stylesApi`, `props`, and `usage` are independent opt-in sections. Each present section is bidirectional and exact, and one physical evidence file cannot own more than one claim across sections. |

The generic conformance profile records explicit, unique, repository-relative evidence paths only.
Schema version 2 has optional `stylesApi`, `props`, and `usage` arrays and requires at least one
non-empty section. Styles API identity is item/component, props identity is item/export, and usage
identity is item. A present section owns every current catalog claim of that category exactly once:
missing, duplicate, and stale mappings refuse. A canonical evidence file may appear only once
across the complete profile. The validator checks strict profile shape, canonical path syntax,
ordinary-file type, and realpath containment; it never reads evidence contents. It does not add an
assertion-helper API or execute author commands. The repository's normal test runner remains the
authority that behavioral evidence passed.

Catalog `stylesApi` remains authoritative. A broader `componentApi` vocabulary is deferred until a
specific CLI, documentation, scaffold, or machine consumer justifies each field. No first-wave
schema or implementation branch may add it speculatively.

The existing theme-builder proposal remains independent. It does not wait for `themeSummary`, and
the theme-summary work does not expand the theme builder implicitly.

### Theme summary wire contract

`meta.mantine.themeSummary` is an optional sibling of `themeFragment`. The kit emits it only when
an item declares `themeFragment`, and derives it from that fragment with the existing `ts-morph`
parser. Derivation never imports or executes source, resolves aliases, asks TypeScript for types,
or serializes callback bodies or values. The stable JSON shape is:

```ts
interface ThemeSummary {
  keys: string[];
  components: {
    items: Array<{
      name: string;
      channels: Array<{
        name: "defaultProps" | "classNames" | "styles" | "vars";
        dynamic: boolean;
      }>;
      dynamic: boolean;
    }>;
    dynamic: boolean;
  };
  dynamic: boolean;
}
```

`keys` contains the known literal top-level property names from exactly one direct
`createTheme({ ... })` call and is code-unit sorted. `components.items` contains known literal
component names and is code-unit sorted; each `channels` array uses the fixed order shown above.
Identifier, string, and numeric property names are literal. Computed names and spreads make their
owning level dynamic even when part of their syntax looks statically reducible.

The `components` map must be a direct object literal. A component may be a direct object literal or
a direct `Component.extend({ ... })` call whose receiver is an identifier or non-computed property
chain such as `Input.Wrapper`. An alias, callback, other call, computed receiver, or non-object
extend argument produces a known component with no channels and `dynamic: true`. Inside a direct
component object, spreads and computed names make the component dynamic. Other literal-named
component options remain known structure even though this summary does not list them.

A known channel is non-dynamic only when its value is a direct object literal made recursively of
ordinary literal-named property assignments and literal primitive, array, or object values.
Callbacks, identifiers, calls, shorthand properties, methods, accessors, spreads, computed names,
and other expressions make that channel dynamic. A dynamic channel does not by itself make its
component dynamic, and a dynamic component or components map does not by itself make the root
dynamic: each marker describes only its own structural level.

Malformed source, no direct call, multiple direct calls, or a direct call without exactly one
object-literal argument yields the empty conservative shape: empty keys and components, with root
and components dynamic. Summary derivation never throws solely because source is malformed or
unrecognized. `themeFragment.path`, `themeFragment.content`, and all merge output bytes remain
unchanged. Older clients ignore the open metadata key; the current CLI validates it fail-open,
drops only a malformed summary with a visible `meta-degraded` diagnostic, and never exposes the
fragment source through `manteen info`.

The current CLI also drops a summary when its sibling fragment is missing or malformed. Reporting
derived structure without the source of truth it describes would otherwise make hand-authored wire
metadata look authoritative; this cross-field degradation is visible and does not affect files.

### Safe scaffold wire and CLI contract

The first scaffold release has exactly these machine-oriented forms:

```text
manteen-kit scaffold --template <template> --name <item> [--catalog <path>] --dry-run --json
manteen-kit scaffold --template <template> --name <item> [--catalog <path>] --apply --expect-plan <sha256> --json
manteen-kit scaffold --template <template> --name <item> [--catalog <path>] --register --dry-run --json
manteen-kit scaffold --template <template> --name <item> [--catalog <path>] --register --apply --expect-plan <sha256> --json
```

`--catalog` defaults to `./manteen.registry.json`. Exactly one of `--dry-run` and `--apply` is
required; apply additionally requires one lowercase SHA-256 digest. `--template`, `--name`, and
`--json` are required in both forms. Repeated, missing, unknown, positional, or otherwise ambiguous
arguments are the usage failure `invalid-arguments` with exit code 2. Item names match
`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and exclude the Windows device basenames `con`, `prn`, `aux`,
`nul`, `com1` through `com9`, and `lpt1` through `lpt9`. The only templates are
`component-basic`, `component-styles-api`, and `component-polymorphic`; polymorphism is generated
only by the last explicit choice.

Both forms emit the schema-version 2 command envelope. A successful dry run also carries the exact
apply argv in top-level `actions`. Its `payload` is a schema-version 1 scaffold
plan containing the template, item name, SHA-256 plan digest, catalog preimage hash, preserved-file
preimages, required runtime and development package declarations, diagnostics, and the exact
catalog insertion object. The Styles API plan also contains the exact evidence mapping insertion
and its current author-profile path when one is declared. Without `--register`, profile and catalog
insertions are review data only and apply writes only scaffold-owned sources. With `--register`,
the digest also binds the projected catalog, author-profile, and package-manifest edits.

The default catalog contract is `mantine: ">=9.5.0 <10"` with
`npm: ["@mantine/core@^9.5.0"]`. The fixed catalog-root-relative layout is
`src/<item>/<item>.tsx`; templates add only `<item>.module.css`, `<item>.usage.tsx`, and
`test/<item>-styles-api.test.tsx` when their behavior requires them. Catalog `files` includes only
installable component and style source; `usage` names the authored usage module; conformance
evidence remains author-only. All plan paths are canonical catalog-root-relative POSIX paths,
sorted by JavaScript code-unit order. Each planned source carries its exact UTF-8 content and
SHA-256 hash plus its absent-or-exact preimage, so the plan is complete and secret-independent.
The digest is SHA-256 over the canonical JSON plan with the digest field omitted.

Planning performs no writes. It parses and validates the current catalog, refuses an existing item
name, and classifies every source as a create, an exact no-op, or an unsafe collision. A differing
ordinary file is `scaffold-file-collision`; directories, links, linked parents, invalid or escaping
paths, and invalid catalog/profile state have distinct visible `scaffold-*` codes. Exact scaffold
bytes are a truthful no-op. Differing authored bytes are never refreshed or overwritten.

Apply recomputes the complete plan and requires it to be safe and byte-for-byte equivalent to the
expected digest. Before its first write it rechecks every path and preimage, catalog item-name
absence and catalog hash, profile and package-manifest preservation preimages, and the absence of
any unsafe plan member. Stale digest, catalog drift, or file drift is a refusal. It stages all
creates, commits without overwriting occupied paths, and rolls back every scaffold-owned file it
created if any commit or postcondition fails. A registered Styles API scaffold adds a missing
`scripts.test = "vitest run"`, preserves any authored string command, and appends `test` to the
author profile's ordered verification scripts. Registered control edits and sources share the same
rollback boundary; source-only apply leaves all three control files byte-identical. Apply is never
interactive or inferred from omission of `--dry-run`; it reports mutation truth in the envelope, including `mutated: true` on a failure that
cannot safely remove a scaffold-created file, staging file, or directory.

## Execution order

1. Add a house guard binding every `stylesApi` declaration to exactly one explicit conformance
   test, in both directions.
2. Generalize that proven minimum into an optional registry-author evidence profile without
   `@house` assumptions.
3. Add Mantine range-coherence validation and prove the 9.5.0 and 9.5.2 consumer boundaries.
4. Stop and validate steps 1-3 against an independent hand-authored registry.
5. In disjoint worktrees, build the syntax-only theme summary, the first Fumadocs item-detail
   surface, and prototype cleanup. Give schemas, the catalog, shared CLI types, and the Fumadocs
   registry reader one writer at a time.
6. Add scaffolding only after the conformance profile is stable. It emits a reviewed catalog patch
   and never silently refreshes authored files.
7. Treat curated previews as item-sized follow-ups. Reconsider broader component metadata only
   when a concrete consumer is ready.

Use stacked branches only where a later change actually depends on an earlier contract. Independent
workstreams use separate Herdr worktrees and converge through sequential integration and review.

## Acceptance boundary

Shared-contract and release-candidate milestones run the repository gate, registry and CLI builds,
the complete built-Node e2e glob, and the documentation build. Milestone-specific evidence also
includes:

- fail-before/pass-after fixtures for evidence ownership and range coherence;
- no-execution fixtures for theme summaries;
- zero-write, collision, and stale-plan scaffold tests;
- a hand-authored independent registry;
- fresh consumers at Mantine 9.5.0 and 9.5.2; and
- hosted CI and deployment receipts reported separately from local proof.

No milestone in this contract authorizes a package version, tag, npm publication, GitHub release,
or documentation or registry deployment.
