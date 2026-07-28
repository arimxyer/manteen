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
 * `mantine-version.ts`, `provider.ts` and `styles-api.ts` are phase 3 and are
 * deliberately absent from this list rather than stubbed: a barrel line pointing
 * at a module that does not exist is a build failure, and an empty module that
 * exists is a gate that reports nothing while looking wired.
 */
export * from "./collision";
export * from "./receipt";
export * from "./report";
export * from "./resolve-mantine-install";
