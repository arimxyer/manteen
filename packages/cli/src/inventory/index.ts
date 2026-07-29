/**
 * The inventory surface — one import for every command that INSPECTS.
 *
 * `list`, `info`, `diff` and `update` all read the same two things: what this
 * project has (`installed.ts`, from `manteen.lock.json`) and what a registry
 * offers (`available.ts`, from D21's per-registry `index` URL). Both readers
 * take their I/O through parameters, so a command is testable with neither a
 * network nor a filesystem, and neither reader ever writes.
 *
 * `update` is the only command here that mutates, and it does so exclusively
 * through `plan()`/`apply()`. Everything that makes `add` safe — the collision
 * gates, the version gate, the pre-image journal, temp+rename, the receipt — is
 * on that path, and a command that writes files itself gets none of it.
 *
 * `export *` rather than an enumerated list, matching `src/index.ts`: `types.ts`
 * is the sole declaration site for the inspect contract and a hand-maintained
 * re-export list is one more place for it to fall out of step.
 *
 * NOT re-exported from `src/index.ts`. That entry is the programmatic
 * plan/apply surface; whether the inspect readers join it is the integrator's
 * call, and adding them there is an edit to a pre-existing shared file.
 */
export * from "./available";
export * from "./installed";
export * from "./types";
