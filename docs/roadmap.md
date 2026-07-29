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
Phase 3 (running)
   └─> W4 apply surface ─┬─> W5 command set ──┐
                         └─> W6 init ─────────┴─> W7 hardening ─> W8 release
Wc registry content ......... any time, independent
hygiene ..................... now, direct
```

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

## Deferred, with a reason

- **Linting.** Biome (one binary, lint + format, near-zero config; `tsc --noEmit` already covers
  what type-aware ESLint rules would add). Not installed yet — adding a dependency re-resolves
  the workspace, and phase 3's agents are running against it. First task once that lands.
- **`CONTRIBUTING.md`, issue and PR templates, `SECURITY.md`.** Ceremony for an audience of one.
  Revisit if the repo gets contributors.
