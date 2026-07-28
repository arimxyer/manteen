# manteen

Install Mantine components from a registry into your project.

`manteen` is the consumer side of [`manteen-kit`](../registry-kit). The kit compiles a
catalog into an interchange format; `manteen` reads that format, resolves each item's
files against your `tsconfig` path aliases, folds any theme contributions into your
existing theme, and writes the result into your source tree. Components are copied
verbatim — you own them afterwards.

**Unofficial.** Not affiliated with or endorsed by the Mantine team. "Mantine" is the
name of the component library this tool installs components *for*.

## Install

```bash
bun add -d manteen      # or: pnpm add -D manteen / npm i -D manteen
```

Requires Node 22.12 or newer.

## Use

Point `manteen.json` at the registries you want, then add items by their qualified name:

```bash
manteen add @house/data-table
```

Configuration lives in `manteen.json` at your project root — the registries you trust,
the four import aliases (`components`, `ui`, `hooks`, `lib`) that must each be backed by
a `paths` key in your `tsconfig.json`, and the theme file to fold into.

```jsonc
{
  "$schema": "./node_modules/manteen/schema/manteen.schema.json",
  "registries": {
    "@house": "https://example.com/r/{name}.json"
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "hooks": "@/hooks",
    "lib": "@/lib"
  },
  "theme": "src/lib/theme.ts"
}
```

Every install is recorded in `manteen.lock.json` — which item came from which registry
and what was written where. Commit it: it is what stops a same-named component from a
second registry silently replacing one you already installed.

`manteen` never reads or writes `components.json`, and it does not wrap `shadcn`.
