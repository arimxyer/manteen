---
title: Install your first item
description: Initialize a Mantine application and install source from a registry.
sidebar:
  order: 1
---

Manteen requires Node 22.12 or newer. Install the CLI with the package manager already used by
your application:

```bash
npm install --save-dev manteen
```

From the application root, inspect the initialization plan and then apply it:

```bash
npx manteen init --dry-run
npx manteen init
```

`init` supports Vite, Next App Router, Next Pages Router, valid Next hybrids, and framework-mode
React Router. It configures Mantine's provider, theme, core styles, a Manteen-owned package-style
file, PostCSS, and TypeScript aliases while preserving the framework's generated structure.

:::note[Next and Tailwind]
When `@tailwindcss/postcss` is already present, Manteen leaves the PostCSS file byte-identical and
prints the exact Mantine block that still needs placement. The command exits successfully with
`complete: false`; the notice is required work, not an ignored warning.
:::

Install a component from the live registry:

```bash
npx manteen info @house/article-card
npx manteen add @house/article-card
```

The source is copied into your aliases and belongs to your project afterward. Manteen records the
source URL, ownership, hashes, theme contribution, and package styles in `manteen.lock.json`.
Commit that receipt with the installed source.

## Maintain installed source

```bash
npx manteen diff
npx manteen diff --stat
npx manteen update @house/article-card
```

`diff` compares local files with their recorded registry sources. `update` fetches the current
item and routes it through the same collision, version, theme, style, and overwrite checks used by
`add`.

Next, learn how to [build your own registry](../registry-authors/).
