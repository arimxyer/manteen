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

:::caution[Receipt v3 compatibility break]
Public `manteen@0.3.0` includes the receipt-v3 storage and update workflow below, and accepts only
v3 state. A project with a v1/v2 receipt from `0.2.x` cannot perform an ordinary in-place update.

Manual re-adoption is a destructive reset, not a migration. First commit or back up the whole
project and the legacy receipt. Recover every exact direct registry ref from that backup, move the
v1/v2 `manteen.lock.json` aside without deleting it, and preview all refs in one operation:

```bash
npx manteen add <exact-ref-1> <exact-ref-2> --overwrite --dry-run
```

Review every proposed replacement, then rerun that exact command without `--dry-run` only if
discarding the selected ordinary source is intended. The apply resets those files to current
upstream and creates a new v3 receipt and pristine bases; local adaptations must be reapplied
manually afterward.

This procedure is not established as universal for legacy theme or managed-styles contributions.
If the old receipt includes either, any exact direct ref cannot be recovered, or any replacement is
unclear, stay on `0.2.x`. See the
[0.3 release handoff](https://github.com/arimxyer/manteen/blob/main/docs/v0.3-release-handoff.md)
for the compatibility and evidence boundary.
:::

The source is copied into your aliases and belongs to your project afterward. In `manteen@0.3.0`,
Manteen records the source URL, ownership, installed hash, pristine-base hash, theme
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
and retained by `update`; Manteen does not infer deletions or renames.

:::caution[Upstream removal is not in public 0.3.0]
The repository's unreleased client implements the explicit removal workflow below, but the
currently published `manteen@0.3.0` package does not contain it. This is not a `0.4.0` release
announcement.
:::

In a source build containing that command (shown as `manteen` below), first discover every file
proven absent from the same current registry item:

```bash
manteen remove --upstream-removed --dry-run
```

Then preview the exact POSIX receipt destination you intend to remove, and rerun without
`--dry-run` only after reviewing it:

```bash
manteen remove --upstream-removed --file src/components/ui/old.tsx --dry-run
manteen remove --upstream-removed --file src/components/ui/old.tsx
```

If the local file differs from its pristine upstream base, the selection refuses as adapted.
Preserve the file, or repeat the same exact selection with the additional destructive intent only
when discarding that adaptation is deliberate:

```bash
manteen remove --upstream-removed \
  --file src/components/ui/old.tsx \
  --discard-adapted
```

The removal transaction covers that project file, its obsolete base, and its exact receipt record.
It does not infer a rename or uninstall the item, dependencies, theme contributions, or managed
styles. A real run without an exact `--file` refuses as usage rather than broadening the deletion.

Next, learn how to [build your own registry](../registry-authors/).
