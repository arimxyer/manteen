# Wc registry-content handoff

Status: **initial six-component tranche implemented and locally dogfooded; public-registry
deployment proof remains.** Wc is an ongoing content stream, not a release blocker or a reason to
reopen the completed W4-W8 client program.

## Question and stopping condition

Can a curated Mantine UI component move from preview-and-copy source into the live `@house`
catalog while preserving its CSS, npm requirements, upstream attribution, install ownership and
maintenance behavior?

This first tranche stops when six representative items:

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
the pinned revision. All six items depend on `@house/mantine-ui-license`, which installs the
verbatim upstream notice once at `LICENSES/MANTINE-UI.txt`.

## Tranche

| Item | Shape exercised | Curated change |
| --- | --- | --- |
| `article-card` | TSX + targeted CSS module + Tabler icons | Hardcoded article and external demo assets became props; dead action buttons are omitted. |
| `authentication-form` | Three source files + `@mantine/form` + `@mantine/hooks` | Submission/social actions became callbacks; social UI appears only when wired. |
| `button-progress` | Stateful hook-driven component + CSS module | Labels, duration and completion became public inputs. |
| `dnd-list` | `@dnd-kit/*`, `clsx`, keyboard/pointer behavior + CSS module | Periodic-table fixture became a reusable item and reorder contract. |
| `stats-grid` | Responsive block + React-node inputs + icons | Fixed metrics became consumer-owned data, icons and comparison labels. |
| `table-sort` | Derived search/sort state + empty state + CSS module | Fixed rows became props; filtered rows are derived rather than copied into stale state. |

The catalog now contains 12 items: the existing five, six adapted components/blocks, and the
shared license item.

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

Mantine Carousel and Dropzone were considered and deliberately deferred. Both require package-level
global stylesheet imports. A copied component cannot safely inject those imports across Vite, Next
App, Next Pages and React Router, and the current registry contract has no required-global-style
integration channel. Shipping either now would prove file copying while leaving supported consumers
unstyled or framework-invalid.

The follow-up disposable framework probe established a viable import arrangement, and the
[`required-global-styles handoff`](global-styles-handoff.md) now freezes the production contract:
the existing wire `css` field carries import-only declarations; `init` wires one explicitly
configured Manteen-owned stylesheet; and receipt v2 tracks per-item contributions plus final bytes.
The probe did not exercise that CLI lifecycle, so Carousel and Dropzone remain deferred until the
implementation and acceptance boundary in that handoff passes.

## Local verification receipt — 2026-07-30

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

## Next boundary

1. Deploy the catalog and repeat a smaller clean consumer smoke against the HTTPS `@house` URLs
   using public `manteen`.
2. Repeat browser acceptance in the other supported framework shapes as those fixtures become
   available; this Vite run is not cross-framework proof.
3. Implement and verify the frozen required-global-styles contract before admitting Carousel,
   Dropzone or other Mantine extension packages.
4. Continue Wc in small attributed tranches; do not bulk-import the remaining upstream examples.
