/**
 * The programmatic surface.
 *
 * `plan()` and `apply()` are the whole API: `plan()` reads disk and the network
 * and returns a fully materialized description of what would change; `apply()`
 * is a sequencer over bytes that are already in memory. A caller that wants a
 * preview calls the first and never the second.
 *
 * `src/cli/index.ts` is a separate entry and is NOT re-exported here — it has a
 * shebang, it reads `process.argv`, and it sets `process.exitCode`. Importing
 * this module must never do any of those things.
 */
export { apply } from "./apply/index";
export { loadConfig } from "./config/load";
// `export *` rather than an enumerated list: `plan/types.ts` is the sole
// declaration site for the contract, and a hand-maintained re-export list is one
// more place for it to fall out of step. It carries values as well as types
// (`RECEIPT_FILENAME`, `RECEIPT_VERSION`), so `export type *` would drop them.
export * from "./config/types";
export { plan } from "./plan/index";
export * from "./plan/types";
