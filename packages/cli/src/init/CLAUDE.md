# init/ — W6 project initialization

`init` modifies project infrastructure, not registry-owned items. Its plan is deliberately separate
from `plan/types.ts`: no fake item ids, no wire lineage and no `manteen.lock.json` ownership records.

## Frozen boundary

- `types.ts` is the sole cross-stage contract. Mutation entries contain absolute destinations,
  final UTF-8 text, final hashes, pre-image hashes and `create`/`update` dispositions.
- `InitPlan.files` and `.dependencies` contain mutations only. A second idempotent run has both
  arrays empty; required Tailwind/manual instructions may still repeat separately.
- Detection returns one of five legal adapter sets. Only Next hybrid has two adapters, always App
  then Pages. React Router framework detection runs before generic Vite detection.
- Adapters receive a finite source snapshot and never import `node:fs`.
- Plan may read but never writes. Apply re-hashes every destination, asks at most one all-or-nothing
  confirmation, installs dependencies, then writes every file through one shared journal.
- Dry-run performs preflight but never calls the confirmation or install ports.
- A required manual instruction is successful-but-incomplete: `ok: true`, `complete: false`, exit 0.
  It is not a warning or a hidden success.

## Ownership after contract freeze

Framework workers own only their adapter and adapter tests. The integrator owns detection, shared
config/theme/PostCSS planning, plan/apply orchestration, CLI wiring, exports, schemas and e2e.
