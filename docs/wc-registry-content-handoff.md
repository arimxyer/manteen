# Wc registry-content handoff

Status: **eight adapted items released and publicly dogfooded, including the Carousel/Dropzone
extension stress cases; second-live-registry interoperability is also accepted.** Wc is an ongoing
content stream, not a release blocker or a reason to reopen the completed W4-W8 client program.

## Question and stopping condition

Can a curated Mantine UI component move from preview-and-copy source into the live `@house`
catalog while preserving its CSS, npm requirements, upstream attribution, install ownership and
maintenance behavior?

This content milestone stops when eight representative items:

1. compile through the authoring and wire schemas;
2. typecheck as registry source;
3. install together through the built Node CLI into a generated consumer;
4. bring their declared registry and npm dependencies with them;
5. pass a consumer production build; and
6. demonstrate clean repeat install plus local-edit `diff`/refusal/`update` behavior; and
7. render and complete representative browser interactions without console errors or unresolved
   automated-accessibility violations.

## Source and license boundary

The source is [`mantinedev/ui.mantine.dev`](https://github.com/mantinedev/ui.mantine.dev) pinned at
[`ffbf61c559f374a7ea28fcf00355e84dcbe9a908`](https://github.com/mantinedev/ui.mantine.dev/commit/ffbf61c559f374a7ea28fcf00355e84dcbe9a908),
observed 2026-07-30. Mantine UI is MIT-licensed.

This is a curated port, not a mirror. Storybook stories, repository-local tests and preview
`attributes.json` files are not consumer payloads. Demo data becomes typed props, upstream-only
imports may be replaced, and filenames are normalized. Every adapted source and stylesheet names
the pinned revision. All eight items depend on `@house/mantine-ui-license`, which installs the
verbatim upstream notice once at `LICENSES/MANTINE-UI.txt`.

## Tranche

| Item | Shape exercised | Curated change |
| --- | --- | --- |
| `article-card` | TSX + targeted CSS module + Tabler icons | Hardcoded article and external demo assets became props; dead action buttons are omitted. |
| `authentication-form` | Three source files + `@mantine/form` + `@mantine/hooks` | Submission/social actions became callbacks; social UI appears only when wired. Placeholders normalized to one `Enter your …` shape. The social buttons set `styles={{ section: { marginInlineEnd: 8 } }}` because upstream leaves the icon flush against the label — measured 0px, now 8px. |
| `button-progress` | Stateful hook-driven component + CSS module | Labels, duration and completion became public inputs. |
| `dnd-list` | `@dnd-kit/*`, `clsx`, keyboard/pointer behavior + CSS module | Periodic-table fixture became a reusable item and reorder contract. |
| `stats-grid` | Responsive block + React-node inputs + icons | Fixed metrics became consumer-owned data, icons and comparison labels. |
| `table-sort` | Derived search/sort state + empty state + CSS module | Fixed rows became props; filtered rows are derived rather than copied into stale state. `Table miw` lowered from upstream's 700 to 560. Consumer-visible: it changes where the horizontal scroll starts. 700 made the component scroll inside any content box narrower than 700px even when its three default columns had already fitted — measured in a 600px box, 111px of scroll with the last column fully visible, i.e. scrolling over empty table. |
| `cards-carousel` | `@mantine/carousel`, package CSS + image-backed interaction | Demo data became props and callbacks; a dark overlay makes the white labels contrast-safe. |
| `dropzone-button` | `@mantine/dropzone`, package CSS + file input behavior | Accepted files and labels became inputs; the hidden input has an accessible name. |

That tranche brought the catalog to 14 items: the existing five, eight adapted
components/blocks, and the shared license item.

## Findings

Wc exposed two authoring-path omissions without requiring a CLI change:

- The kit schema and TypeScript surface accepted `docs`, but `toWireItem()` dropped it. The compiler
  now carries author documentation into the item document, with a regression test.
- Real registry content introduced CSS modules, so the repository needed a CSS-module declaration
  for source typechecking. Consumer placement already worked through explicit `@ui/…` targets.

Browser dogfood also caught content defects that build-only checks could not:

- the linked article image had no accessible name and several curated color defaults missed WCAG
  AA contrast; the component defaults now use named content and contrast-safe theme shades; and
- the drag list registered a generic keyboard sensor without sortable coordinates. It now uses
  `sortableKeyboardCoordinates`, and a keyboard lift/move/drop retest reordered the items.

Carousel and Dropzone initially exposed a real client boundary: both require package-level global
stylesheet imports, while copied source and CSS modules alone cannot install those requirements
safely across supported frameworks. The resulting
[`required-global-styles contract`](global-styles-handoff.md) is now implemented and accepted. The
existing wire `css` field carries a strict import-only subset; `init` wires one configured,
Manteen-owned stylesheet; and receipt v2 tracks per-item contributions plus final bytes. That closes
the deferral rather than special-casing either component.

## Initial-tranche local verification receipt — 2026-07-30

Repository verification:

- catalog build: 12 items, zero authoring or wire-schema failures;
- source tier: 154 passed, 0 failed, 554 assertions;
- typecheck, Biome and all four guards: clean;
- built Node e2e: 94 tests, 93 passed, 1 intentional package-manager-selected skip.

Disposable consumer verification used `create-vite@9.1.1`, npm and the built `dist/cli.mjs`; all
consumer files and `node_modules` lived under `/tmp`:

- built `init` configured the generated app and installed Mantine;
- built `add` installed all six roots, one deduplicated license item, 14 files and the declared
  `@dnd-kit`, `@mantine/form`, Tabler and `clsx` dependencies;
- the app imported and rendered every item and passed `tsc -b && vite build`;
- repeat `add` reported all 14 files identical, and `diff` reported 14 unchanged;
- a local edit to `article-card.tsx` appeared as `local-only` with the correct patch;
- non-interactive `update` refused at `destination-exists`; `update --overwrite` restored the
  upstream bytes; the next diff was clean and the app rebuilt.

Browser verification ran the installed app in Chromium and interacted with the rendered payload:

- all six items rendered with no page errors;
- authentication switched modes and displayed the expected invalid-email and short-password
  messages;
- the progress control reached its completed state;
- table filtering, clearing and descending sorting produced the expected rows; and
- keyboard drag-and-drop reordered the list after the sortable-coordinate correction.

The initial axe pass found one unnamed link and 11 contrast nodes. After fixing the registry
defaults (and one generated-harness heading), the final WCAG A/AA pass reported zero violations.
Axe left the gradient badge as one manual contrast review because it cannot evaluate gradients;
the computed endpoint ratios against its white label were 5.67:1 and 6.30:1.

This is real generated-consumer and package-install evidence, but the registry URL was a compiled
local `file:` source. It is not yet evidence that GitHub Pages serves the new items, that the public
`manteen@0.1.1` fetches them, or that the tranche works visually across every supported framework.

## Extension-tranche local verification receipt — 2026-07-30

Repository verification after admitting Carousel and Dropzone:

- catalog build: 14 items, zero authoring or wire-schema failures;
- source tier: 168 passed, 0 failed, 613 assertions;
- typecheck, Biome and all four guards: clean; and
- built Node e2e: 100 tests, 99 passed, 1 intentional package-manager-selected skip.

Fresh disposable Vite, Next App, Next Pages, valid Next hybrid, Next App + Tailwind 4 and React
Router consumers all ran the built `init`, installed the two actual compiled registry items, and
passed final production builds after `update`. Each final `diff --stat` reported five unchanged
files. The Tailwind project's PostCSS config remained byte-identical while Manteen emitted the
existing non-failing required-work notice.

Chromium dogfood navigated the Carousel, exercised its callback, uploaded a PDF through Dropzone and
observed the upload callback with no page errors. It also found defects that production builds could
not: an unlabeled hidden file input and insufficient contrast. The registry source now names the
input and uses contrast-safe colors and a 55% black image overlay. The final WCAG A/AA axe pass had
zero violations; the one remaining image-background manual review has a calculated worst-case
4.76:1 white-text contrast ratio.

This is built-CLI and real-content evidence, but all registries were local `file:` URLs and all
fresh framework consumers ran on Linux. It does not prove the new items are deployed at the public
HTTPS registry, published in a newer CLI release, or newly exercised on macOS/Windows.

## Public release receipt — 2026-07-30 ET

The first two limitations above are now closed. `manteen-kit@0.2.0` and `manteen@0.2.0` published
through the tagged OIDC workflow with SLSA provenance, then the dispatch-only Pages workflow
deployed the same merge commit. The live index contains all 14 items. A fresh Vite project installed
the public client, fetched Carousel and Dropzone from the public `@house` HTTPS URLs, composed both
package stylesheet imports into receipt v2, passed `tsc -b && vite build`, and reported five
unchanged files.

The exact commit, workflow, npm, hash and disposable-consumer receipts are in the
[`0.2 release handoff`](v0.2-release-handoff.md). This public Vite smoke does not newly establish
visual or lifecycle behavior on macOS/Windows; the earlier hosted W7 matrix remains the general
platform boundary.

## Second live registry receipt — 2026-07-30 ET

The client is no longer evidenced only against kit-compiled catalogs. A separate public repository
hand-authors two interchange documents with nested names and a parent-local bare dependency, then
deploys them through its own Pages workflow. Public `manteen@0.2.0` mounted the same live URLs as
both `@alpha` and `@vendor`; `list`, `info`, `add`, production build, no-op `update` and clean
`diff` passed in separate fresh consumers. The dependency inherited the selected namespace in each
receipt.

The exact authorship boundary, hosted receipts, hashes, warning behavior and non-evidence are in the
[`second live registry handoff`](second-registry-handoff.md).

## Next boundary

1. Repeat browser acceptance in the other supported framework shapes as those fixtures become
   available; this Vite run is not cross-framework proof.
2. Continue Wc in small attributed tranches; do not bulk-import the remaining upstream examples.
3. Treat authenticated or independently operated registry proof as a separate milestone if real
   product usage requires it.
