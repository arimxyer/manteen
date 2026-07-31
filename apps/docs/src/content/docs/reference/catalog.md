---
title: Authoring catalog
description: Field reference for manteen.registry.json.
sidebar:
  order: 2
---

The catalog root requires `name`, `namespace`, and `items`. Unknown fields are rejected instead of
being silently discarded.

| Field | Meaning |
| --- | --- |
| `name` | Human name for the registry index. |
| `namespace` | Lowercase public namespace such as `@acme`; qualifies bare `uses` during compilation. |
| `homepage` | Optional project or documentation URL included in the index. |
| `items` | Components, blocks, hooks, libraries, themes, or files to compile. |

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
| `stylesApi` | Documented Mantine Styles API selectors keyed by component name. |

For editor validation, set `$schema` to the installed kit schema:

```json
{
  "$schema": "./node_modules/manteen-kit/schema/manteen.registry.schema.json"
}
```

The package also exports this schema through the `manteen-kit/schema` subpath for tooling that
resolves package exports.
