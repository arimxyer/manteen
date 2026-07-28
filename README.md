# mantine-components

A **Mantine-native component registry**. Authored in Mantine's vocabulary, compiled to an
interchange format any registry client can read.

What ships through here is the *composed* layer — the components you're expected to open up
and edit. Mantine itself stays an ordinary npm dependency in every consuming app.

## Two formats, one direction

```
mantine-registry.json          ← you write this. Our schema, our vocabulary.
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

```
mantine-registry.json                 # the catalog you author
schema/mantine-registry.schema.json   # our authoring schema
schema/wire/registry-item.schema.json # vendored interchange schema (validated against at build)
registry/ui/*.tsx                     # single-file components
registry/blocks/data-table/*          # multi-file block
registry/lib/*.ts                     # theme + theme fragments
tools/build-registry/                 # authoring format → wire format
tools/merge-theme/                    # theme composition codemod
public/r/*.json                       # build output (gitignored)
```

## Develop

```bash
bun install
bun run build:registry                          # compile this registry
bun tools/build-registry/build.ts <catalog> <outDir>   # or any other
bun run typecheck
bun test
```

The build validates the catalog against our authoring schema *and* every emitted item
against the vendored wire schema, exiting non-zero on either, so conformance can't silently
regress.

### Fixtures

`fixtures/kit` and `fixtures/product` are two additional registries used by the test suite.
`@product/alert-panel` declares `uses: ["@kit/callout", "@house/empty-state"]`, so the
cross-registry path — one toolchain, three namespaces, dependencies spanning all of them —
is covered by `bun test` rather than by hand.

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

## `tools/merge-theme` — theme composition

The interchange format's `cssVars` merges into a consumer's theme; Mantine's `theme.ts` has
no equivalent, so a registry-shipped theme could only be prompted over or overwritten
wholesale — one theme item per project, local edits lost on update. This closes that gap.

```bash
bun run merge-theme <base.ts> <fragment.ts>            # dry run
bun run merge-theme <base.ts> <fragment.ts> --write
bun run merge-theme <base.ts> <fragment.ts> --write --prefer incoming
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

- Output built **entirely by `tools/build-registry`** (no shadcn CLI in the pipeline)
  installs via stock `npx shadcn add @house/...` — 6 files placed correctly across
  `components/ui/`, `hooks/` and `lib/`, transitive `uses` resolved, npm deps installed.
- The stock CLI ignores `meta.mantine` and skips the theme fragment — working but degraded,
  exactly as intended.
- Feeding the *same wire file* to `tools/merge-theme` produces the rich behavior:
  `Table` and `Skeleton` merged into the project theme, imports updated.
- Consumer typechecks and production-builds clean afterward.

### Gotchas worth keeping

**Bare `uses` names would resolve against the public registry, not this one.** A wire
`registryDependencies: ["empty-state"]` fails with
`The item at https://ui.shadcn.com/r/styles/default/empty-state.json was not found`. The
build qualifies bare names with `namespace` from `mantine-registry.json`, so authors never
hardcode `@house/`.

**Unknown top-level fields are stripped by third-party builders; `meta` survives.** Confirmed
by round-tripping both. `meta` also survives into the registry index, so a client can read
`meta.mantine` during `list` without fetching every item.

**`components.json` requires a `tailwind` block even in non-Tailwind projects** — the
interchange schema lists `["style", "tailwind", "rsc", "aliases"]` as required. Only
relevant to consumers using the stock CLI; a Mantine client supplies its own config and
never surfaces this.

## Deploying

`public/r/` is gitignored — build in CI and publish the directory to any static host. Any
HTTPS endpoint serving these JSON files is a registry; there's no central publish step.
