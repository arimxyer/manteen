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
 * The two renderers a programmatic caller genuinely cannot do without.
 *
 * `DiffPorts.renderDiagnostic` has no default ON PURPOSE (see `createDiffPorts`)
 * — `plan()`'s diagnostics are the only channel that can explain an
 * `unavailable` item — so `reportDiff` is unusable without one, and asking every
 * caller to write it is how the CLI's output and a tool's output diverge.
 * `PROCESS_STREAMS` is here for the same reason: `DiffPorts` wants two writers.
 *
 * The rest of `cli/render.ts` stays internal. It is presentation for THIS CLI,
 * not a formatting library.
 */
export { PROCESS_STREAMS, renderDiagnostic } from "./cli/render";
/**
 * W5's four commands, as their PURE CORES only.
 *
 * `buildList`, `readInfo`, `buildDiff`, `reportDiff` and `update` take their
 * I/O as parameters and return a value; they are usable from a script, a test
 * or another tool. The `run*` shells beside them are NOT exported and must not
 * be: each resolves `--cwd`, writes to `process.stdout`/`process.stderr` and
 * returns an exit code, and this module's own contract (see the header) is that
 * importing it never does any of those things. A caller that wants the shells
 * has the `manteen` binary.
 *
 * EVERY PORT FACTORY EACH CORE NEEDS IS EXPORTED ALONGSIDE IT. That is not a
 * convenience — a function whose argument type can only be CONSTRUCTED by a
 * module the package does not expose is not part of the public API, however
 * exported it looks, and typecheck cannot tell you so. `buildList` and `update`
 * are already satisfiable (`createInstalledPorts`/`createIndexLoader` ride out
 * on the inventory re-export below; `update`'s ports are optional); the other
 * three need what follows.
 */
export { buildDiff, createDiffPorts, createFileSnapshot, reportDiff } from "./commands/diff";
export { createInfoPorts, readInfo } from "./commands/info";
export { buildList } from "./commands/list";
export { update } from "./commands/update";
export { loadConfig } from "./config/load";
// `export *` rather than an enumerated list: `plan/types.ts` is the sole
// declaration site for the contract, and a hand-maintained re-export list is one
// more place for it to fall out of step. It carries values as well as types
// (`RECEIPT_FILENAME`, `RECEIPT_VERSION`), so `export type *` would drop them.
export * from "./config/types";
export { applyInit } from "./init/apply";
export { planInit } from "./init/plan";
export { createInitApplyPorts, createInitPlanPorts } from "./init/ports";
export * from "./init/types";
// The inventory contract — `Installed`, `Available`, `DiffResult`,
// `UpdateResult` and the readers behind them. Exported here rather than from
// `inventory/index.ts` itself, which is deliberately not wired into an entry
// point (the frozen contract leaves that edit to the integrator).
export * from "./inventory/index";
export { plan } from "./plan/index";
export * from "./plan/types";
