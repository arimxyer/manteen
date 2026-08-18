# Plan scope

`plan()` may read the project and registry network, but it never writes. It resolves, validates,
hashes, gates, and materializes everything `apply()` may do so preview and refusal remain
zero-mutation operations.

## Invariants

- `types.ts` is the sole declaration site for the registry plan/apply cross-stage contract.
- `resolve()` has no filesystem or network access. Disk-derived hashes, existing state, receipts,
  dispositions, verification definitions, and plan digests enter at the planning layer.
- `plan.ok` gates `apply()`. A check that should refuse user input belongs in planning at error
  severity; apply-time equivalents are tripwires for broken wiring, not alternate policy.
- A new `DiagnosticCode` needs a `DIAGNOSTIC_CODES` row, emitter, documentation row, and test.
- Absence and read failure are different. Catch only the filesystem errors whose absence semantics
  are intentional and let permissions or unexpected I/O failures surface.
- `registry-source.ts` owns expanded request data and `redactedUrl`. Only redacted data may reach a
  diagnostic, stored plan, digest, envelope, receipt, or thrown user-facing message.
- `loader-http.ts` is the registry HTTP seam. Keep network behavior out of pure resolver and graph
  modules.
- `destination-exists` is add's interactive decision surface. Diff/update/remove must retain their
  own explicit planning semantics rather than reaching that prompt accidentally.
- Line diff3 remains the first ordinary update path. The TypeScript AST fallback is automatic,
  read-only, exact-source-splicing, and conservative; ambiguity preserves the original conflict.

The guarded refusal table and cumulative decisions are in
`../../../../docs/client-build-plan.md`; the agent-native digest and machine contracts are in
`../../../../docs/agent-native-build-plan.md`.
