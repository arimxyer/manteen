# mantine-components

A [shadcn-format registry](https://ui.shadcn.com/docs/registry) that distributes **house Mantine compositions** — not Mantine itself.

Mantine stays a normal npm dependency in every consuming app. What ships through this
registry is the opinionated layer on top: components you're expected to open up and edit.

## What belongs here (and what doesn't)

| ✅ In the registry | ❌ Not in the registry |
| --- | --- |
| `<PageHeader>`, `<StatCard>`, `<DataTable>` — your compositions | `@mantine/core`'s `Table`, `Paper`, `Button` |
| `theme.ts` — house palette + per-component defaults | Mantine's own theming engine |
| `useDataTable` — your hook | `@mantine/hooks` |

Rule of thumb: if an upstream maintainer will keep fixing it, it belongs in `package.json`.
If nobody but you maintains it and every project wants to tweak it, it belongs here.

## Layout

```
registry.json                              # the catalog
registry/ui/*.tsx                          # single-file components  → components/ui/
registry/blocks/data-table/*               # multi-file block        → components/ui/ + hooks/
registry/lib/theme.ts                      # house theme            → lib/
public/r/*.json                            # build output (gitignored)
```

## Develop

```bash
bun install
bun run typecheck          # tsc over registry/
bun run validate           # shadcn registry validate
bun run build:registry     # emits public/r/*.json
```

Source files are authored with the import paths they'll have **after** installation
(`@/components/ui/empty-state`). `tsconfig.json` maps those aliases back onto this repo's
layout so they typecheck here and land correctly there.

## Consume

Add the namespace to the consuming app's `components.json`:

```json
{
  "registries": {
    "@house": "https://<your-host>/r/{name}.json"
  }
}
```

Then:

```bash
npx shadcn@latest add @house/data-table
```

## Gotchas (verified 2026-07-28, shadcn CLI 4.16.0)

**1. `tailwind` is required in `components.json` even without Tailwind.**
The schema lists `["style", "tailwind", "rsc", "aliases"]` as required, and `tailwind`
itself requires `config`, `css`, `baseColor`, `cssVariables`. An empty stub works fine —
`add`, `list`, alias resolution and dependency install all succeed:

```json
"tailwind": { "config": "", "css": "", "baseColor": "neutral", "cssVariables": false }
```

**2. Bare `registryDependencies` resolve against ui.shadcn.com, not your own registry.**
`"registryDependencies": ["empty-state"]` fails with:

```
The item at https://ui.shadcn.com/r/styles/default/empty-state.json was not found.
```

Namespace intra-registry deps: `"registryDependencies": ["@house/empty-state"]`. This
does mean the published registry assumes consumers register it under `@house`. An absolute
URL (`https://<host>/r/empty-state.json`) is the namespace-independent alternative.

**3. File `type` drives placement, not the item type.**
A `registry:block` whose files are typed `registry:ui` and `registry:hook` splits them
across `aliases.ui` and `aliases.hooks` correctly.

## Deploying

`public/r/` is gitignored — build it in CI and publish the directory to any static host.
Any HTTPS endpoint serving these JSON files is a valid registry; there's no central publish step.
