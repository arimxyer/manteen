# plan/ — decide everything, write nothing

`plan()` may read the disk and the network. It may **never** write. Everything a run will do is
settled here, so that `apply()` is a thin executor and a refusal costs nothing.

That purity is the reason `--dry-run` is honest and the reason a cancelled run leaves no trace.
Breaking it does not fail a test; it removes the property the design is built on.

## Files

| File | Role |
| --- | --- |
| `index.ts` | The orchestrator. Resolve → fetch → validate → hash → gate → assemble a `Plan`. |
| `types.ts` | `Plan`, `PlanOptions`, `PlannedFile`, `Disposition`. |
| `diagnostics.ts` | `DIAGNOSTIC_CODES` — §1's refusal table as data. Severity, forceability, exit code, per code. |
| `ref.ts` | Parses `@ns/name` into a `CanonicalId`. Bare names never resolve against ui.shadcn.com. |
| `registry-source.ts` | Turns a configured registry into a request. Owns `redactedUrl`. |
| `loader-http.ts` | The **only** module permitted to call `fetch`. |
| `loader-local.ts` | `file:` registries. |
| `validate-item.ts` | Wire schema + `meta.mantine`. |
| `resolve.ts`, `graph.ts`, `deps.ts` | Transitive `registryDependencies`, cycles, npm dep merging. |
| `theme-fold.ts` | Decides the theme merge. Does not perform it. |

## Invariants

**`plan.ok` gates `apply()`.** `apply()` returns at its first line when `plan.ok` is false. Any
check that must stop a run belongs here at error severity — not in apply, where the equivalent
check is an unreachable tripwire whose message is addressed to whoever broke the wiring.

**A new `DiagnosticCode` needs a row in `DIAGNOSTIC_CODES`, an emitter, and a test.** The type
forces the row; `guard-diagnostics` forces the emitter. Nothing forces the test but you.

**`destination-exists` short-circuits on `options.overwrite !== undefined`.** Either flag skips
it. That one line is why `diff` (which passes `overwrite: true`) can never emit it, and why
`add`/`update` can. Interactive runs get the same code at `info` severity, because a prompt is
coming.

**Absence is not the same as failure.** `preflight.ts`'s rule applies here too: catch the error
code you mean (`ENOENT`, `EISDIR`) and let everything else throw. A blanket catch turns a
permissions problem into "the file isn't there" and plans a write that will fail.

**Secrets.** `registry-source.ts` produces both an expanded URL and a `redactedUrl`. Only the
latter may appear in a diagnostic, a message, or the receipt. Note `new Headers()` throws with
the offending value *verbatim* on a malformed auth header — construct headers where you can
still catch that.
