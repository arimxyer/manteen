---
title: CLI commands
description: The public manteen command surface and the role of each command.
sidebar:
  order: 1
---

All commands run from the application root unless `--cwd` names another directory.

| Command | Purpose |
| --- | --- |
| `manteen init` | Detect and configure a supported application for Mantine and Manteen. |
| `manteen add <ref...>` | Resolve, inspect, and install registry items and dependencies. |
| `manteen list [namespace]` | Discover items from configured registry indexes. |
| `manteen info <ref>` | Fetch one item and report its files, dependencies, metadata, and diagnostics. |
| `manteen diff [ref...]` | Compare installed files with their recorded registry sources. |
| `manteen update [ref...]` | Fetch current items and route them through the normal install safety checks. |

Use `--dry-run` before mutating commands to inspect their plan. In non-interactive environments,
choose overwrite behavior explicitly with `--overwrite` or `--no-overwrite`; `--yes` implies
overwrite. `--force` only downgrades diagnostics documented as forceable—it never suppresses them.

```bash
npx manteen init --help
npx manteen add --help
npx manteen diff --help
```

The CLI requires Node 22.12 or newer and runs with npm, pnpm, Yarn, or Bun projects. Windows is
best-effort; current native Windows and macOS hosted jobs are positive evidence rather than an
indefinite platform guarantee.
