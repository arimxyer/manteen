# Road to a production tool

`client-build-plan.md` covers the client's phases. This covers everything else between here
and something a stranger can depend on, and how the remaining work is sequenced.

## Definition of done

"Production" is not "the phases are finished." It is all six of these:

1. **Correct** — every refusal in the plan's table is emitted and tested; no gate fails open.
2. **Complete enough to be useful alone** — install, update, inspect. A tool that can only
   install is a demo, because the second week is when you need `diff`.
3. **Portable** — Windows and macOS, npm/pnpm/yarn/bun, Node 22/24/26. Untested equals broken.
4. **Installable** — published, versioned, with a changelog and provenance.
5. **Legible** — a README that gets a stranger from zero to an installed component, and
   errors that say what to do next.
6. **Maintainable** — a linter, dependency automation, and a license file that matches what
   `package.json` claims.

Today: 1 is close, 2–6 are largely absent.

## Known gaps, by kind

**Client (planned).** Phase 4 apply surface — overwrite prompting, `--force` semantics, cancel
handling. Phase 5 `init`. Phase 6 hardening.

**Commands that do not exist.** `list`, `search`, `info` (need the per-registry `index` URL,
already in the config schema). `diff` and `update` — both unblocked now that the receipt ships,
and both are the difference between a one-shot installer and a tool you keep.

**Portability, untested.** Windows path separators, `.cmd` shims, and whether a `^` range
survives argument quoting. Node 24 and 26. Yarn PnP degrades to `undeterminable` by design but
has never run. `jsconfig`-only projects refuse — the refusal has never been read by a human.

**Distribution.** Nothing published. `workspace:*` must become a real range at publish. No
changelog, no version policy, no npm provenance.

**Project hygiene.** No `LICENSE` file although both packages declare MIT — that is a real
defect for a public repo, not a formality. No linter or formatter at all. No `SECURITY.md`,
`CONTRIBUTING.md`, dependency automation, or editorconfig. The root README still uses the
pre-rename name.

**Content.** Five registry items. Every new item exercises the client harder than a fixture
does, and a second real registry would prove multi-registry outside the test suite.

## The program

Each phase gets a workflow **designed for its shape**, not templated. The gate between phases
is a judgment call, which is exactly why they are separate runs.

| # | Workflow | Shape | Why that shape |
|---|---|---|---|
| W4 | Apply surface | narrow + deep: 2–3 agents on one seam, adversarial | Prompt/TTY/CI behaviour is where subtle bugs live. `CI=1` already nearly shipped a hang. Parallelism buys nothing; probing buys everything. |
| W5 | Command set — `list`, `info`, `diff`, `update` | wide: 4 parallel, shared receipt reader frozen first | Four genuinely independent commands over one contract. The classic freeze-then-fan-out. |
| W6 | `init` | probe-first, then per-framework parallel | Framework requirements are empirical — `ColorSchemeScript` placement and PostCSS ordering must be read off real templates, not recalled. Largest surface remaining. |
| W7 | Hardening | matrix-driven: agents per platform/runtime, findings-first | The work is discovering what breaks, not writing features. Needs real Windows CI. |
| W8 | Release | mostly sequential, small | Publish ordering, provenance, changelog, docs. Little to parallelise and high blast radius. |
| Wc | Registry content | wide, parallel per component | Independent of all of the above; can run any time. Doubles as client stress-testing. |

**Not workflow-shaped, do directly:** the hygiene set (LICENSE, linter, SECURITY, CONTRIBUTING,
dependabot, README rename). Single-file, single-concern, no discovery — a workflow would be
pure overhead.

## Sequencing and dependencies

```
Phase 3 ✔ ─> W4 apply surface ✔ ─┬─> W5 command set ✔ ──┐
                                 └─> W6 init ───────────┴─> W7 hardening ─> W8 release
Wc registry content ......... any time, independent
hygiene ..................... done, direct
```

**Done so far.** W4 closed the write seam (overwrite decision, dry-run, cancel,
failure reporting). W5 added `list`, `info`, `diff` and `update` over one frozen
inventory contract, with `update` routed through the existing `plan()`/`apply()`
rather than writing files itself. Next is W6.

W5 and W6 are independent of each other and could run back to back or as parallel tracks of one
program. W7 must follow both, because it hardens whatever exists. W8 must be last.

## On one large program workflow

`workflow()` can invoke other workflows inline, one level deep, so a program workflow *can*
chain W5 → W6 → W7 with acceptance gates between them and fail-stop at the first red.

Worth doing for **W5, W7, W8** — mechanical, well-specified, and their gates are objective
(does it publish, do the tests pass on Windows).

Worth *not* doing for **W4 and W6**. Their gates are judgment: "is this prompt flow right",
"is init good enough to hand someone." A script cannot evaluate those, and a five-hour
unattended run that goes wrong in its first hour wastes four. The probe→read→adjust loop that
made Phase 3 work depends on a human reading the probe.

## Decisions taken — 2026-07-28

- **Version policy: `0.x` until `init` lands.** Breaking changes stay cheap while the config
  shape and the `meta.mantine` surface are still moving. `1.0` is the signal that `manteen.json`
  and the receipt format are stable, and neither is yet.
- **Publish the kit ahead of the client.** It is finished, independently useful, and verified
  as a consumer install. The client then depends on a published range rather than `workspace:*`,
  which is the harder half of W8 done early and in isolation.
- **Windows is best-effort.** Not a target; say so in the README rather than implying support.
  *Caveat worth keeping visible:* being a Node tool does not make it portable by itself —
  path separators, `.cmd` shims, and argument quoting around a `^` range all differ, and the
  code already carries Windows-aware handling in places. The cheap move in W7 is one
  `windows-latest` runner: if it passes, real support is free; if it fails, the README claim is
  accurate rather than assumed.
- **`update` re-merges directly.** No confirmation diff. `mergeThemeSource` is idempotent and
  keeps existing values on conflict, and the receipt records pre-update hashes, so the operation
  is recoverable. `manteen diff` still ships for people who want to look first.

## Releasing

`.github/workflows/release.yml` publishes on a per-package tag (`manteen-kit-v0.1.0`) using
npm **trusted publishing over OIDC** — no stored token, and every published version carries a
provenance attestation.

**The first release of each package cannot use it.** A trusted publisher is configured on a
package's settings page on npmjs.com, and a package that has never been published has no
settings page. npm's docs do not cover this case; it follows from where the setting lives.

So, once per package:

1. `npm login` (in a terminal, not through an agent session — nothing about it belongs in a
   transcript).
2. `cd packages/registry-kit && npm publish --access public`.
3. On npmjs.com, add the trusted publisher: `arimxyer` / `manteen` / `release.yml`.

After that, releases are `git tag manteen-kit-v0.1.1 && git push --tags`.

The tradeoff: that first version has no provenance attestation, because provenance requires
the OIDC path. Storing an `NPM_TOKEN` just for it would reintroduce the long-lived credential
the whole setup exists to avoid, for the sake of one version.

## Carried into W7

**Test the real `clackOverwritePrompt` through a pty.** The header of
`packages/cli/e2e/apply-surface.node-e2e.mjs` states that neither tier runs it — the ~15 lines
translating a multiselect into an `OverwriteAnswer`. Everything downstream of the port's answer
is covered; the widget itself is verified only by a hand-run recipe recorded in that header.

Its stated rationale is half wrong and the file now says so. "`script(1)` is not on Windows or
macOS by default" does not justify omitting a test — the same file already carries
`{ skip: !CAN_DENY_WRITES }` two hundred lines further down. A platform guard is the answer, not
omission.

The other half is real, and the mechanism is worth writing down because it is not guessable:

> **clack renders one character at a time, redrawing the whole line between each.** So
> `"would be replaced"` never exists as a contiguous string in the pty output — every character
> is separated by a carriage return and a redraw. Waiting for the prompt's text to appear
> therefore cannot work, and a fixed `sleep` is the only reason the hand-run recipe uses one.

Readiness has to be detected some other way. Two that would:

- **Output quiescence** — wait until the pty emits nothing for ~200 ms. Still timing-based, but
  it adapts to a slow machine instead of guessing, which is the actual objection to `sleep`.
- **A terminal emulator** — parse the cursor movements and reconstruct the screen. Correct, and
  a real dependency for a dev-only test.

Quiescence plus `{ skip: process.platform === "win32" || !hasScript() }` is the recommendation:
genuine coverage on Linux and macOS, free elsewhere. This belongs in W7 rather than earlier
because pty and TTY behaviour is platform work, and W7 is when a `windows-latest` runner appears
anyway.

## Deferred, with a reason

- **Linting.** Biome (one binary, lint + format, near-zero config; `tsc --noEmit` already covers
  what type-aware ESLint rules would add). Not installed yet — adding a dependency re-resolves
  the workspace, and phase 3's agents are running against it. First task once that lands.
  *(Landed 2026-07-28; kept here because the reasoning still explains the config.)*
- **`CONTRIBUTING.md`, issue and PR templates, `SECURITY.md`.** Ceremony for an audience of one.
  Revisit if the repo gets contributors.
