/**
 * The gate surface.
 *
 * Gates consume `ResolvedGraph` — never a `Plan` — which is what keeps them off
 * the filesystem. Anything a gate needs that requires disk (the installed
 * Mantine version, existing-destination hashes, the receipt index) arrives as a
 * separate parameter from `plan/index.ts`, which is the module that did the
 * reading. `resolve-mantine-install.ts` is the one deliberate exception and is
 * excluded from the no-fs lint rule for that reason.
 *
 * Module names are §1's, verbatim. Re-exported with `export *`, which assumes
 * the surfaces stay disjoint — a name exported by two gate modules is silently
 * dropped from this barrel rather than reported.
 *
 * `plan.ok` is NOT computed here. It belongs to `report.ts`, the aggregator,
 * which applies `--force` after every gate has spoken:
 *
 *   ok = diagnostics.every(d =>
 *     d.severity !== "error" || (d.forceable && options.force === true));
 *
 * This barrel is a SURFACE, not a runner. There is no `runGates(graph)` here and
 * there should not be: the three gates below that need disk-derived facts each
 * need a DIFFERENT one (the installed Mantine version, the existing-destination
 * hashes, a source walker), and a runner would either have to acquire them —
 * making the barrel impure — or take them all as parameters, which is exactly the
 * call site `plan/index.ts` already is. Composition stays there.
 *
 * Order of composition is not observable, which is worth knowing before anyone
 * spends effort on it: `aggregate` runs every diagnostic through
 * `sortDiagnostics`, whose key is (severity, code, path, items, message) — a
 * total order over anything two gates can produce. Push order leaks nowhere.
 *
 * `src/fs/walk.ts` is deliberately NOT re-exported. It is the impure port
 * `provider.ts` takes as a parameter; surfacing it from the gate barrel would
 * invite a gate to import the walker instead of receiving one.
 */
export * from "./collision";
export * from "./mantine-version";
export * from "./provider";
export * from "./receipt";
export * from "./report";
export * from "./resolve-mantine-install";
export * from "./styles-api";
