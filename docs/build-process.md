# How this repo gets built

`docs/client-build-plan.md` says *what* to build. This says *how*, because most
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

Two checks encode rules that a reader could otherwise silently break:

- `scripts/guard-runtime-apis.mjs` — repo-wide, so it lives at the root rather
  than inside a package. Rules are **per scope**: shipped code (`packages/*/src`,
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
- `packages/cli/scripts/guard-diagnostics.mjs` — every `DiagnosticCode` is
  emitted somewhere or explicitly listed as pending. A specified refusal with no
  emitter reads exactly like a forgotten one. The pending list is required to
  *shrink*: a code that gains an emitter while still listed fails as loudly as
  one that goes missing.

Prefer a guard over a convention whenever the rule is mechanically checkable.

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
