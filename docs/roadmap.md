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

Today: all six criteria are implemented through the public `0.2` line. W6 `init` is complete
through its built-Node acceptance tier, W7 closed with a green hosted runtime, OS and
package-manager matrix, W8 established provenance-bearing releases, and `0.2.0` publicly carries
the managed-styles and registry-content stress-case contract.

## Known gaps, by kind

**Client.** W4's apply surface, W5's command set, W6 `init`, and W7 portability hardening are
complete. The findings and hosted closure receipt are recorded in
[`w7-hardening-handoff.md`](w7-hardening-handoff.md).

**Commands.** `init`, `add`, `list`, `info`, `diff` and `update` ship. `search` does not exist and
is not currently assigned to a wave; whether it belongs in v1 remains undecided.

**Portability.** The built tier passes on Linux Node 22.12, 24 and 26 plus macOS and Windows at the
Node floor. Packed npm, pnpm, Yarn PnP and Bun consumers pass, including the native Windows
`.cmd`/caret path. The macOS image lacks a usable supported `script(1)` invocation, so its pty cases
skip with that named reason while Linux supplies the positive 3/3 pty probe. `jsconfig`-only
projects refuse — the refusal has never been read by a human.

**Distribution.** `manteen-kit@0.2.0` and `manteen@0.2.0` are public on npm as `latest`. Both were
published from the tagged GitHub Actions OIDC workflow and expose npm publish plus SLSA provenance
attestations. The initial trusted-release receipts are in the
[`W8 release handoff`](w8-release-handoff.md); the current package, Pages and public-consumer
receipts are in the [`0.2 release handoff`](v0.2-release-handoff.md).

**Project hygiene.** The MIT license, Biome, Dependabot, editorconfig and rename are done.
`SECURITY.md` and contributor ceremony remain deliberately deferred until the repository has
outside contributors.

**Content.** The catalog now has 14 items: the original five, a shared upstream-license item and
eight adapted Mantine UI components/blocks. The initial six-item tranche and the Carousel/Dropzone
extension stress cases compile, install and production-build in disposable consumers; their exact
evidence and non-evidence are recorded in the [`Wc handoff`](wc-registry-content-handoff.md). The
[`required-global-styles contract`](global-styles-handoff.md) is implemented, released and accepted
through a fresh public npm-plus-HTTPS Vite consumer. A
[`second hand-authored live registry`](second-registry-handoff.md) also passes discovery, install,
build and maintenance under two consumer-selected namespaces. Broader cross-framework visual
acceptance remains. Every new item exercises the client harder than a fixture does.

## The program

Each phase gets a workflow **designed for its shape**, not templated. The gate between phases
is a judgment call, which is exactly why they are separate runs.

| # | Workflow | Shape | Why that shape |
|---|---|---|---|
| W4 | Apply surface | narrow + deep: 2–3 agents on one seam, adversarial | Prompt/TTY/CI behaviour is where subtle bugs live. `CI=1` already nearly shipped a hang. Parallelism buys nothing; probing buys everything. |
| W5 | Command set — `list`, `info`, `diff`, `update` | wide: 4 parallel, shared receipt reader frozen first | Four genuinely independent commands over one contract. The classic freeze-then-fan-out. |
| W6 | [`init`](w6-init-handoff.md) | complete: probe → checkpoint → contract → per-framework adapters → integration → built-Node review → disposable dogfood | The adapters preserve generated work; the shared plan/apply boundary makes dry-run, cancellation, install failure and rollback observable; required Tailwind/manual work is separate from mutations; fresh config is list-ready. |
| W7 | [`Hardening`](w7-hardening-handoff.md) | complete: matrix-driven, findings-first, hosted retry | Real Windows and macOS CI exposed path and line-ending defects that local Linux could not. |
| W8 | [`Release`](w8-release-handoff.md) | complete: both `0.1.1` packages published through tagged OIDC with provenance | Publish ordering, provenance, changelog, docs. Little to parallelise and high blast radius. |
| Wc | [`Registry content`](wc-registry-content-handoff.md) | ongoing: small curated tranches | Independent of all of the above; doubles as client stress-testing without turning fixtures into product evidence. |

**Not workflow-shaped, do directly:** the hygiene set (LICENSE, linter, SECURITY, CONTRIBUTING,
dependabot, README rename). Single-file, single-concern, no discovery — a workflow would be
pure overhead.

## Sequencing and dependencies

```
Phase 3 ✔ ─> W4 apply surface ✔ ─┬─> W5 command set ✔ ──┐
                                 └─> W6 init ✔ ─────────┴─> W7 hardening ✔ ─> W8 release ✔
Wc registry content ......... any time, independent
hygiene ..................... done, direct
```

**Done so far.** W4 closed the write seam (overwrite decision, dry-run, cancel,
failure reporting). W5 added `list`, `info`, `diff` and `update` over one frozen
inventory contract, with `update` routed through the existing `plan()`/`apply()` rather than
writing files itself. W6 added finite framework detection, four AST adapters, bounded shared
config transforms, an init-specific plan/apply contract, text/JSON CLI output and built-Node
fixtures for Vite, both Next routers, their hybrid and React Router. A disposable full-app run then
closed the generated-config-to-`list` seam and added exact legacy migration. W7 then closed the
runtime, OS, package-manager, real-prompt and packed-tarball boundaries through its hosted matrix.
W8 completed the manual bootstrap, trusted-publisher binding, ordered tagged releases and
independent npm provenance verification.

W4 through W8 are complete. Wc's first eight adapted items are publicly dogfooded, including the
released import-only global-styles lifecycle and its Carousel/Dropzone stress cases. The second
hand-authored live registry closes the client-agnostic boundary for the declared interchange
subset. The [documentation-site milestone](docs-site-handoff.md) adds a searchable Starlight
surface and executable third-party authoring/sharing guide while preserving the `/r` contract; its
implementation and local acceptance are complete, with the first hosted deployment receipt still
pending. Wc remains an independent, ongoing content stream rather than a release blocker; after
that hosted receipt, its next boundaries are broader framework-specific visual acceptance and
further small curated tranches.

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
  and the receipt format are stable. `init` has now landed; W8 owns the explicit first-release
  version decision rather than this completed milestone changing package versions implicitly.
- **Publish the kit ahead of the client.** It is finished, independently useful, and verified
  as a consumer install. The client now declares the publishable `manteen-kit@^0.1.0` range, so the
  kit must exist before that client version can be installed from npm.
- **Windows is best-effort.** Not a target; say so in the README rather than implying support.
  *Caveat worth keeping visible:* being a Node tool does not make it portable by itself —
  path separators, `.cmd` shims, and argument quoting around a `^` range all differ, and the
  code already carries Windows-aware handling in places. W7's `windows-latest` built and packed
  jobs now pass, including the native `.cmd`/caret path. That is current positive evidence, while
  the best-effort policy keeps future platform drift from becoming an unsupported promise.
- **`update` re-merges directly.** No confirmation diff. `mergeThemeSource` is idempotent and
  keeps existing values on conflict, and the receipt records pre-update hashes, so the operation
  is recoverable. `manteen diff` still ships for people who want to look first.

## Releasing

`.github/workflows/release.yml` is designed to publish on a per-package tag using npm **trusted
publishing over OIDC** — no stored token. W7's audit found that the checked-in Node/npm pair was
below npm's trusted-publishing minimum and that the client lacked exact repository metadata. W8's
[`release handoff`](w8-release-handoff.md) freezes the repair at Node 24.18.1, npm 11.18.0 and Bun
1.3.14, plus a mechanical pre-publish guard.

**The first release of each package could not use it.** npm requires a package to have been
published before a trusted publisher can be configured, so an unpublished package had no
trusted-publisher path yet.

The maintainer therefore performed this private bootstrap once per package:

1. `npm login` (in a terminal, not through an agent session — nothing about it belongs in a
   transcript).
2. Publish `0.1.0` with `--provenance=false`; the package manifest requests provenance, but a local
   bootstrap has no OIDC attestation and must not imply one.
3. On npmjs.com, or with npm 11.15+, add the trusted publisher: `arimxyer` / `manteen` /
   `release.yml`, allowing `npm publish`.

After that, `0.1.1` became the first trusted release, tagged one package at a time. The kit
published and resolved before the client tag was pushed. The exact hosted and npm receipts are in
[`w8-release-handoff.md`](w8-release-handoff.md).

Future contract-bearing releases keep that fail-stop order: publish and verify `manteen-kit`, then
publish and verify `manteen`, then manually dispatch the Pages registry deployment. Pages does not
deploy on every `main` push because doing so could expose items that require an unpublished client
contract. The [`0.2 release handoff`](v0.2-release-handoff.md) records the first completed use of
that sequence.

The tradeoff: that first version has no provenance attestation, because provenance requires
the OIDC path. Storing an `NPM_TOKEN` just for it would reintroduce the long-lived credential
the whole setup exists to avoid, for the sake of one version.

## Carried into W7 — closed

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

W7 implemented quiescence plus an explicit platform/mechanism skip in
`packages/cli/e2e/pty-prompt.node-e2e.mjs`. Keep, select and cancel now pass through the real widget
on Linux. The hosted macOS image reports that its BSD `script(1)` invocation cannot establish the
supported pty mechanism, so those three cases skip with that exact reason and the Linux 3/3 run is
the smaller positive replacement. Windows remains a named skip because this mechanism is a Unix
pty test.

## Deferred, with a reason

- **Linting.** Biome (one binary, lint + format, near-zero config; `tsc --noEmit` already covers
  what type-aware ESLint rules would add). Not installed yet — adding a dependency re-resolves
  the workspace, and phase 3's agents are running against it. First task once that lands.
  *(Landed 2026-07-28; kept here because the reasoning still explains the config.)*
- **`CONTRIBUTING.md`, issue and PR templates, `SECURITY.md`.** Ceremony for an audience of one.
  Revisit if the repo gets contributors.
