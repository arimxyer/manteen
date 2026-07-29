# manteen

A **Mantine-native component registry**, and the toolchain around it. Authored in Mantine's
vocabulary, compiled to an interchange format any registry client can read.

What ships through here is the *composed* layer — the components you're expected to open up
and edit. Mantine itself stays an ordinary npm dependency in every consuming app.

Live at **<https://arimxyer.github.io/manteen/>**, rebuilt from the catalog on every push.

| | |
| --- | --- |
| `manteen-kit` | author side — compile a catalog, compose theme fragments |
| `manteen` | consumer side — a Mantine-aware install client |
| `@house` | the registry itself, as the reference implementation |

Any client that speaks the registry format can install from it today:

```jsonc
// components.json
{ "registries": { "@house": "https://arimxyer.github.io/manteen/r/{name}.json" } }
```

`manteen` adds what that client cannot express — safe framework initialization, a Mantine version
gate, provider setup, theme-fragment composition, maintenance commands, and refusal when two
registries would overwrite each other's component. It is in active development and unpublished;
see [packages/cli](packages/cli/README.md) for usage and [docs/roadmap.md](docs/roadmap.md) for the
remaining hardening/release work.

```bash
manteen init --dry-run
manteen init
manteen add @house/data-table
```

An independent project, not affiliated with the Mantine team.

## Two formats, one direction

```
manteen.registry.json          ← you write this. Our schema, our vocabulary.
  { "kind": "component", "mantine": ">=9", "themeFragment": "...", "uses": ["empty-state"] }
        │
        │  bun run build:registry
        ▼
public/r/*.json                ← generated. Interchange format, machine-readable.
  { "type": "registry:ui", "meta": { "mantine": { ... } } }
```

Nothing you author mentions the wire vocabulary. It exists only in generated output, which
is why the output is installable by any client that speaks it — including the stock
`shadcn` CLI — without that constraining how anything here is written.

Concepts the wire format has no field for (version gate, provider requirement, theme
fragment, Styles API selectors) ride along under `meta.mantine`, an open object. Clients
that understand it act on it. Clients that don't ignore it and still install the files
correctly. Verified in both directions — see [Interop](#interop).

## What belongs here

| ✅ In the registry | ❌ Not in the registry |
| --- | --- |
| `<PageHeader>`, `<StatCard>`, `<DataTable>` — your compositions | `@mantine/core`'s `Table`, `Paper`, `Button` |
| `theme.ts` — house palette + per-component defaults | Mantine's theming engine |
| `useDataTable` — your hook | `@mantine/hooks` |

Rule of thumb: if an upstream maintainer will keep fixing it, it belongs in `package.json`.
If nobody but you maintains it and every project wants to tweak it, it belongs here.

## Layout

This repo is a bun workspace: a registry, plus the toolchain it's built with.

```
manteen.registry.json        # the catalog you author (namespace @house)
registry/                    # the components themselves
test/                        # smoke test for this catalog
packages/registry-kit/       # → manteen-kit, the toolchain
packages/cli/                # → manteen, init/install/maintenance client
public/r/*.json              # build output (gitignored)
```

The toolchain is packaged rather than kept as repository-only scripts so any number of registries
can share it. See [packages/registry-kit](packages/registry-kit/README.md) for authoring and
[packages/cli](packages/cli/README.md) for consuming.

## Develop

```bash
bun install --frozen-lockfile
bun run build:registry                              # compile this registry
manteen-kit build <catalog.json> <outDir>            # or any other
bun run typecheck
bun test
```

The build validates the catalog against our authoring schema *and* every emitted item
against the vendored wire schema, exiting non-zero on either, so conformance can't silently
regress.

The kit's own fixtures (`packages/registry-kit/fixtures/`) hold three more registries —
`@base`, `@kit`, `@product` — wired so `@product/alert-panel` depends on items in the other
two. The cross-registry path is covered by `bun test` rather than by hand.

Source files are authored with the import paths they'll have **after** installation
(`@/components/ui/empty-state`). `tsconfig.json` maps those aliases onto this repo's layout
so they typecheck here and land correctly there.

## Authoring format

```jsonc
{
  "name": "data-table",
  "kind": "block",              // component | block | hook | lib | theme | file
  "mantine": ">=9",             // version GATE, checked against installed @mantine/core
  "provider": true,             // requires MantineProvider
  "npm": ["@mantine/core@^9"],
  "uses": ["empty-state"],      // bare name — namespaced at build time
  "files": [{ "path": "...", "as": "component" }],
  "themeFragment": "registry/lib/data-table.theme.ts",
  "stylesApi": { "DataTable": ["root", "header", "row"] }
}
```

`themeFragment` is inlined into `meta.mantine` rather than listed in `files`, deliberately:
a client that understands it merges it into the project theme, and one that doesn't must
not drop a stray theme file into the project.

## Theme composition

The interchange format's `cssVars` merges into a consumer's theme; Mantine's `theme.ts` has
no equivalent, so a registry-shipped theme could only be prompted over or overwritten
wholesale — one theme item per project, local edits lost on update. This closes that gap.

```bash
manteen-kit merge-theme <base.ts> <fragment.ts>            # dry run
manteen-kit merge-theme <base.ts> <fragment.ts> --write
manteen-kit merge-theme <base.ts> <fragment.ts> --write --prefer incoming
```

| Case | Behavior |
| --- | --- |
| Component missing from base | inserted, import added in the file's existing sort order |
| Component in both | `.extend()` objects merged, so `defaultProps` compose |
| Same leaf set by both | existing kept, conflict reported (`--prefer incoming` flips it) |
| Callback `classNames`/`styles`/`vars` | never merged — reported, since composing them changes runtime semantics |
| Entry that isn't `X.extend({...})` | reported, left alone |

Comments and formatting survive; inserted nodes match the base file's indent and comma
style. Idempotent, so it's safe to run on every install. Exit `0` clean, `1` conflicts,
`2` usage error.

## Interop

Verified 2026-07-28 against shadcn CLI 4.16.0 and Mantine 9.5.0, with a Vite + React 19
consumer:

- Output built **entirely by `manteen-kit build`** (no third-party CLI in the pipeline)
  installs via stock `npx shadcn add @house/...` — files placed correctly across
  `components/ui/`, `hooks/` and `lib/`, transitive `uses` resolved, npm deps installed.
- Four registries served at once (`@house` plus the three fixtures); a single install
  resolved dependencies spanning them.
- The stock CLI ignores `meta.mantine` and skips the theme fragment — working but degraded,
  exactly as intended.
- Feeding the *same wire file* to `tools/merge-theme` produces the rich behavior:
  `Table` and `Skeleton` merged into the project theme, imports updated.
- Consumer typechecks and production-builds clean afterward.

### Gotchas worth keeping

**Bare `uses` names would resolve against the public registry, not this one.** A wire
`registryDependencies: ["empty-state"]` fails with
`The item at https://ui.shadcn.com/r/styles/default/empty-state.json was not found`. The
build qualifies bare names with `namespace` from `manteen.registry.json`, so authors never
hardcode `@house/`.

**Unknown top-level fields are stripped by third-party builders; `meta` survives.** Confirmed
by round-tripping both. `meta` also survives into the registry index, so a client can read
`meta.mantine` during `list` without fetching every item.

**Items dedupe by destination path, so same-named items across registries collide.** Hit
for real: the fixture `@base/empty-state` overwrote `@house/empty-state` and broke every
caller relying on the richer prop signature. Install order decides the winner, silently.

**`components.json` requires a `tailwind` block even in non-Tailwind projects** — the
interchange schema lists `["style", "tailwind", "rsc", "aliases"]` as required. Only
relevant to consumers using the stock CLI; a Mantine client supplies its own config and
never surfaces this.

## Deploying

`public/r/` is gitignored — build in CI and publish the directory to any static host. Any
HTTPS endpoint serving these JSON files is a registry; there's no central publish step.
