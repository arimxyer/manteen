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
/**
 * W5's four commands, as their PURE CORES only.
 *
 * `buildList`, `readInfo`, `buildDiff` and `update` take their I/O as
 * parameters and return a value; they are usable from a script, a test or
 * another tool. The `run*` shells beside them are NOT exported and must not be:
 * each resolves `--cwd`, writes to `process.stdout`/`process.stderr` and returns
 * an exit code, and this module's own contract (see the header) is that
 * importing it never does any of those things. A caller that wants the shells
 * has the `manteen` binary.
 *
 * `reportDiff` is included because it is `diff`'s core under an unfortunate
 * name — it takes a `LoadedConfig` and every port, prints through injected
 * writers, and never touches the process.
 */
export { buildDiff, reportDiff } from "./commands/diff";
export { readInfo } from "./commands/info";
export { buildList } from "./commands/list";
export { update } from "./commands/update";
export { loadConfig } from "./config/load";
// `export *` rather than an enumerated list: `plan/types.ts` is the sole
// declaration site for the contract, and a hand-maintained re-export list is one
// more place for it to fall out of step. It carries values as well as types
// (`RECEIPT_FILENAME`, `RECEIPT_VERSION`), so `export type *` would drop them.
export * from "./config/types";
// The inventory contract — `Installed`, `Available`, `DiffResult`,
// `UpdateResult` and the readers behind them. Exported here rather than from
// `inventory/index.ts` itself, which is deliberately not wired into an entry
// point (the frozen contract leaves that edit to the integrator).
export * from "./inventory/index";
export { plan } from "./plan/index";
export * from "./plan/types";
