# Init scope

`init` changes consumer-owned project infrastructure, not registry-owned items. It therefore keeps
an init-specific plan/apply contract and never invents item ids, wire lineage, or
`manteen.lock.json` ownership for initialization files.

## Invariants

- `types.ts` is the sole init cross-stage contract. Planned mutations contain absolute
  destinations, final UTF-8 text, final hashes, preimage hashes, and `create`/`update`
  dispositions.
- `InitPlan.files` and `.dependencies` contain mutations only. An idempotent second run has both
  arrays empty; required Tailwind or manual instructions may repeat separately.
- Detection returns one of the finite framework sets. Next hybrid is the only two-adapter shape and
  always orders App before Pages. React Router detection precedes generic Vite detection.
- Adapters receive a finite source snapshot and never import `node:fs`.
- Planning reads but never writes. Apply rechecks every preimage, asks at most one all-or-nothing
  confirmation, installs dependencies, rechecks after lifecycle scripts, and writes through one
  shared journal.
- Dry-run performs the read-only proofs but never confirms or installs.
- A required manual instruction is successful but incomplete: `ok: true`, `complete: false`, exit
  zero. It is neither a warning nor hidden success.
- A package-manager operation and an exact-byte patch may not both own `package.json` in one run;
  that collision refuses before mutation.
- Existing authored framework structure is patched only through proven seams. Unsupported or
  ambiguous shapes refuse with actionable diagnostics instead of replacing entry files wholesale.

The approved boundary and historical implementation evidence are in
`../../../../docs/w6-init-handoff.md`.
