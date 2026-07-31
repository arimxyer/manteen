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
bun add -d manteen      # or: pnpm add -D manteen / yarn add -D manteen / npm i -D manteen
```

Requires Node 22.12 or newer.

The portability gate runs the built CLI on Node 22.12, 24 and 26, exercises npm, pnpm, Yarn PnP and
Bun from packed tarballs, and includes native macOS and Windows jobs. The hosted Windows
`.cmd`/caret-range install is green as of the Wave 7 receipt; Windows remains best-effort so that
current evidence is not presented as an indefinite support guarantee.

## Use

Initialize a supported project from its root, inspect the exact plan, then apply it:

```bash
manteen init --dry-run
manteen init
```

`init` detects Vite, Next App Router, Next Pages Router, a Next hybrid, or framework-mode
React Router. It preserves the generated entry structure while adding Mantine's provider,
framework-appropriate color-scheme setup, core and managed styles, theme, PostCSS pipeline,
aliases and `manteen.json`. Detection can be selected explicitly with `--framework`; unsupported
projects can use `--framework manual` for the shared setup plus a required integration instruction.

The command is transactional at the file layer: dry-run prompts for and writes nothing, interactive
apply asks one all-or-nothing question, dependencies install before file writes, and every init file
shares one rollback journal. A second run has no mutation entries. Use `--json` for a single
machine-readable plan/outcome document, and `--pm` when a fresh project has no lockfile or
`packageManager` field.

Next's current default Tailwind config uses `@tailwindcss/postcss`. `init` deliberately leaves that
file byte-identical because plugin order is project-owned; it exits 0 with `complete: false` and
prints the exact Mantine block still required. This is accepted manual work, not a silent success.

After initialization, add items by their qualified name:

```bash
manteen add @house/data-table
```

Configuration lives in `manteen.json` at your project root — the registries you trust,
the four import aliases (`components`, `ui`, `hooks`, `lib`) that must each be backed by
a `paths` key in your application tsconfig, and the theme file to fold into. A Vite project emits:

```jsonc
{
  "$schema": "./node_modules/manteen/schema/manteen.schema.json",
  "registries": {
    "@house": {
      "url": "https://arimxyer.github.io/manteen/r/{name}.json",
      "index": "https://arimxyer.github.io/manteen/r/registry.json"
    }
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "hooks": "@/hooks",
    "lib": "@/lib"
  },
  "styles": "src/manteen.css",
  "theme": "src/lib/theme.ts",
  "tsconfig": "tsconfig.app.json"
}
```

Registries are named by the consuming project; the server does not need to be built with
`manteen-kit` or know its assigned namespace. For example, the independently hosted,
hand-authored interoperability registry can be added alongside `@house`:

```jsonc
{
  "registries": {
    "@interop": {
      "url": "https://arimxyer.github.io/manteen-interop-registry/r/{name}.json",
      "index": "https://arimxyer.github.io/manteen-interop-registry/r/registry.json"
    }
  }
}
```

```bash
manteen list @interop
manteen add @interop/blocks/release-panel
```

Hand-authored items may use a bare `registryDependencies` name. Manteen resolves it against the
declaring item's namespace and prints `bare-dep-assumed-local` so that compatibility assumption is
visible. The same live registry has been production-built as both `@alpha` and `@vendor`; see the
[second registry receipt](../../docs/second-registry-handoff.md).

The remaining commands keep and inspect what was installed:

```bash
manteen list
manteen info @house/data-table
manteen diff
manteen update
```

Every install is recorded in `manteen.lock.json` — which item came from which registry
and what was written where. Commit it: it is what stops a same-named component from a
second registry silently replacing one you already installed.

Items may also require package-level styles such as `@mantine/carousel/styles.css`. Manteen composes
those imports into the configured `styles` file and records each item's contribution in receipt v2.
The file is Manteen-owned; put project overrides in the host stylesheet imported after it. Manteen
does not rewrite that host stylesheet or a project's Tailwind/PostCSS plugin order.

`manteen` never reads or writes `components.json`, and it does not wrap `shadcn`.
