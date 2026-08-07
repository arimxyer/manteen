---
title: CLI commands
description: The public manteen command surface and the role of each command.
sidebar:
  order: 1
---

## Command overview

All commands run from the application root unless `--cwd` names another directory.

| Command | Purpose |
| --- | --- |
| `manteen init` | Detect and configure a supported application for Mantine and Manteen. |
| `manteen add <ref...>` | Resolve, inspect, and install registry items and dependencies. |
| `manteen list [namespace]` | Discover items from configured registry indexes. |
| `manteen info <ref>` | Fetch one item and report its files, dependencies, metadata, and diagnostics. |
| `manteen diff [ref...]` | Compare installed files with their recorded registry sources. |
| `manteen update [ref...]` | Merge current registry changes around local source adaptations. |
| `manteen remove --upstream-removed` | Preview or explicitly remove ordinary files omitted by their current registry item. |

## Planning and destructive intent

The commands do not share one generic overwrite policy:

- `init` and `add` support `--dry-run`; `add` uses `--overwrite` or `--no-overwrite` for existing
  destinations, and `--yes` implies overwrite.
- `update` performs a three-way source merge by default. `--take-upstream` is its explicit
  destructive reset; it does not accept overwrite or yes flags.
- `remove --upstream-removed` requires exact file selection for every real transaction and has no
  prompt, `--all`, `--yes`, or `--force` path.

Where a command exposes `--force`, it only downgrades diagnostics documented as forceable and never
suppresses them.

## Remove files omitted upstream

:::caution[Implemented but not published]
This command is implemented in repository source but is not present in the currently published
`manteen@0.3.0` package. The documentation below describes that unreleased client surface; it does
not announce a `0.4.0` release.
:::

First discover every ordinary receipt-owned file that its same current item no longer publishes:

```bash
manteen remove --upstream-removed --dry-run
```

Discovery fails closed if any receipt item or its current transitive dependency closure cannot be
fully fetched, validated, or resolved. A missing index entry or unavailable item is not deletion
evidence. Manteen joins the exact receipt item id and exact receipt destination, and refuses when
another current item now claims that path. It does not compare source paths or similar text and
does not infer a rename.

Preview and apply an exact selection with repeated `--file` values:

```bash
manteen remove --upstream-removed \
  --file src/components/ui/old.tsx \
  --file src/hooks/use-old.ts \
  --dry-run

manteen remove --upstream-removed \
  --file src/components/ui/old.tsx \
  --file src/hooks/use-old.ts
```

Each selector is the exact POSIX, root-relative destination printed by discovery and stored in
`manteen.lock.json`. Absolute paths, backslashes, `./` aliases, duplicates, and inferred spellings
are invalid; they are not normalized into authority. A real run without any `--file` exits 2.

Candidate state is measured against pristine upstream, not merely against the most recently
accepted merged result. An adapted candidate therefore requires a second explicit choice:

```bash
manteen remove --upstream-removed \
  --file src/components/ui/old.tsx \
  --discard-adapted
```

That flag authorizes only the adapted files already named by exact `--file`. A locally missing
candidate needs no discard flag: selecting it cleans up its obsolete base and receipt record.

One transaction journals the selected source files, their pristine bases, and the receipt, which
is written last. It does not remove dependencies, directories, newly added upstream files, item
records, theme fragments, or managed styles. It also does not run the project's configured update
verification scripts; consumer checks after a coherent removal remain a separate action.

Exit 0 means discovery/preview completed, no candidates existed, or the selected transaction
committed. Exit 1 means resolution, selection, filesystem state, preflight, write, or rollback
failed. Exit 2 means usage or configuration. Exit 130 is unreachable because the command never
prompts. `--json` reports the same candidates, committed removals, receipt/state facts,
diagnostics, notes, and failures as one document without embedding source or base contents.

## Help and runtime

```bash
npx manteen init --help
npx manteen add --help
npx manteen diff --help
# Repository source build only until a package release includes remove
manteen remove --help
```

The CLI requires Node 22.12 or newer and runs with npm, pnpm, Yarn, or Bun projects. Windows is
best-effort; current native Windows and macOS hosted jobs are positive evidence rather than an
indefinite platform guarantee.
