# Manteen agent guide

Manteen is a Mantine-native component registry toolchain. `packages/registry-kit` authors and
compiles registries; `packages/cli` installs and maintains their source in consumer projects. The
repository root is also a live registry, and `apps/docs` documents the same generated `/r`
contract.

## Establish the contract first

Read these before substantial work:

- `docs/client-build-plan.md` for diagnostics and named D1-D26 decisions;
- `docs/roadmap.md` for milestone and release boundaries;
- `docs/build-process.md` for workflow, guards, and incident rules;
- `docs/w6-init-handoff.md` for initialization ownership and invariants; and
- `docs/agent-native-build-plan.md` for the frozen 0.2.1/0.6/0.7 machine contract.

Do not re-derive a documented decision from implementation details. Preserve local adaptations by
default and make destructive replacement explicit.

## Work in verified milestones

Freeze shared contracts before parallel implementation, give shared spine files one writer, then
integrate and verify sequentially. Keep generated-registry proof, local synthetic tests, built-Node
e2e evidence, and public release evidence distinct.

Use:

```bash
bun run test
bun run typecheck
bun run lint
bun run guard
bun run build:registry
bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs
```

The e2e tier must run the built bundle under real Node. The glob is required.

## Protect the workspace and user data

- Never run bare `bun install`. Relink only with `bun install --frozen-lockfile` when required.
- Never let a probe write into this repository's `node_modules`; use a temporary directory.
- Rebuild `public/r/` before trusting registry-backed docs or tests.
- Edit `manteen.registry.json` surgically; never reserialize the whole file.
- Treat `manteen.lock.json` and `.manteen/bases/` as one committed receipt-v3 state boundary.
- Never print or persist an expanded `${VAR}` from a registry URL. Use only its redacted form.
- Refuse unimplemented seams visibly. A silent no-op is indistinguishable from success.
- Prefer a mechanical guard when an invariant can be checked.

Signed tags, npm publication, and documentation deployment require separate explicit approval.
