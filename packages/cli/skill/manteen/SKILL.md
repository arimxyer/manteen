---
name: manteen
description: Inspect, install, update, and remove Mantine registry components with the Manteen CLI, or author and validate a Manteen registry with manteen-kit. Use for repositories containing manteen.json, manteen.lock.json, .manteen/bases, or manteen.registry.json; for requests involving Manteen registry refs, component discovery, safe update planning, registry publication, or Manteen JSON automation.
---

# Manteen

Use Manteen's plans and receipts as authority. Do not infer ownership from a filename or edit
`manteen.lock.json` or `.manteen/bases/` by hand.

Examples below use the logical command `manteen`. Resolve the project-installed binary through the
declared package manager without permitting a transient package download; the consumer reference
has exact runner forms.

1. Read the nearest applicable `AGENTS.md` files or equivalent repository instructions. For
   consumer work inspect `manteen --version`; for authoring inspect `manteen-kit build --help`.
   Always inspect the relevant command's local `--help` before relying on a documented flag.
2. Prefer `--json` for automation. Treat JSON mode as non-interactive, not as consent.
3. Inspect before changing: use `status`, `list`, `info`, or `diff` as appropriate.
4. Preview mutations with `--dry-run`. When the installed version returns a `planDigest`, apply
   the reviewed plan with the same arguments plus `--expect-plan <digest>`.
5. Supply destructive flags only when the user explicitly chose that consequence. Never use
   `--force`, `--overwrite`, `--take-upstream`, `--discard-adapted`, or `--take-packaged` as a
   generic retry.
6. If a documented command or flag is absent from local help, follow the installed CLI's surface;
   do not fabricate support from a newer contract.

Read exactly the reference needed for the task:

- Consumer discovery, installation, maintenance, or skill installation: [consumer.md](references/consumer.md)
- Registry catalog authoring, building, and publishing: [authoring.md](references/authoring.md)
- JSON envelopes, exit codes, remediation, and secret handling: [json-contract.md](references/json-contract.md)
