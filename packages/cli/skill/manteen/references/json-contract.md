# JSON contract

## Client envelope

Every recognized client invocation with `--json` writes exactly one document to stdout and never
prompts. Schema version 2 replaces version 1 and has this shape:

```ts
interface CommandEnvelope<T = unknown> {
  schemaVersion: 2;
  command: string;
  root: string | null;
  ok: boolean;
  exitCode: number;
  mutated: boolean;
  payload: T | null;
  diagnostics: Diagnostic[];
  errors: CommandError[];
  notes: string[];
  actions: DiagnosticAction[];
}
```

Require `ok === (exitCode === 0)`. Interpret `mutated` as whether durable project bytes remain
changed when the process exits, including after rollback attempts. Do not infer mutation from a
planned write count.

Verification outcomes explicitly report `phase: "post-write-pre-commit"` and
`rollbackScope: "manteen-managed"`. Never broaden that scope to dependency installations, caches,
generated artifacts, or arbitrary project-script effects. `list --installed` is a receipt-first
offline inventory and must not be treated as live registry availability evidence.

Validate documents against the JSON schemas shipped by the installed package when durable
automation depends on them. Branch on stable codes and fields, not display text.

## Exit and refusal handling

- Exit `0`: the command's contract completed. The payload can still report an unhealthy assessment,
  an empty result, or required manual work.
- Exit `1`: planning, resolution, preflight, write, verification, or rollback refused/failed.
- Exit `2`: usage or project configuration prevented the operation.
- Exit `130`: an interactive operation was cancelled. JSON mode never prompts, so it should not
  create this outcome.

JSON mode is non-interactive, not consent. A missing decision remains a structured refusal.

Blocking diagnostics carry typed remediation actions or a manual rationale:

- `rerun`: execute the argv array directly; never join it into a shell command.
- `configPatch`: review and apply the JSON-compatible `manteen.json` patch.
- `manual`: bounded work that cannot safely be automated.

Do not automatically select the first action when it discards or overwrites user work.

Top-level `actions` is always present. A successful applicable mutating dry run returns one exact
`rerun` argv with `--dry-run` removed and the fresh `--expect-plan` attached. Discovery-only removal
without a selected candidate returns no apply action. Execute the array directly without joining or
quoting it as a shell string. Review the complete payload first; the presence of an action does not
expand user authority.

## Output and secret discipline

Parse stdout as the single JSON document. Human and verification subprocess output may be on
stderr; do not concatenate streams before parsing.

Never log, persist, or echo an expanded `${VAR}` from a registry URL. Only redacted URL forms are
safe in output, diagnostics, receipts, and plan digests. Treat `manteen.lock.json` as committed
project state and therefore as a high-severity disclosure surface.

Plan digests exclude source bodies, expanded variables, timestamps, and incidental display text.
They bind normalized roots/options/refs, redacted sources, hashes, destinations, dependency and
theme/style operations, verification definitions, and preimages. A mismatch requires a fresh
preview, not `--force`.

For `update`, treat `payload.kind` as the final outcome: `nothing-to-do`, `refused`, `previewed`,
`cancelled`, `applied`, `rolled-back`, `rollback-failed`, or `failed`. A restored verification or
write failure is `rolled-back`, not `applied`. Read `failure.kind` and `verification` for the cause.
After usage and project configuration are accepted, `payload.dryRun` echoes the invocation on every
update exit, including receipt/read failure and resolution refusal before apply. Usage/configuration
exit 2 may have `payload: null`. Never treat `receipt-unreadable` or `selection-failed` as a clean
no-op. A `rollback-failed` payload carries relative paths; restore them from version control or a
trusted pre-run copy before retrying.

A selected update with no source, dependency, theme, styles, base, or receipt work returns
`nothing-to-do` before apply. It runs no project verifier and emits no apply action; do not treat
the absence of verification evidence as an applied or verified update.
