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

:::caution[Release availability]
The receipt-v3 storage and update workflow below are implemented in the current repository source
but are not in the public `manteen@0.2.0` package installed by the command above. They will arrive
in the next contract-bearing release.
:::

The source is copied into your aliases and belongs to your project afterward. In the current
source, Manteen records the source URL, ownership, installed hash, pristine-base hash, theme
contribution, and package styles in the receipt-v3 `manteen.lock.json`. The exact pristine source
for each ordinary file lives under `.manteen/bases/`. Commit the receipt, installed source, and
`.manteen/bases/` together so updates remain reproducible in every clone.

## Maintain installed source

```bash
npx manteen diff
npx manteen diff --stat
npx manteen update @house/article-card
```

`diff` shows what changed from the pristine base to your local file, what changed upstream, and
what the proposed result would change locally. By default, `update` performs that same three-way
merge: non-overlapping local and upstream edits are preserved together.

If both sides changed the same text incompatibly, Manteen refuses before modifying the project;
`--force` does not clear the conflict and conflict markers are never written. After reviewing the
diff, explicitly discard local edits and reset to upstream only when that is what you intend:

```bash
npx manteen update @house/article-card --take-upstream
```

That reset also rebuilds a missing or corrupt pristine base. Files removed upstream are reported
and retained; Manteen does not infer deletions or renames.

Next, learn how to [build your own registry](../registry-authors/).
