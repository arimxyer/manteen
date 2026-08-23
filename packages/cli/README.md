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

The examples below use the local `manteen` binary. When a local install is not placed on `PATH`,
resolve it through the project's declared package manager without allowing a transient download:

```bash
npm exec --yes=false -- manteen --version
pnpm exec manteen --version
yarn manteen --version
bunx --no-install manteen --version
```

Keep stderr separate when parsing `--json`; package-manager notices are not part of Manteen's
single stdout document.

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

A self-contained item can also be installed directly from an HTTP, HTTPS or `file:` URL without
adding a registry entry:

```bash
manteen info https://example.com/r/release-panel.json
manteen add https://example.com/r/release-panel.json
```

Direct URLs support the same files, npm dependencies, package styles and theme fragments as named
items. They do not provide an index for `list`, request headers/parameters, or a namespace from
which to resolve bare registry dependencies. See
[URLs and namespaces](https://arimxyer.github.io/manteen/concepts/registry-references/) for the
complete boundary.

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
[second registry receipt](../../docs/handoffs/second-registry-handoff.md).

The remaining commands keep and inspect what was installed:

```bash
manteen status --json
manteen list
manteen list --query table --type registry:component --installed
manteen info @house/data-table
manteen diff
manteen update
manteen update --take-upstream # explicitly discard local source adaptations
manteen update --no-verify     # skip configured project checks for this run
manteen remove --upstream-removed --dry-run
```

`status` is an offline assessment of Manteen's local configuration and ownership state. Even
`healthy: true` does not mean the application typechecks, tests, or builds; inspect whether project
verification is configured and run the checks required by your task.

Unqueried `list` output keeps deterministic registry and canonical item order. `--query` instead
ranks matches within each registry by exact canonical id, exact name, exact title, title prefix,
id/name substring, title substring, then description substring, with prior order as the tie-breaker.
JSON rows expose `queryMatches` and the winning `queryRank` so agents can explain the order.

For automation, every recognized `--json` invocation writes exactly one versioned envelope to
stdout with `schemaVersion`, `command`, `root`, `ok`, `exitCode`, `mutated`, `payload`,
`diagnostics`, `errors`, and `notes`. `ok` is exactly `exitCode === 0`; stderr remains available
for verifier output. JSON mode disables prompting but grants no overwrite or discard authority.
Blocking diagnostics include a typed rerun argument array, a configuration patch, or a bounded
manual action and rationale.

Mutating dry runs return a source-free `planDigest`. Apply the exact reviewed plan by repeating the
same refs and flags with `--expect-plan <sha256>`; a changed source, destination, preimage,
verification definition, or relevant option produces a non-forceable zero-write refusal.

Every install is recorded in `manteen.lock.json`, with exact pristine upstream bases under
`.manteen/bases/`. **Commit both — do not gitignore `.manteen/`.** They stop cross-registry
replacement and let `update` merge current registry changes around project adaptations. Without a
base, `update` refuses rather than guess which side of a difference is yours; recover with
`manteen update --take-upstream`, which reinstalls upstream bytes and rewrites the base.
Conflict-free changes apply without prompting; overlapping edits refuse without writing conflict
markers. For `.ts` and `.tsx` only, a remaining line-level conflict automatically receives one
conservative AST-assisted attempt: Manteen combines distinct stable imports or exported top-level
declarations only when both complete sides reconstruct byte-for-byte from their original source.
It never prints or reformats the AST, and ambiguity leaves the original conflict unchanged.
`--take-upstream` is the separate, destructive reset for files the registry still ships.
After a successful command changes either part of that update state, Manteen prints
`state-versioning-required` as a reminder. It does not inspect Git or claim the files are already
tracked — but it does read your `.gitignore`, and if a rule there hides `.manteen/` the reminder is
raised to a warning that names what breaks. The check runs one way only: a recognized rule is
evidence of a problem, while no matching rule is not evidence the state is committed. That is why
the reminder prints either way and nothing is ever gated on the answer.

Manteen also implements explicit pruning for ordinary files that their same registry item no
longer publishes. Discover every proven candidate first:

```bash
manteen remove --upstream-removed --dry-run
```

A real run removes only exact POSIX, root-relative receipt destinations named through repeated
`--file` flags. Preview the same selection before applying it:

```bash
manteen remove --upstream-removed --file src/components/ui/old.tsx --dry-run
manteen remove --upstream-removed --file src/components/ui/old.tsx
```

If a candidate differs from its pristine upstream base, Manteen reports it as adapted and refuses
the selection. Removing it requires both the exact `--file` and the separate destructive intent:

```bash
manteen remove --upstream-removed \
  --file src/components/ui/old.tsx \
  --discard-adapted
```

The transaction removes the selected project file when present, its obsolete pristine base, and
its exact receipt record through one rollback journal. It does not infer renames, uninstall
packages, remove directories or items, or rewrite theme and managed-styles artifacts. An
unselected dry run is discovery only; a real run without `--file` exits 2. Resolution, selection,
state, preflight, write, or rollback failures exit 1. There are no prompts and no `--all`, `--yes`,
or `--force` escape hatches. Use `--json` for the same candidate, selection, receipt, transaction,
diagnostic, and failure facts as one document.

To have a mutation check the resulting live project, opt into ordered `package.json` scripts in
`manteen.json`:

```jsonc
{
  // ...existing registries, aliases, theme, styles and tsconfig...
  "verification": {
    "add": ["typecheck"],
    "update": ["typecheck", "test", "build"],
    "remove": ["typecheck", "test"],
    "timeoutMs": 300000
  }
}
```

These are script names, not shell command strings. Manteen uses the selected package manager,
preserves the authored order, and stops at the first failure. Configured checks run after writes
for the matching non-dry add, update, or remove operation. `--dry-run` validates and shows the
planned checks without running them; `--no-verify` skips their dynamic resolution and execution
for that run.

`timeoutMs` bounds **one check**, not the run, so ordering never decides whether a suite fits. It
defaults to five minutes — enough for a cold production build on a project consuming a component
registry, and short enough that a script which will never finish does not hold the command open
indefinitely. A check that hits the ceiling is terminated and reported as `timed-out`, kept
distinct from `script-failed` so a process Manteen cut short is never described as your test suite
failing. Raise it if a check is legitimately slower.

Verification runs after writes but before the mutation journal is released. If a check fails to
start, exits non-zero, is terminated, or changes a Manteen-managed/control file, the command exits
1 and restores the source, pristine bases, receipt, config, and other captured control preimages.
It does not claim to roll back caches, snapshots, generated files, dependency installations, or
any other unowned side effect of a project script. Child stdout and stderr are both streamed to the
CLI's stderr, including under `--json`, so the JSON document on stdout stays parseable; no output
transcript or time-specific verification certificate is written to the receipt. With no configured
checks, text output stays silent about verification and JSON reports `status: "not-configured"`
rather than implying a semantic pass.

## Agent use and SDK

The npm package includes a canonical `manteen` skill. Read it without project configuration or
install an owned project copy explicitly:

```bash
manteen agent guide --json
manteen agent install --dry-run --json
manteen agent install --json
```

The default target is `.agents/skills/manteen`. User-level Codex, Claude, universal, and custom
targets are explicit. An unowned destination refuses; an adapted owned copy requires both
`--update` and `--take-packaged` before its changes are discarded. `init` never installs a skill or
edits agent instructions implicitly.

Programmatic consumers should use `createManteenClient()` from `manteen`. It exposes supported
read operations plus non-interactive plan/apply methods whose handles are frozen, content-free,
root-bound, and unforgeable. The existing lower-level exports remain available but are not the
stable agent façade.

Items may also require package-level styles such as `@mantine/carousel/styles.css`. Manteen composes
those imports into the configured `styles` file and records each item's contribution in receipt v3.
The file is Manteen-owned; put project overrides in the host stylesheet imported after it. Manteen
does not rewrite that host stylesheet or a project's Tailwind/PostCSS plugin order.

`manteen` never reads or writes `components.json`, and it does not wrap `shadcn`.
