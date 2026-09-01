# Registry authoring workflow

## Inspect the catalog

A Manteen registry is ordinary source plus `manteen.registry.json`. Follow its `$schema`; do not
convert it into the emitted shadcn-compatible vocabulary.

Before changing an item, inspect:

- `kind`, `files`, and explicit targets;
- Mantine compatibility and provider requirements;
- runtime/dev packages, package CSS, and registry dependencies;
- theme fragments and genuine public Styles API selectors;
- author-supplied `docs`, `props`, and `usage` metadata.

`docs`, `props`, `usage`, and `stylesApi` are assertions, not inferred facts. Verify them against
the component's public behavior. A private CSS-module class is not a Styles API selector.

Bare `uses` entries belong to the catalog namespace. Use qualified refs for cross-registry
dependencies.

## Validate without writing

Run the installed tool's help before relying on newer flags:

```bash
manteen-kit build --help
manteen-kit build manteen.registry.json public/r --check --json
```

`build --check` renders and validates every prospective byte, compares the complete output, and
does not mutate it. Distinguish `clean`, `missing`, `changed`, and `refused` rather than treating
all non-clean states as permission to replace a directory.

The envelope's top-level `ok` answers whether the check passed (`clean`); `payload.ok` answers
whether the prospective output is safe to write. A `missing` or `changed` result therefore has
top-level `ok: false`, `payload.ok: true`, and an exact `payload.status`.

The first positional argument is the catalog and the second is its generated output directory;
`--check` accepts the same pair as a real build. The JSON envelope is versioned and published at
`manteen-kit/schema/command`; the ownership marker schema is `manteen-kit/schema/output`. Parse
`schemaVersion`, `command`, `ok`, `exitCode`, `mutated`, `payload`, `errors`, `notes`, and `actions`, and branch
on codes and `payload.status` rather than display text.

Author profile v2 can bind current catalog `stylesApi`, `props`, and `usage` claims to distinct
repository-contained evidence files. Each present section is exact in both directions. Generic
validation checks ownership and path containment only; it never reads or executes evidence.

## Build safely

```bash
manteen-kit build manteen.registry.json public/r --json
```

Generated output is transactionally replaced and carries `.manteen-kit-output.json`. The marker
records sorted relative filenames and hashes without timestamps or absolute paths.

Never remove the destination yourself to work around an ownership refusal. An unmarked directory
is adopted only when it is exactly one valid registry index plus its matching valid item documents.
Unknown files, nested directories, links, an invalid marker, or marker-owned drift refuse.

`--overwrite-output` permits replacement of drifted files already proven to be generated and
owned. It does not authorize unknown entries, links, invalid ownership, or unsafe destinations.

If build reports an interrupted output transaction, preserve the stage, backup, and journal while
following its deterministic recovery action. Do not delete that evidence speculatively.

For an interactive local authoring loop, run:

```bash
manteen-kit dev manteen.registry.json public/r --port 0 --jsonl
```

Wait for `ready` and `build-succeeded`, then use the returned `registryAddArgv` to preview the
consumer configuration. A failed rebuild keeps the last validated snapshot available. Stop the
foreground process cleanly; npm-owned terminal Ctrl-C emits `stopped` before exit. Do not describe
its local URL or generated output as deployed.

## Publish

Publish the generated static JSON directory with stable URLs. Verify both `registry.json` and at
least one item URL over the public transport consumers will use. Share either:

- a namespace configuration containing item and index URL templates; or
- a direct item URL for a self-contained item.

Building proves local schema and output conformance. It does not prove a hosted URL, release, or
package publication until those surfaces are checked directly.
