# manteen

A Mantine-native component registry toolchain. Two packages:

- **`packages/registry-kit`** (`manteen-kit`) — authoring. You write a catalog in Mantine's
  vocabulary; it compiles to the shadcn-compatible interchange format other clients already read.
  Published on npm as `manteen-kit@0.2.0`.
- **`packages/cli`** (`manteen`) — consuming. Installs registry items into a project, and keeps
  them: `init`, `add`, `list`, `info`, `diff`, `update`. Published on npm as `manteen@0.2.0` with
  provenance; W4–W8 (apply surface through release) are all complete — see `docs/roadmap.md`.

The repo root is also a live registry (`manteen.registry.json` → `public/r/`), which is what the
e2e tier installs from. `apps/docs` is the deployed Starlight documentation site — a registry
browser and authoring/sharing guide over that same `/r` contract.

## Read these before changing anything substantial

The decisions in this repo are written down **with their rationale**, and the rationale is
usually the point. Do not re-derive them from the code.

| File | Answers |
| --- | --- |
| `docs/client-build-plan.md` | What the client is and why. §1 has the refusal table — every diagnostic, its severity, whether `--force` clears it, and the exit code. §4 is D1–D25, the numbered decisions the code cites by name. §5a–§5b record later overrides. |
| `docs/roadmap.md` | What is left, in what order, and what each wave (W4–W8, Wc) is shaped like. Also the release procedure and the first-publish constraint. |
| `docs/build-process.md` | How work gets done here — the workflow shape, the guards and what each encodes, the Biome trap, and the incident rules. |
| `docs/w6-init-handoff.md` | W6's settled boundary, probe receipts, approved decisions, frozen contract and implementation ownership. |

A `Dnn` in a code comment refers to §4 of the build plan. A "§1's refusal table" reference means
`docs/client-build-plan.md` line ~230.

## Commands

```bash
bun run test        # builds the kit first, then bun test
bun run typecheck   # guard-workspace, then tsc --noEmit, then astro check for apps/docs
bun run lint        # biome check .
bun run guard       # all three guards: workspace, runtime-apis, diagnostics

# The e2e tier. Runs the BUILT bundle under real node — never bun.
bun run build:registry && bun --cwd=packages/cli run build
node --test packages/cli/e2e/*.node-e2e.mjs
```

The glob is required, not stylistic: node's directory discovery only matches its own filename
patterns, and `*.node-e2e.mjs` matches none of them.

## Rules that have already cost time

- **No bare `bun install`.** It re-resolves the workspace. If a dependency genuinely needs
  adding, say so and do it once, deliberately, from the root. To repair a broken tree use
  `bun install --frozen-lockfile`, which relinks without re-resolving. A package runner breaks
  this rule without ever typing it: `bun x astro check` ignored the linked copy, downloaded its
  own `astro`, re-resolved, wrote `bun.lock`, then prompted interactively to install a
  dependency. Run workspace tools as `./node_modules/.bin/<tool>` or `bun --cwd=<pkg> run
  <script>`.
- **A fresh checkout serves a stale site until you rebuild it.** `public/r/` is generated and
  gitignored, so a clone or a worktree renders whatever catalog was last built *there* — or a
  partial one — with no error anywhere. Run `bun run build:registry` before trusting anything the
  docs site shows. The same applies to `node_modules`: if it predates `apps/docs`, `astro` is
  simply absent; repair with `bun install --frozen-lockfile`. (Cost: a catalog emitting 5 of 16
  detail links, every `mantine-ui` route 404ing, diagnosed as a site defect.) Merging a worktree
  branch home and deleting the worktree is the same trap from the other end: a dependency added
  there arrives in `package.json` and `bun.lock` with the merge, but was only ever *linked* into
  the worktree's tree — so it is declared here and absent here. **`bun run guard` now catches this**
  — `scripts/guard-deps.mjs` names the package and the manifest — so relink with `bun install
  --frozen-lockfile` and move on. It needed a guard because the failure is silent: a JS import
  fails loudly under `tsc`, but no typechecker resolves a CSS `@import`, so before this a missing
  style package cleared `test`, `typecheck`, `lint` and `guard` alike and first appeared as an
  opaque dev-server 500. `bun run build:site` also catches it, at the cost of a full build. CI never
  sees it at all — every job begins with `bun install --frozen-lockfile` on a clean runner, so green
  CI is no evidence your tree is complete. And `astro dev` is a daemon — a second one no-ops rather
  than starting — so read `astro dev logs`, never the response body. (Cost:
  `@fontsource-variable/figtree` unlinked after a merge; every hero route 500ing behind a 71-byte
  page.)
- **Edit `manteen.registry.json` surgically, never by re-serializing.** `JSON.parse` → mutate →
  `JSON.stringify` turns a six-line addition into a 163-line diff, because the file's formatting
  is not what `stringify` emits. Use a targeted text edit and check `git diff --stat` before
  trusting it. It is also a shared spine file: when work is fanned out, exactly one writer
  touches it.
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

Prefer a guard over a convention whenever the rule is mechanically checkable. Five exist; adding
a sixth is cheaper than a paragraph nobody reads. `guard-deps.mjs` is the worked example — it
started life as the paragraph above it, which is exactly the outcome this line warns against.
