---
title: Build a registry
description: Compile a real multi-file Mantine item with dependencies, package styles, and a theme fragment.
sidebar:
  order: 1
---

A registry is a static collection of JSON documents. You author normal source files and one
`manteen.registry.json` catalog; `manteen-kit` validates both the authoring format and the compiled
interchange documents.

The repository contains a complete
[`registry-starter`](https://github.com/arimxyer/manteen/tree/main/examples/registry-starter)
that is compiled during documentation verification. It demonstrates one shareable item with:

- a React component and colocated CSS module;
- a hook installed under the consumer's hooks alias;
- Mantine, Carousel, and Tabler package dependencies;
- the Carousel package stylesheet;
- a mergeable Mantine theme fragment; and
- provider, version, Styles API, and human documentation metadata.

## 1. Create the authoring project

```bash
mkdir my-manteen-registry
cd my-manteen-registry
npm init -y
npm install --save-dev manteen-kit
```

Use this layout:

```text
my-manteen-registry/
├── manteen.registry.json
└── src/
    └── release-panel/
        ├── release-panel.tsx
        ├── release-panel.module.css
        ├── release-panel.theme.ts
        └── use-release-carousel.ts
```

## 2. Describe the item

```json title="manteen.registry.json"
{
  "$schema": "./node_modules/manteen-kit/schema/manteen.registry.schema.json",
  "name": "acme-registry",
  "namespace": "@acme",
  "homepage": "https://github.com/acme/manteen-registry",
  "items": [
    {
      "name": "release-panel",
      "kind": "block",
      "title": "Release Panel",
      "description": "Carousel-backed release highlights with controlled selection.",
      "mantine": ">=9 <10",
      "provider": true,
      "npm": [
        "@mantine/core@^9",
        "@mantine/carousel@^9",
        "@tabler/icons-react@^3"
      ],
      "css": ["@mantine/carousel/styles.css"],
      "files": [
        {
          "path": "src/release-panel/release-panel.tsx",
          "as": "component",
          "target": "@ui/release-panel.tsx"
        },
        {
          "path": "src/release-panel/release-panel.module.css",
          "as": "style",
          "target": "@ui/release-panel.module.css"
        },
        {
          "path": "src/release-panel/use-release-carousel.ts",
          "as": "hook",
          "target": "@hooks/use-release-carousel.ts"
        }
      ],
      "themeFragment": "src/release-panel/release-panel.theme.ts",
      "stylesApi": {
        "ReleasePanel": ["root", "header", "slide"]
      },
      "docs": "Render ReleasePanel inside MantineProvider and pass release highlights as data."
    }
  ]
}
```

`mantine` is a compatibility gate, while `npm` declares packages the consumer needs installed.
Every entry in `css` must be a bare package subpath whose package appears in the same item's
runtime `npm` list. Manteen intentionally refuses arbitrary CSS rules, URLs, and relative imports
in this channel.

`themeFragment` is merged into the consumer's configured theme; it is not copied as another source
file. This prevents one registry theme from replacing local theme work wholesale.

## 3. Build and validate

```bash
npx manteen-kit build
```

The default output is:

```text
public/r/
├── registry.json
└── release-panel.json
```

Build failures are refusals: invalid catalog fields, unreadable source, or emitted documents that
do not satisfy the interchange schema produce a nonzero exit and no trustworthy registry.

Continue to [publish and share the registry](./publish-and-share/).
