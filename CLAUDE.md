# manteen

A Mantine-native component registry toolchain. Two packages:

- **`packages/registry-kit`** (`manteen-kit`) — authoring. You write a catalog in Mantine's
  vocabulary; it compiles to the shadcn-compatible interchange format other clients already read.
  Finished, not yet published.
- **`packages/cli`** (`manteen`) — consuming. Installs registry items into a project, and keeps
  them: `add`, `list`, `info`, `diff`, `update`. `init` is next.

The repo root is also a live registry (`manteen.registry.json` → `public/r/`), which is what the
e2e tier installs from.

## Read these before changing anything substantial

The decisions in this repo are written down **with their rationale**, and the rationale is
usually the point. Do not re-derive them from the code.

| File | Answers |
| --- | --- |
| `docs/client-build-plan.md` | What the client is and why. §1 has the refusal table — every diagnostic, its severity, whether `--force` clears it, and the exit code. §4 is D1–D25, the numbered decisions the code cites by name. §5a records later overrides. |
| `docs/roadmap.md` | What is left, in what order, and what each wave (W4–W8, Wc) is shaped like. Also the release procedure and the first-publish constraint. |
| `docs/build-process.md` | How work gets done here — the workflow shape, the guards and what each encodes, the Biome trap, and the incident rules. |

A `Dnn` in a code comment refers to §4 of the build plan. A "§1's refusal table" reference means
`docs/client-build-plan.md` line ~230.

## Commands

```bash
bun run test        # builds the kit first, then bun test — 84 tests
bun run typecheck   # runs guard-workspace, then tsc --noEmit
bun run lint        # biome check .
bun run guard       # all three guards: workspace, runtime-apis, diagnostics

# The e2e tier. Runs the BUILT bundle under real node — never bun.
bun run build:registry && bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs        # 82 tests
```

The glob is required, not stylistic: node's directory discovery only matches its own filename
patterns, and `*.node-e2e.mjs` matches none of them.

## Rules that have already cost time

- **No bare `bun install`.** It re-resolves the workspace. If a dependency genuinely needs
  adding, say so and do it once, deliberately, from the root. To repair a broken tree use
  `bun install --frozen-lockfile`, which relinks without re-resolving.
- **A probe or test that needs its own `node_modules` builds it in `mkdtemp()`, never by writing
  into this repo's.** Doing the latter once replaced eight scoped symlinks with self-loops and
  produced 168 type errors in untouched files. `scripts/guard-workspace.mjs` now catches the
  result; it cannot catch the write. `docs/build-process.md` has the incident.
- **An expanded `${VAR}` must never reach stdout, stderr, a diagnostic, a thrown message, or
  `manteen.lock.json`.** Only `redactedUrl` is safe to print. The receipt is committed to the
  user's repository and is the highest-severity leak surface of the five.
- **The e2e tier runs under `node`, against `dist/`.** Both tiers asserting the same thing under
  bun proves nothing about what ships. `scripts/guard-runtime-apis.mjs` bans Bun-only APIs in
  shipped code for the same reason.
- **Unimplemented seams refuse and name the missing module.** They never no-op — a silent no-op
  is indistinguishable from success.

Prefer a guard over a convention whenever the rule is mechanically checkable. Three exist; adding
a fourth is cheaper than a paragraph nobody reads.
