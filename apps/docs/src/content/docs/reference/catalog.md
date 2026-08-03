---
title: Authoring catalog
description: Field reference for manteen.registry.json.
sidebar:
  order: 2
---

## Catalog root

The catalog root requires `name`, `namespace`, and `items`. Unknown fields are rejected instead of
being silently discarded.

| Field | Meaning |
| --- | --- |
| `name` | Human name for the registry index. |
| `namespace` | Lowercase public namespace such as `@acme`; qualifies bare `uses` during compilation. |
| `homepage` | Optional project or documentation URL included in the index. |
| `items` | Components, blocks, hooks, libraries, themes, or files to compile. |

## Item fields

Each item requires `name`, `kind`, and `files`.

| Item field | Meaning |
| --- | --- |
| `title`, `description`, `docs` | Discovery, usage, source, and attribution text. |
| `mantine` | Installed `@mantine/core` compatibility gate; not an install directive. |
| `provider` | Declares that the source requires `MantineProvider`. |
| `npm`, `npmDev` | Runtime and development packages required by the item. |
| `uses` | Other registry items; bare names are qualified with the catalog namespace. |
| `css` | Exact runtime package stylesheet imports, backed by the same item's `npm` entries. |
| `files` | Source files and their component, hook, library, style, or file roles. |
| `themeFragment` | A theme module merged into the consumer theme rather than copied. |
| `stylesApi` | Author-declared public Mantine Styles API selectors keyed by component name. |
| `props` | Author-documented prop surface keyed by exported component or hook name. |
| `usage` | Path to a copy-ready example module, inlined into the item at build time. |

## Styles API declaration

`stylesApi` asserts that the installed component genuinely exposes each named part through its
public `classNames`/`styles` interface. Manteen carries and reports the declaration but cannot
verify arbitrary third-party source; internal CSS-module class names do not qualify.

## Documentation fields

`props` and `usage` are author assertions for documentation clients, carried verbatim — the kit
never infers either from source. Each prop entry requires `name` and `type` and may add
`required`, `default`, and `description`:

```json
{
  "props": {
    "ArticleCard": [
      { "name": "title", "type": "string", "required": true, "description": "Article title." }
    ]
  },
  "usage": "registry/mantine-ui/article-card/article-card.usage.tsx"
}
```

`usage`, like `themeFragment`, is deliberately never listed in `files`: documentation clients
render it, and no client installs it into a consuming project.

## Editor schema

For editor validation, set `$schema` to the installed kit schema:

```json
{
  "$schema": "./node_modules/manteen-kit/schema/manteen.registry.schema.json"
}
```

The package also exports this schema through the `manteen-kit/schema` subpath for tooling that
resolves package exports.
