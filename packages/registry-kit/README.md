# mantine-registry-kit

Author Mantine component registries in Mantine's vocabulary; compile them to an interchange
format any registry client can read.

```bash
bun add -d mantine-registry-kit
```

## Why

Registries distribute code you're meant to **own and edit** — the composed layer on top of a
component library, not the library itself. Mantine has no such tooling, and the established
interchange format is shaped around a different design system: roughly a third of its item
schema (`tailwind`, `cssVars`, `css`, `style`, `baseColor`, `iconLibrary`, `theme`, `font`)
is inert for Mantine, and it can't express a version gate, a provider requirement, a theme
fragment, or Styles API selectors.

This kit lets you write the former and emit the latter.

```
mantine-registry.json   ← your schema, your vocabulary
      │  mantine-registry build
      ▼
r/*.json                ← interchange format, machine-readable
```

Nothing you author mentions the wire vocabulary — it exists only in generated output. That
keeps the output installable by any client that speaks the format while leaving the
authoring layer entirely Mantine-shaped.

## CLI

```bash
mantine-registry build [catalog.json] [outDir]      # default: ./mantine-registry.json → ./public/r
mantine-registry merge-theme <base.ts> <fragment.ts> [--write] [--prefer incoming] [--json]
```

`build` validates the catalog against the authoring schema **and** every emitted item against
the vendored interchange schema, exiting non-zero on either.

## Authoring format

```jsonc
{
  "name": "base",
  "namespace": "@base",              // bare `uses` names are qualified with this
  "items": [
    {
      "name": "data-grid",
      "kind": "block",               // component | block | hook | lib | theme | file
      "mantine": ">=9",              // version GATE, checked — not an install directive
      "provider": true,              // requires MantineProvider
      "npm": ["@mantine/core@^9"],
      "uses": ["empty-state"],       // bare = this registry; "@other/x" = cross-registry
      "files": [
        { "path": "src/data-grid.tsx", "as": "component" },
        { "path": "src/use-data-grid.ts", "as": "hook" }
      ],
      "themeFragment": "src/data-grid.theme.ts",
      "stylesApi": { "DataGrid": ["root", "header", "row"] }
    }
  ]
}
```

Unknown fields are rejected rather than dropped, so the authoring format can't quietly drift
toward the wire format.

`mantine`, `provider`, `themeFragment` and `stylesApi` have no wire-format equivalent, so
they compile into `meta.mantine` — an open object that survives into both the item JSON and
the registry index. Clients that understand it act on it; clients that don't ignore it and
still install the files correctly.

`themeFragment` is deliberately **not** listed in `files`: an unaware client must not drop a
stray theme module into a project, and an aware one merges it instead.

## Theme composition

The interchange format merges its own theme variables into a consumer's project. Mantine's
`theme.ts` has no equivalent, so a registry-shipped theme could only be overwritten
wholesale — one theme item per project, local edits lost on update.

```bash
mantine-registry merge-theme src/lib/theme.ts fragment.ts --write
```

| Case | Behavior |
| --- | --- |
| Component missing from base | inserted, import added in the file's existing sort order |
| Component in both | `.extend()` objects merged, so `defaultProps` compose |
| Same leaf set by both | existing kept, conflict reported (`--prefer incoming` flips it) |
| Callback `classNames`/`styles`/`vars` | never merged — reported, since composing them changes runtime semantics |
| Entry that isn't `X.extend({...})` | reported, left alone |

Comments and formatting survive; inserted nodes match the base file's indent and comma style.
Idempotent, so it's safe to run on every install.

## Programmatic API

```ts
import { compileRegistry, mergeThemeSource, validateCatalog } from "mantine-registry-kit";

const { source, items, index, failures } = compileRegistry("./mantine-registry.json");
const { text, conflicts } = mergeThemeSource(baseSource, fragmentSource);
```

## Multiple registries

One toolchain, any number of catalogs — paths inside a catalog resolve against its own
directory:

```bash
mantine-registry build registries/base/mantine-registry.json    dist/base
mantine-registry build registries/product/mantine-registry.json dist/product
```

An item in `@product` can declare `uses: ["@kit/callout", "@base/empty-state"]`, and a client
resolves across all of them in one install. `fixtures/` contains exactly this arrangement and
the test suite exercises it.

### Known limitation

Items are deduplicated by **destination path**, so two registries publishing an item of the
same name collide — the last one installed wins, silently. If `@base/empty-state` and
`@house/empty-state` have different prop signatures, install order decides which one your
project gets. Namespace item names, or don't ship overlapping names across registries you
expect to be installed together.

## License

MIT
