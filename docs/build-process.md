# How this repo gets built

`docs/contracts/client-build-plan.md` says *what* to build. This says *how*, because most
of the defects so far came from the process rather than the design.

## Phases are shaped, not just sequenced

Each phase of the client is built by a multi-agent workflow with the same shape:

```
contract freeze (solo) → implement (parallel) → integrate (solo) → verify (after)
```

**Contract freeze runs alone.** One agent writes the shared types, schema, and
error vocabulary. Everything downstream imports it and is forbidden to edit it.
Agreement is bought sequentially so code can be written in parallel — otherwise
six agents negotiate the same contract six different ways and integration turns
into archaeology.

**Implementers own disjoint files.** Each is given an explicit list of files it
alone may create. Separate files in one tree never collide, so no git worktrees
and no merge step. Anything that edits a *pre-existing shared* file — wiring a
new module into `plan/index.ts`, touching CI — belongs to the integrator.

**Reviewers run after integration, never alongside.** Learned the hard way: a
reviewer run concurrently with the integrator reported "the package does not
build" about a tree that was mid-repair, and both its blocking claims were
already fixed. A review of a moving target is worth nothing.

**Briefs must name verified facts and demand verification of the rest.**
Library behaviour in a brief should be probed, not remembered, and reviewers are
told to check every named API against the real `.d.ts`. This has caught errors
that originated in the brief itself twice.

## Guards, not vigilance

Seven checks encode rules that a reader could otherwise silently break:

- `scripts/guard-workspace.mjs` — every symlink under a `node_modules` resolves
  and does not point at itself. Runs in front of `tsc` in the `typecheck` script
  and immediately after `bun install` in CI. See the incident below; unlike the
  others, its value is the message rather than the detection.
- `scripts/guard-deps.mjs` — every name in `dependencies` or `devDependencies`
  of every workspace manifest is actually installed. The pair above is the
  distinction to keep straight: `guard-workspace` asks whether the links that
  exist resolve, this asks whether the ones that should exist are there. It is a
  separate file for the reason `guard-workspace` gives in its own header — that
  guard sits in front of `tsc` and must stay in the milliseconds — so this one
  runs in `guard` only, never in `typecheck`.

  The gap it closes is structural rather than accidental, and worktree isolation
  is what creates it: a branch that adds a dependency inside a worktree commits
  the declaration through `package.json` and `bun.lock` while the install lands
  in that worktree's gitignored `node_modules` and dies with it. A JS import
  then fails loudly under `tsc`, but a CSS `@import` resolves through no
  typechecker at all, so it clears every check and appears as a bare 500 from
  the dev server. Presence only — versions stay with `bun install
  --frozen-lockfile`, and `peerDependencies` and `optionalDependencies` are
  skipped because absent is legal for both. Note that CI cannot fail on this:
  every job installs from the lockfile first, so green CI says nothing about
  whether a local checkout is complete.
- `scripts/guard-runtime-apis.mjs` — two checks sharing one walk. The rules
  proper are below; `checkText` additionally bans **raw control characters**
  anywhere in scanned source. That is not pedantry: a literal NUL byte makes a
  file `data` rather than text, and **grep then skips the whole file silently**
  — no match, no warning, no hint that it was never searched. Two files here had
  one, both using NUL legitimately as a composite-key separator but written as a
  literal byte instead of `\u0000`; identical at runtime, invisible to review.
  It cannot be one of the line-based rules, because those skip prose and a
  control character in a comment blinds grep exactly as much as one in code.

  The rules proper are repo-wide, which is why this lives at the root rather
  than inside a package, and are **per scope**: shipped code (`packages/*/src`,
  `packages/cli/e2e`) may not use `import.meta.dir`, `Bun.*` or `bun:`
  specifiers, while the `bun test` tier is held only to the first, since it
  imports `bun:test` by design. `import.meta.dir` is `undefined` under Node and
  shipped as a real bug once — written in a test file and copied into src, which
  is why the portable-spelling rule spans both tiers.
  It self-tests its own lookahead so the regex cannot rot into a no-op, and
  skips lines that *begin* as comments so documenting a banned API does not trip
  the ban. Only the leading form: stripping from a mid-line `//` would blind it
  after any string containing `://`, and a false negative in a guard is worse
  than a flagged trailing comment.
- `scripts/guard-house-styles-api-evidence.mjs` — every item/component claim in the house
  catalog's `stylesApi` declarations has exactly one entry in
  `house-styles-api-evidence.json`, and every map entry points back to a current claim. Evidence
  paths must be canonical, repository-relative ordinary files, and one file cannot be reused for
  several claims. Each path must also match the root's plain `bun test` discovery surface:
  `*.test.*`, `*_test.*`, `*.spec.*`, or `*_spec.*` with a Bun-supported JavaScript or TypeScript
  extension (`js`, `jsx`, `ts`, `tsx`, `mjs`, `cjs`, `mts`, or `cts`), outside hidden and
  `node_modules` directories. The guard pins the root test script and absence of
  discovery-changing `bunfig.toml` configuration so that invariant cannot silently drift. This
  checks declaration/evidence ownership and test-runner inclusion only: it never reads test
  contents or claims that their assertions passed. The normal test runner owns behavioral proof.
- `packages/cli/scripts/guard-diagnostics.mjs` — every `DiagnosticCode` is
  emitted somewhere or explicitly listed as pending. A specified refusal with no
  emitter reads exactly like a forgotten one. The pending list is required to
  *shrink*: a code that gains an emitter while still listed fails as loudly as
  one that goes missing.
- `scripts/guard-release.mjs` — both publishable manifests carry exact repository,
  license, changelog and provenance metadata; no `workspace:` protocol can reach
  npm; and the release workflow stays on the pinned credential-free toolchain.
  The tag-specific form additionally binds one tag to one package version and
  inspects the built `npm pack --dry-run` file surface before publication. It
  also keeps Pages on an explicit dispatch so a registry contract cannot deploy
  before the npm client that understands it.
- `scripts/guard-ci.mjs` — the pull-request classifier remains fail-closed and
  independent of quality, the portability jobs wait only for that classifier,
  and the stable CI gate observes every result. It also freezes the complete
  portability matrix, the two complete Windows e2e shards, and exact global Bun
  package-cache keys while refusing any `node_modules` cache or fallback key.
  This makes CI critical-path optimizations prove that they changed orchestration
  rather than silently narrowing verification.

Prefer a guard over a convention whenever the rule is mechanically checkable.

## Agents must never write into this repo's `node_modules`

On 2026-07-29 a W5 agent staged a mirror `node_modules` for an isolated probe by
symlinking each entry to its absolute path in this repo. An early version of that
script wrote into **this repo's** `node_modules` rather than the scratch copy,
replacing eight scoped entries with links pointing at themselves:

```
node_modules/@types/bun -> /abs/path/to/node_modules/@types/bun
```

`tsc` then reported 168 errors across 20 files, including files nobody had
touched, because the Node and Bun ambient types had silently disappeared.
Several agents spent half an hour treating that as a code defect.

Two things made the diagnosis slower than it should have been, and both are
worth remembering:

- **The damage was scoped-only.** `@types`, `@mantine`, `@tabler` and `@biomejs`
  broke; `react`, `typescript` and `shadcn` did not. A scope adds one path level,
  and that is what the staging script computed wrongly — so the *shape* of the
  damage identified the actor once anyone looked at it.
- **It was misattributed to `bun install`.** That theory is disprovable from
  evidence: an install rotates `.old_modules`, refreshes `node_modules/.bin` and
  touches the `.bun` store, and none of those had changed. Only the eight scoped
  links had. When a tree looks corrupted, read the mtimes before naming a cause.

The rule: **a probe or e2e that needs its own `node_modules` builds it inside
`mkdtemp()`, never by writing into the repo.** The existing e2e tier already does
this correctly and is the pattern to copy. `guard-workspace.mjs` exists to make
the next occurrence cost one line instead of an afternoon — it cannot prevent the
write, only stop it from masquerading as a type error.

The repair, for the record, is `bun install --frozen-lockfile`. Frozen relinks
without re-resolving, so a repair cannot drift the lockfile as a side effect.

## Parallel agents partition by file, not by task

When a batch of independent fixes is fanned out to concurrent agents, the natural
split — one agent per defect — is wrong here, because defects pile up in shared
files. On 2026-08-04 a fifteen-item defect list mapped onto **five** files: four
separate entries lived in the playground shell, three more in `custom.css`.
One-agent-per-defect would have put four agents inside one stylesheet.

Partition by **file ownership** instead, then hand each partition whatever items
happen to fall inside it. Groups come out lopsided — two entries in one, six in
another — and that is correct.

The failure this prevents is silent. Edits are exact-string replacements, so two
agents working in different regions of one file usually both survive; the
destructive case is a full-file write of content read *before* another agent's
change landed, which discards it with no error anywhere. The quieter case is
semantic: two agents "fixing" the same rule in opposite directions, where the one
whose verifier already signed off is now signed off on a state that no longer
exists.

Ownership is an instruction, not a lock — nothing enforces it. So verify it
afterwards: map every path in `git status` back to the agent permitted to touch
it, and fail loudly on anything unowned. Nothing is committed until that check
passes, which keeps the blast radius at uncommitted working-tree changes.

The same reasoning forbids two concurrent workflows appending to
`manteen.registry.json`. Shared spine files — that catalog, `tsconfig.json` —
get a **single serialized writer**, never a fan-out. Fan out the per-item work,
have each agent *describe* what the spine needs, and let one writer apply it.

## Briefing agents that drive a browser

Two failure modes have cost real time, both of which produce findings that look
like product defects:

- **Shell-mangled input.** An agent typed `$99,999` into a demo control through a
  double-quoted shell argument; zsh expanded `$99` as a positional parameter and
  the page received `,999`. The agent filed "component truncates long values."
  Brief agents to single-quote any data they type into a page, and to suspect
  their own command before filing a defect — mangled input resembles a real bug
  far more than it resembles a mistake.
- **Tooling that does not dispatch real events.** Clearing a debounced input by
  setting its value to `""` left a stale filter in place and read as a stuck
  control; a real select-all-plus-backspace behaved correctly.

Both were caught only because every finding was re-verified by an agent whose job
was to refute it. Fan-out without an adversarial verify stage ships this class of
mistake straight into the report.

## Linting

Biome, one binary for both lint and format. `tsc --noEmit` already covers type
correctness, so the type-aware rules ESLint would add are largely redundant here.

`biome.json` is pure JSON with no comments — **comments inside arrays make it fail to
parse, and Biome then silently falls back to its defaults** rather than erroring loudly. That
is a bad failure mode: a `--write` run under defaults reformatted the whole repo with tabs and
ignored every rule override. Verify a config change with `biome check biome.json` before
letting it write anything.

Three rules are off, each because the codebase does the flagged thing on purpose:

| Rule | Why |
| --- | --- |
| `noTemplateCurlyInString` | `${VAR}` in a plain string *is* the redaction design — a registry URL keeps the literal `${TOKEN}` so the expanded secret never reaches a diagnostic. |
| `useLiteralKeys` | Every hit is a `Record<string, unknown>` read while parsing untrusted JSON. `root["lockfileVersion"]` says "dynamic data of unknown shape". |
| `noConsole` | A CLI writes to stdout and stderr; that is its job. |

Everything else that fires is either fixed or carries a `biome-ignore` naming the reason.
Prefer a targeted ignore over switching a rule off globally — the rules that flagged an
`exec()` loop and an index key on fixed-length placeholders catch real bugs elsewhere.

## Verification

A phase is done when its behaviour is observable, not when it compiles.

- Run the built `dist/` under real `node`, never under bun. The runtime that
  ships is the runtime that must be tested.
- Run the literal command locally before putting it in CI — including from a
  clean state when it touches generated or gitignored files. Both CI failures so
  far were unverified steps that took seconds to reproduce locally.
- **Actually invoke the CLI.** Every behaviour defect found so far — a
  `createPathsMatcher` + `baseUrl` trap, a URL mangled by `relative()`, a `--pm`
  flag named by an error message but never registered — came from running it,
  not from reading it. Reviews find architecture problems; execution finds the
  ones that reach a user.
- Unimplemented seams **refuse**, naming the missing module. They never no-op,
  because a silent no-op is indistinguishable from success.

## Packing at the Node floor

Both package configs are `tsdown.config.mjs`, and both build/prepare scripts pass
`--config-loader native`. Keep those three facts together. tsdown 0.22's automatic loader chooses
the optional `unrun` peer on Node 22.12, while newer Node releases can load TypeScript config
natively. The result was a package that built under the maintainer's Node 26 but failed inside
`npm pack` at the client's declared minimum. Plain ESM config plus the explicit native loader makes
the prepare path identical across Node 22.12, 24 and 26 without adding a loader whose own engine is
above the client floor.
