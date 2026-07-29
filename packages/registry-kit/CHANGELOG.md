# manteen-kit

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
  `vars` (composing them changes runtime semantics), and preserves comments, indentation and
  comma style. Idempotent.
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
