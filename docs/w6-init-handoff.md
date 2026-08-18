# W6 handoff — `manteen init`

Status: complete and locally verified on 2026-07-29. The probe/checkpoint/contract sequence, four
framework adapters, shared plan/apply boundary, CLI integration and built-Node acceptance tier have
all landed. W7 portability/runtime hardening was next at this handoff and has since completed; see
[`w7-hardening-handoff.md`](w7-hardening-handoff.md) and the current [`roadmap.md`](roadmap.md).

## The question

Can `manteen init` take a current Tier A project with no `manteen.json` to a state that:

- immediately passes `loadConfig()`;
- has Mantine's provider, framework-appropriate color-scheme initialization, styles and PostCSS
  setup in the framework's real entry points (or the settled, explicit manual action for a
  Tailwind PostCSS pipeline);
- produces a theme scaffold that `manteen-kit` can merge into;
- previews every mutation under `--dry-run`, preserves existing work and is idempotent; and
- behaves the same in the built bundle under Node as it does in source tests?

A generated fixture proves our transform against that fixture. It does not prove that the fixture
matches the framework generator or Mantine guidance that users receive today. That is why W6 starts
with probes rather than types or adapters.

## Settled boundary

These are decisions, not questions to reopen during implementation:

- Tier A codemods: Vite, Next App Router, Next Pages Router and React Router. Everything else takes
  the Tier B path: config + theme scaffold + explicit instructions.
- A hybrid Next project edits `app/layout.tsx`, `pages/_app.tsx` and `pages/_document.tsx`.
- `ColorSchemeScript` is an SSR integration: it goes in Next App, Next Pages and framework-mode
  React Router. It is not added to a client-only Vite application, where current Mantine guidance
  has `MantineProvider` initialize the color scheme on render.
- An existing PostCSS configuration is patched; `init` never creates a second config with a name
  that wins or loses by loader precedence.
- The PostCSS block contains `postcss-preset-mantine`, `postcss-simple-vars` and the five settled
  Mantine breakpoints: `36em`, `48em`, `62em`, `75em`, `88em`.
- If `@tailwindcss/postcss` is present, report the exact Mantine block and do not patch the config.
- The theme scaffold must merge with the kit's real `data-grid.theme.ts` fixture.
- A second run produces an empty plan and exits 0.
- The stale missing-config message saying that `init` does not exist is removed in W6.
- No post-write formatter or typecheck is bundled into `init`.
- The W7 pty prompt test, the platform/runtime matrix, publication and `search` are outside W6.

Repository-wide rules still bind this work: all decisions precede mutations, writes use temp +
rename and a shared pre-image journal, package installation is outside rollback, unimplemented
seams refuse by name, and shipped behaviour is verified from `dist/` under real Node.

## Probe receipt — 2026-07-29

Every generated project and dependency install lived under `mkdtemp()` in `/tmp`. No probe wrote
into this repository's `node_modules`, no bare install ran in the workspace and no generated
fixture was promoted into a committed test fixture. The observation runtime was Node 26.4.0 and npm
12.0.1.

### Generator shapes

| Target | Pinned observation | Entry and tsconfig | PostCSS and package-manager evidence | Implementation consequence |
| --- | --- | --- | --- | --- |
| Vite React + TypeScript | `create-vite@9.1.1`; the `@latest` and pinned outputs were byte-identical | `src/main.tsx` mounts a nontrivial `src/App.tsx`; root `tsconfig.json` only references `tsconfig.app.json` and `tsconfig.node.json`; neither declares `paths` | No PostCSS file, lockfile, `packageManager` or `engines` field | Detect the real application tsconfig, add `@/* -> ./src/*` there, name `tsconfig.app.json` in `manteen.json`, and merge `resolve.tsconfigPaths: true` into Vite rather than pretending TypeScript paths alone resolve at runtime |
| Next App and Pages, root and `src/` variants | `create-next-app@16.2.12`, React 19.2.4 | App owns `app/layout.tsx`; Pages owns `pages/_app.tsx` and `pages/_document.tsx`; generated `@/*` maps to `./*` or `./src/*` and already backs all four manteen aliases | `--no-tailwind` emits no PostCSS file. Tailwind is the generator default and emits `postcss.config.mjs` containing `@tailwindcss/postcss`. With `--skip-install`, there is no package-manager metadata | Detect both roots, preserve metadata/fonts/document structure and take the settled Tailwind manual-action branch for today's default generator output |
| React Router framework mode | `create-react-router@8.3.0`, React 19.2.8, Vite 8.1.5 | `app/root.tsx` owns the document; `tsconfig.json` has only `~/* -> ./app/*`; Vite already enables `resolve.tsconfigPaths` | No PostCSS file. Tailwind is wired through `@tailwindcss/vite`, not `@tailwindcss/postcss`; the generated lockfile identifies npm | Detect this before generic Vite, keep `~/*` for existing imports, add `@/* -> ./app/*`, and emit manteen's four `@/…` aliases. Current config validation rejects `~/…` before paths matching |

Fresh generator output without a lockfile or `packageManager` remains intentionally ambiguous. D15
already resolves that case: `plan()` refuses with `no-package-manager` unless `--pm` is supplied;
W6 must not infer npm merely because npm launched a probe.

### Mantine placement

The current Mantine documentation was v9.5.0. The checked Vite templates were commits
`5afce3587faeddf812dd2017cb87aed42adc0516` (full) and
`780bc3361b094cef13fce09c0b911692414ddce5` (minimal). The checked Next templates were commits
`636fa91ee9297bea0d336e5ed48d10cb71a6d5e7` (App) and
`cf526d38819f357266616f0df06329c6b4326434` (Pages).

| Shape | Observed current placement | Transform obligation |
| --- | --- | --- |
| Vite | `@mantine/core/styles.css`, `MantineProvider` and a local theme are integrated in `src/App.tsx`; both runtime templates omit `ColorSchemeScript` | Preserve the existing component body, wrap it with the provider and do not add an SSR script. The templates use `src/theme.ts`; a manteen `src/lib/theme.ts` path would be our convention, not Mantine's |
| Next App | Styles import in `app/layout.tsx`; `mantineHtmlProps` on `<html>`; `ColorSchemeScript` in `<head>`; provider in `<body>` | Preserve metadata, `next/font` constants, existing `<html>`/`<body>` props and children while adding only missing Mantine structure |
| Next Pages | Styles and provider in `pages/_app.tsx`; `mantineHtmlProps` and `ColorSchemeScript` in `pages/_document.tsx` | Preserve global-style imports and both self-closing and populated `<Head>` shapes; a hybrid runs both this adapter and the App adapter |
| React Router | Styles at `app/root.tsx`; `mantineHtmlProps` on `<html>`; `ColorSchemeScript` in the root `<head>`; provider around `children` | Require framework markers (`@react-router/dev`, framework config and `app/root.tsx`) so a Vite SPA that merely uses `react-router` remains Vite |

Sources: Mantine's current [Vite guide](https://mantine.dev/guides/vite/),
[Next guide](https://mantine.dev/guides/next/),
[React Router guide](https://mantine.dev/guides/react-router/) and
[color-scheme guidance](https://mantine.dev/theming/color-schemes/). The Vite guide's broad claim
that templates contain `ColorSchemeScript` conflicts with both current runtime template trees and
the more specific color-scheme guidance. The converging evidence supports the framework-specific
rule above, not a Vite script.

### PostCSS loading and coexistence

- An executable `postcss-load-config@6.0.1` probe with both root candidates selected
  `postcss.config.cjs` over `postcss.config.mjs`.
- Executing Next 16.2.12's own `findConfigPath` over the same pair selected
  `postcss.config.mjs` over `postcss.config.cjs`. Next's supported sequence is different from the
  generic loader, which makes “find and patch the existing config; never add a competing file” a
  correctness rule rather than a style preference.
- Next's current generator defaults to `@tailwindcss/postcss`. That is the already-settled
  report-but-do-not-patch case. Next also documents that a custom PostCSS config disables its
  defaults, so an init-created file must be the complete intended pipeline, not a partial overlay.
- React Router's current default uses Tailwind's Vite plugin. A temp integration kept that Vite
  plugin and `app/app.css` byte-identical, added Mantine 9.5.0 and the settled
  `postcss.config.cjs`, and passed `npm run typecheck` and `npm run build`. The built CSS contained
  Mantine styles, Tailwind utilities and a probe variable compiled from
  `$mantine-breakpoint-sm` to `48em`. `@tailwindcss/vite` therefore does not take the
  `@tailwindcss/postcss` refusal branch.

The created Mantine block remains exactly `postcss-preset-mantine`, `postcss-simple-vars`, and
`36em/48em/62em/75em/88em`. The filename is `postcss.config.cjs` only when no supported existing
configuration is present. See Next's [PostCSS guide](https://nextjs.org/docs/pages/guides/post-css)
and the generic loader's [supported shapes](https://github.com/postcss/postcss-load-config/blob/main/README.md).

### Executable integration receipts

- A manually constructed Next 16.2.12 App/Pages hybrid with all three entry seams and Mantine 9.5.0
  passed `npm run build` under Turbopack. This validates the target placement in one current hybrid;
  it does not validate a codemod.
- The React Router integration above passed typecheck and a client/SSR production build with the
  original Tailwind pipeline still active. This validates the intended result for one current
  generator shape; it does not prove arbitrary user-authored roots are safe to rewrite.
- A fresh Vite fixture then added `@/* -> ./src/*`, `resolve.tsconfigPaths: true`, Mantine 9.5.0,
  the settled PostCSS block, a theme and the provider/style integration. A real `@/theme` import
  passed `tsc -b` and a Vite 8.1.5 production build. This proves the proposed alias runtime works
  for the pinned generated shape; it does not prove a codemod or the proposed deeper
  `src/lib/theme.ts` convention.

### Evidence boundary

At the probe checkpoint, this report proved current generator manifests, current documented
placement, two loader-precedence results and three manually constructed build outcomes. It did
**not** yet prove a W6 transform. The later source and built-Node receipts below close that separate
boundary; the probe evidence remains useful because generated fixtures alone cannot prove what the
upstream generators and Mantine guidance looked like on the observation date.

The evidence is point-in-time. Generator tags, template heads and npm latest versions can move;
the committed W6 e2e fixtures must record their generator version and provenance rather than call
`@latest` during tests.

## Approved contract decisions

The 2026-07-29 human checkpoint approved the following decisions and authorized the contract
freeze.

1. **Default registry — use the live `@house` registry.** An empty map is not a valid current
   `manteen.json` (`registries` has `minProperties: 1`), while requiring a registry flag makes the
   ordinary non-interactive path unable to initialize. Emit the live URL already documented in the
   README; adding a custom-registry flag can remain additive.
2. **Alias ownership — permit bounded tsconfig and Vite-config patches.** Add only the missing
   broad `@/*` path to the detected application tsconfig, preserve existing keys, and enable Vite's
   native `resolve.tsconfigPaths` only when needed. An explicit conflicting value or a config shape
   that cannot be statically merged refuses before mutation.
3. **Theme convention — use the alias source root plus `lib/theme.ts`.** That means
   `src/lib/theme.ts` for Vite and `src/` Next, `lib/theme.ts` for root Next, and
   `app/lib/theme.ts` for React Router. It keeps `@/lib/theme` and the kit's merge destination
   coherent even where Mantine's own starter happens to place `theme.ts` at a shallower path.
4. **Partial source shapes — patch only structurally proven seams.** Existing Mantine imports,
   providers, scripts, props and complete PostCSS entries are idempotent anchors. Missing or dynamic
   framework entry/config structure produces a named, instruction-bearing refusal; no adapter
   replaces an entry file wholesale.
5. **Diagnostics — extend the existing guarded vocabulary and §1 table.** Init planning is another
   CLI planning surface, so a second diagnostic system would create two meanings for severity,
   `--force` and exit codes. Expected refusals must not escape as thrown strings.
6. **Codemods — declare a direct AST dependency.** The current entries contain metadata, font
   expressions, document props and provider props that string insertion cannot preserve reliably.
   If implementation imports `ts-morph`, declare it directly even though `manteen-kit` currently
   brings it transitively.
7. **Public API — export pure `planInit`/`applyInit` cores and every required port factory.** Keep
   argv, process streams and exit-code assignment in the CLI shell, matching W5's constructible API
   rule.
8. **Framework override — accept `vite`, `next-app`, `next-pages`, `next-hybrid`, `react-router`
   and `manual`.** The flag overrides an absent or ambiguous detection, but does not authorize a
   contradictory filesystem shape. Unsupported non-interactive projects refuse with the exact
   `--framework manual` recovery.
9. **Tailwind outcome — make manual completion explicit in the result contract.** Continue the
   non-PostCSS parts, leave `@tailwindcss/postcss` byte-identical, return the exact Mantine block as
   a structured manual action and render the run as incomplete rather than silently “fully
   initialized.” This accepted coexistence path exits 0; text and JSON both name the pending action,
   and the second-run guarantee is scoped to mutation entries.

## Frozen contract output

The solo pass froze only the shared surface:

- framework-set and detection-result types;
- an `InitPlan` whose file entries carry absolute destinations, final bytes, pre-image hashes and
  dispositions;
- dependency, instruction, diagnostic and outcome types;
- dry-run, overwrite/cancel and exit-code semantics;
- the adapter interface each Tier A implementation receives; and
- exact ownership of shared files (`cli/index.ts`, package exports, schemas and e2e wiring) by the
  later integrator.

`packages/cli/src/init/types.ts` is the sole declaration site. `InitPlan.files` contains mutations
only, so idempotency means `files: []` and `dependencies: []`; Tailwind/manual instructions remain a
separate required-work channel. `InitApplyOutcome.ok` can therefore be true while `.complete` is
false, which is the exact exit-0-but-not-finished state approved above. Seven init diagnostics extend
the guarded §1 vocabulary: detection and authored-config problems exit 2; unsafe transformations
exit 1; none is forceable.

Do not force init-shaped writes into the registry `Plan`: its files require item ids, wire types,
receipt ownership and registry lineage that init files do not have. Reuse the journal and package
manager mechanisms behind an init-specific plan/apply contract instead.

## Implementation closure — 2026-07-29

The implementation followed the frozen sequence: adapters landed independently, then the shared
project snapshot, bounded config transforms, plan/apply cores, production ports, CLI shell and
public exports were integrated. `planInit` emits only mutation entries; `applyInit` preflights exact
pre-image hashes, asks one all-or-nothing question only in interactive mode, installs dependencies
before opening the journal, rechecks after lifecycle scripts, and writes all init files through one
shared pre-image journal.

Integration exposed one additional safety consequence without changing the contract: an active
PostCSS object embedded in `package.json` cannot be exact-byte patched in a run where the package
manager must also add dependencies. Both operations would own the same file, and install runs first.
That combination now emits `init-config-conflict` with two recoveries: declare the four init
dependencies first, or move PostCSS to a supported standalone config. It never writes planned stale
package bytes over dependency entries the package manager just added.

The local closure receipt on Node 26.4.0 and Bun 1.3.14 is:

- 148 source-tier tests, including alternate quotes/imports/provider props, populated Next `Head`,
  PostCSS precedence/conflicts, exact theme-fragment merge, empty second plans, dry-run, cancellation,
  stale plans, install failure and journal rollback;
- 88 built-Node e2e tests total; W6's six cover Vite, Next App, Next Pages, Next hybrid, React Router
  and a zero-mutation refusal;
- each framework fixture records its pinned generator and 2026-07-29 observation date, runs
  `init --dry-run`, runs `init`, passes `loadConfig()`, preserves generated content and produces an
  empty second mutation plan;
- the default Next Tailwind fixture leaves `postcss.config.mjs` byte-identical and returns
  `ok: true`, `complete: false` with the exact required `tailwind-postcss` instruction; and
- typecheck, Biome, all three guards, registry build, CLI build and the full real-Node e2e glob pass.

This proves the transforms against the committed, provenance-labelled shapes and the shipped Node
bundle. It still does not turn those fixtures into live evidence about generator releases after the
observation date; refreshing that evidence is a new probe, not a routine unit-test claim.

### Dogfood follow-up — 2026-07-29

A full disposable Vite run crossed the seams the hermetic suite intentionally avoids: the complete
`create-vite@9.1.1` project, a real interactive PTY confirmation, real npm dependency installs, the
live `@house` registry, `data-table` plus its transitive item and theme merge, and a production build
that actually imported and rendered the installed component. Repeat `init`, `add` and `update` runs
were mutation-empty or byte-identical.

That run found one cross-command defect: init emitted only `@house`'s item template, while `list`
correctly refuses to infer an index under D21. Known-reference `add` worked, but a fresh
`init → list` returned `no-index`. Fresh and missing-config examples now share an explicit
`{ url, index }` source. The exact legacy string—or the exact object URL with no index—is migrated
transactionally while preserving other registries and resolutions; an explicitly different URL or
index still refuses.

The regression test remains hermetic: it first asserts the live URLs emitted by built `init`, then
points that same generated object at a kit-compiled `file:` registry before driving built `list`.
The updated local receipt is 151 source-tier tests and 90 built-Node e2e tests. It proves the
init/list seam without turning external GitHub Pages availability into a CI dependency.

### Agent-probe hardening follow-up — 2026-08-10

A fresh-agent probe found two bounded W6 seams. A planning refusal from
`init --dry-run --json` now preserves the requested dry-run fact even when no outcome exists, and
the Vite adapter accepts a directly provable named `App` function or variable, including a separate
unaliased `App` export specifier, without changing that export contract. Computed, aliased,
duplicate, or otherwise ambiguous application bindings still refuse rather than guessing.

A second probe exposed two further bounded seams. JSON-mode dependency installation now captures
child output so stdout remains one command envelope on both success and failure, with captured
failure detail retained in the structured error. Existing configs also distinguish absent fields
from authored conflicts: a missing canonical `@house` member and detected theme path are additive
migrations that preserve custom registries, while ownership-selecting omissions receive an exact
reviewable config patch and differing authored values continue to refuse.
