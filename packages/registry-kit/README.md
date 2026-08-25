# manteen-kit

Author Mantine component registries in Mantine's vocabulary; compile them to an interchange
format any registry client can read.

For a complete repository layout, multi-file item, publishing workflow, direct-URL install and
configured-namespace workflow, follow the
[registry-authoring guide](https://arimxyer.github.io/manteen/registry-authors/).

```bash
bun add -d manteen-kit
```

Ships as Node-compatible ESM and requires Node >= 20.11. Any package manager works;
authoring the registry in Bun is optional.

## Why

Registries distribute code you're meant to **own and edit** — the composed layer on top of a
component library, not the library itself. Mantine has no such tooling, and the established
interchange format is shaped around a different design system: roughly a third of its item
schema (`tailwind`, `cssVars`, `css`, `style`, `baseColor`, `iconLibrary`, `theme`, `font`)
is inert for Mantine, and it can't express a version gate, a provider requirement, a theme
fragment, or Styles API selectors.

This kit lets you write the former and emit the latter.

```
manteen.registry.json   ← your schema, your vocabulary
      │  manteen-kit build
      ▼
r/*.json                ← interchange format, machine-readable
```

Nothing you author mentions the wire vocabulary — it exists only in generated output. That
keeps the output installable by any client that speaks the format while leaving the
authoring layer entirely Mantine-shaped.

## CLI

```bash
manteen-kit build [catalog.json] [outDir]      # default: ./manteen.registry.json → ./public/r
manteen-kit merge-theme <base.ts> <fragment.ts> [--write] [--prefer incoming] [--json]
manteen-kit scaffold --template <template> --name <item> --dry-run --json
```

`build` validates the catalog against the authoring schema **and** every emitted item against
the vendored interchange schema, exiting non-zero on either. If the catalog opts into an author
profile, both normal and `--check` builds validate it before any output mutation.

### Safe component scaffolds

Scaffolding is explicit and machine-first. Choose `component-basic`, `component-styles-api`, or
`component-polymorphic`; the last is the only template that uses `polymorphicFactory`.

```bash
# Zero-write plan
manteen-kit scaffold \
  --template component-styles-api \
  --name status-card \
  --dry-run \
  --json

# Source-only apply, using planDigest from an equivalent dry run
manteen-kit scaffold \
  --template component-styles-api \
  --name status-card \
  --apply \
  --expect-plan <sha256> \
  --json
```

Use `--catalog path/to/manteen.registry.json` for another registry. Plans contain canonical
catalog-root-relative paths, complete source contents and hashes, required package declarations,
and the exact catalog insertion object. The Styles API template also returns its exact author
profile evidence mapping. The command applies only scaffold-owned source files: it never mutates
or reserializes `manteen.registry.json`, the author profile, or `package.json`. Differing occupied
files, unsafe paths or links, catalog collisions, and stale plans are named refusals; exact existing
scaffold bytes are a no-op.

## Authoring format

```jsonc
{
  "name": "base",
  "namespace": "@base",              // bare `uses` names are qualified with this
  "authorProfile": "manteen.author-profile.json", // optional, author-only
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
      "docs": "Usage, source and attribution notes carried into the compiled item."
    }
  ]
}
```

Unknown fields are rejected rather than dropped, so the authoring format can't quietly drift
toward the wire format.

`docs` is copied into the installable item document. Use it for human-facing usage, source and
attribution notes; it is not a substitute for shipping any license notice required with copied
source.

`stylesApi` is an optional author assertion for a component that genuinely exposes named selectors
through a public `classNames`/`styles` interface. Private CSS-module class names do not qualify, and
the kit carries the declaration without trying to infer or verify the component implementation:

```json
{ "stylesApi": { "DataGrid": ["root", "header", "row"] } }
```

An optional author profile makes those claims mechanically accountable without asking the kit to
interpret tests or source behavior:

```json
{
  "$schema": "./node_modules/manteen-kit/schema/manteen.author-profile.schema.json",
  "schemaVersion": 1,
  "stylesApi": [
    {
      "item": "data-grid",
      "component": "DataGrid",
      "evidence": "evidence/data-grid-styles.contract"
    }
  ]
}
```

Every opted-in `stylesApi` item/component claim must have exactly one mapping, every mapping must
point back to a current claim, and evidence paths must be unique canonical catalog-root-relative
POSIX paths to existing ordinary files contained by that repository. Evidence can use any filename
and file type: the generic validator does not require Bun, read evidence contents, inspect
assertions or skips, execute TypeScript, runtime-import source, or run author commands. The author's
normal test runner remains the authority for behavioral proof.

`props` and `usage` are the same kind of author assertion, for documentation clients. `props`
documents the prop surface (keyed by exported component or hook name, each entry `name`/`type`
plus optional `required`/`default`/`description`); `usage` names a copy-ready example module
that is inlined at build time. The kit carries both verbatim — it never infers documentation
from source — and `usage`, like `themeFragment`, is deliberately not listed in `files`, so no
client installs it:

```json
{
  "props": { "DataGrid": [{ "name": "rows", "type": "DataGridRow[]", "required": true }] },
  "usage": "src/data-grid.usage.tsx"
}
```

`authorProfile` and its evidence mappings are author-side only and never enter item JSON, the wire
index, or installed files. `mantine`, `provider`, `themeFragment`, `stylesApi`, `props` and `usage`
have no direct wire-format equivalent, so
they compile into the installable item JSON under the open `meta.mantine` object. The registry index
contains only the discovery-safe `requires` and `provider` summary; `stylesApi` and the inlined theme
fragment remain item-detail metadata. Clients that understand these fields act on them; clients that
do not still install the files correctly.

`themeFragment` is deliberately **not** listed in `files`: an unaware client must not drop a
stray theme module into a project, and an aware one merges it instead.

## Theme composition

The interchange format merges its own theme variables into a consumer's project. Mantine's
`theme.ts` has no equivalent, so a registry-shipped theme could only be overwritten
wholesale — one theme item per project, local edits lost on update.

```bash
manteen-kit merge-theme src/lib/theme.ts fragment.ts --write
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
import { compileRegistry, mergeThemeSource, validateCatalog } from "manteen-kit";

const { source, items, index, failures } = compileRegistry("./manteen.registry.json");
const { text, conflicts } = mergeThemeSource(baseSource, fragmentSource);
```

## Multiple registries

One toolchain, any number of catalogs — paths inside a catalog resolve against its own
directory:

```bash
manteen-kit build registries/base/manteen.registry.json    dist/base
manteen-kit build registries/product/manteen.registry.json dist/product
```

An item in `@product` can declare `uses: ["@kit/callout", "@base/empty-state"]`, and a client
resolves across all of them in one install. `fixtures/` contains exactly this arrangement and
the test suite exercises it.

### Destination collisions

The client deduplicates items by canonical id, not by destination path. If two distinct items such
as `@base/empty-state` and `@house/empty-state` resolve to the same destination, planning refuses
with `target-collision` before writing anything. A later command also refuses to replace a
different owner recorded in `manteen.lock.json`.

When overlapping names are intentional, choose a durable winner with a `resolutions` entry in
`manteen.json`. Applying a resolution warns because dependents may have been authored against the
other item's prop contract.

## License

MIT
