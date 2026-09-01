# manteen-kit

## Unreleased

- Replace the command envelope with schema version 2 and emit an exact reviewed scaffold apply argv
  from successful dry runs.
- Add the foreground `manteen-kit dev` watch/build/server loop with versioned JSONL events,
  transactional generated output, last-good HTTP serving, and an exact consumer registry-add argv.
- Replace author-profile v1 with v2-only bidirectional evidence ownership for Styles API, props,
  and usage claims, including cross-category evidence-path uniqueness.

## 0.2.1

- Authoring format: optional `props` — an author-documented prop surface keyed by exported
  component or hook name — and `usage` — a path to a copy-ready example module, inlined into
  the compiled item like `themeFragment` and never listed in `files`. Both ride under
  `meta.mantine` and are carried verbatim; the kit never infers documentation from source.
- Build registry output through a validated sibling stage and deterministic ownership marker.
  Unsafe paths, links, unknown files, and generated-file drift refuse; `--overwrite-output`
  authorizes only drifted marker-owned output.
- Add read-only `build --check`, structured JSON command output, and published command/output
  schemas. The programmatic API now exposes a read-only output planner and structured outcome.
- Fix `merge-theme --write --json` so JSON rendering no longer suppresses the requested write.

## 0.2.0

- Compile exact package-level stylesheet imports through the shadcn-compatible wire `css` field.
- Preserve an authored item's `docs` field in the compiled registry item instead of accepting and
  silently dropping it.

## 0.1.1

First trusted release.

This release has the same authoring API and CLI behavior as 0.1.0. It moves publication to the
repository's GitHub Actions OIDC workflow so npm can attach provenance without a stored registry
token.

## 0.1.0

First release.

Author a Mantine component registry in Mantine's own vocabulary and compile it to the
interchange format registry clients already read.

- **`manteen.registry.json`** — an authoring catalog with `kind`, `mantine`, `provider`,
  `uses`, `themeFragment` and `stylesApi`. Nothing you write mentions the wire vocabulary;
  it exists only in generated output. Unknown fields are rejected rather than dropped, so the
  authoring format cannot quietly drift toward the wire format.
- **`manteen-kit build`** — validates the catalog against the authoring schema *and* every
  emitted item against the vendored interchange schema, exiting non-zero on either. Bare
  `uses` names are qualified with the catalog's namespace, which is what stops them resolving
  against the wrong registry.
- **`manteen-kit merge-theme`** — a ts-morph codemod that composes a theme fragment into an
  existing `createTheme(...)` call. Merges `.extend()` arguments so `defaultProps` compose,
  reports conflicts rather than resolving them, never merges callback `classNames`/`styles`/
  `vars` (composing them changes runtime semantics), and preserves comments, indentation, line
  endings and comma style. Idempotent.
- **Programmatic API** — `compileRegistry`, `mergeThemeSource`, `validateCatalog`,
  `createWireValidator`, `buildIndex`, `writeRegistry`, `toWireItem`.

Mantine-only concepts the wire format has no field for ride along under `meta.mantine`, an
open object. Clients that understand it act on it; clients that do not ignore it and still
install the files correctly.

Requires Node >= 20.11. Ships as Node-compatible ESM; authoring in Bun is optional.

### Known limitation

Items are deduplicated by **destination path**, so two registries publishing an item of the
same name collide and the last one installed wins. The `manteen` client refuses on exactly
this, within a run and across runs; a generic client cannot. Namespace item names, or avoid
overlapping names across registries meant to be installed together.
