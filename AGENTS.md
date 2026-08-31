# Manteen agent guide

This is the repository-wide agent contract. `CLAUDE.md` imports it. Scoped directories may add
their own `AGENTS.md` for durable local invariants and a same-directory `CLAUDE.md` that imports
it; local guidance supplements this file rather than restating it.

Manteen is a Mantine-native component registry toolchain. `packages/registry-kit` authors and
compiles registries; `packages/cli` initializes consumer projects and installs and maintains their
source. The repository root is also the live `@house` registry.

## Establish current context first

Start with [`docs/project-context.md`](docs/project-context.md). It separates live contracts,
current status, historical decision records, and release evidence. Before substantial
implementation work, read the documents it marks as authoritative for that scope; do not
reconstruct a documented decision from implementation details.

`apps/manteen` is the repository's only documentation application. It uses Next.js and Fumadocs,
is checked in CI, and has no deployment workflow. The retired Astro/Starlight application was
deleted without migrating its implementation or content into Fumadocs.

Preserve the evidence boundary: a local or CI site build is not public deployment proof, and a
generated `public/r/` tree is not proof that those bytes are hosted anywhere.

## Work in verified milestones

Freeze shared contracts before parallel implementation, give shared spine files one writer, then
integrate and verify sequentially. Keep generated-registry proof, local synthetic tests, built-Node
e2e evidence, hosted CI evidence, and public release/deployment evidence distinct.

Use the smallest relevant verification set, expanding to the full sequence for shared contracts or
release candidates:

```bash
bun run test
bun run typecheck
bun run lint
bun run guard
bun run build:registry
bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs
```

The e2e tier must run the built bundle under real Node. The glob is required. The documentation
application has separate commands:

```bash
bun run site:check   # Next/Fumadocs type generation + TypeScript
bun run site:build   # Next/Fumadocs production build
```

## Protect the workspace and user data

- Never run bare `bun install`. Relink only with `bun install --frozen-lockfile` when required.
- Never let a probe write into this repository's `node_modules`; use a temporary directory.
- Rebuild `public/r/` before trusting registry-backed docs or tests.
- Edit `manteen.registry.json` surgically; never reserialize the whole file.
- Treat `manteen.lock.json` and `.manteen/bases/` as one committed receipt-v3 state boundary.
- Never print or persist an expanded `${VAR}` from a registry URL. Use only its redacted form.
- Refuse unimplemented seams visibly. A silent no-op is indistinguishable from success.
- Prefer a mechanical guard when an invariant can be checked.
- Preserve unrelated working-tree changes and identify the permitted owner of every changed path.

## Keep contracts in their owning source

- Package versions belong in `packages/*/package.json`; public-version claims require a release
  receipt.
- Diagnostics belong in `packages/cli/src/plan/diagnostics.ts` and the guarded refusal table in
  `docs/contracts/client-build-plan.md`.
- Cross-stage init types belong in `packages/cli/src/init/types.ts`; the approved boundary is in
  `docs/handoffs/w6-init-handoff.md`.
- Agent-native JSON, plan-digest, SDK, and packaged-skill behavior is frozen in
  `docs/contracts/agent-native-build-plan.md`.
- Current priorities and open work belong in `docs/roadmap.md`; completed handoffs are evidence,
  not backlogs.

Do not copy volatile counts, versions, phase lists, or file inventories into agent instructions.
Point to the owning source instead so one update cannot leave several plausible truths behind.

Signed tags, npm publication, GitHub releases, and any documentation or registry deployment require
separate explicit approval.
