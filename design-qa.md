# Whole-product visual design QA

## Scope and evidence

This pass covered the complete documentation product rather than only the original registry mock:

- the home/marketing route;
- standard Starlight documentation and reference routes;
- the full registry gallery;
- all 14 registry detail routes;
- the Article Card live playground and the static/no-adapter detail states;
- desktop and 390 px mobile layouts in dark and light themes;
- navigation, menu, search, filter, sort, copy, tab, and overflow states.

The approved Pencil work remains the visual direction for the registry surfaces:

- `/home/arimayer/dev/personal/mantine-components/pencil/workspace-canvas.pen`
  - gallery frame `bi8Au`
  - Article Card preview frame `h42HCk`
  - usage frame `U4jTbb`
  - props frame `a8f1FE`
  - styling frame `BlqxN`
  - source frame `NhnE6`

Cross-product browser audit evidence:

- documentation shell audit: `/tmp/manteen-docs-shell-audit.AEXPWf/`
- registry route audit: `/tmp/manteen-registry-audit.IvwNTk/`
- post-change verification captures: `/tmp/manteen-visual-verify/`
  - `home-desktop-dark.png`
  - `gallery-desktop-dark.png`
  - `article-desktop-dark.png`
  - `getting-mobile-light-final.png`
  - `getting-mobile-menu-final.png`
  - `gallery-mobile-light-contrast-fixed.png`

Temporary paths are local QA receipts, not product assets.

## Baseline findings

The initial implementation had several visually credible parts, but they did not yet behave as one product:

1. The standard documentation shell and registry browser used different density, radius, type-weight, and surface conventions.
2. Mobile hid the primary Docs, Registry, and Registry authors navigation, while the open menu repeated theme and GitHub controls already present in the header.
3. The home page moved abruptly from a sparse marketing hero to the complete dense registry catalog with no explanatory bridge.
4. Gallery thumbnails looked like live component demos even though only Article Card had a live adapter.
5. The gallery lacked an explicit page-level heading, and detail routes nested a second `main` landmark inside Starlight's `main`.
6. Reference tables and long code blocks did not communicate horizontal overflow well at mobile widths.
7. Empty preview states consumed too much vertical space, long source files dominated the page, and kind labels used inconsistent vocabulary.
8. Several light-theme secondary labels missed WCAG AA text contrast.
9. Mantine's package-level stylesheet was loaded on every registry detail route even though only the Article Card playground needed it.

## Implemented visual system

- Added shared semantic tokens for surfaces, text, borders, radii, spacing, controls, focus treatment, and content widths.
- Standardized heading weight, section rhythm, controls, cards, metadata, tabs, empty states, source panels, and registry-sidebar geometry.
- Made the primary product navigation visible and usable on mobile; removed redundant controls from the mobile sidebar.
- Added a two-path home overview that bridges the product promise to authoring and consuming workflows before the embedded catalog.
- Added explicit full-page and embedded catalog modes with correct H1/H2/H3 hierarchy.
- Added honest `Static example` and `Registry sample` labels to non-live gallery thumbnails.
- Defaulted Article Card to Preview and items without an adapter to Usage, where their real installation contract is immediately available.
- Replaced the nested detail `main` landmark and compacted non-preview states.
- Bounded long source panes and added keyboard-focusable, labeled overflow regions for wide tables and highlighted code.
- Kept mobile filter chips in a predictable horizontal rail rather than allowing an orphaned wrap.
- Isolated demo-preview color tokens from the docs light/dark theme so miniature examples remain legible and visually stable.
- Scoped Mantine's global component stylesheet to `/registry/article-card/`; unrelated detail routes no longer download it.
- Added visible H2 structure to the catalog and CLI reference pages.

## Product-truth boundary

Article Card is currently the one curated live playground adapter. The remaining gallery illustrations are intentionally labeled as static examples, and their detail pages lead with usage/source truth rather than simulating interactivity that is not implemented. This pass improves visual confidence without claiming broader live-preview coverage.

## Interaction and accessibility receipt

- Registry search, kind filters, and sorting update the visible result count and item set.
- The mobile primary navigation remains visible at 390 px; the registry-local rail remains available from Menu.
- Copy buttons retain accessible state feedback.
- Detail tabs preserve URL state and keyboard tab semantics.
- Table and code overflow regions are focusable and labeled only when they actually overflow.
- The home page and light mobile registry each return Axe 4.12.1 results of 0 violations and 0 incomplete checks.
- The Article Card playground returns 0 violations; Axe leaves two contrast checks incomplete because preview controls/content overlap layered demo surfaces whose backgrounds it cannot determine.
- The mobile registry-reference table returns 0 violations; Axe leaves its horizontally clipped table cells as incomplete for the same background-determination limitation.
- These automated results are targeted regression evidence, not a claim of WCAG certification. The incomplete nodes were also visually inspected in their rendered states.
- No page-level horizontal overflow was observed at 390 px; intentional chip, table, and source-panel overflow is contained locally.

## Verification

- `bun --cwd=apps/docs run build` — passed; 23 pages and 14 registry items copied to the built site.
- `./node_modules/.bin/biome check apps/docs` — passed.
- `git diff --check` — passed.
- `bun run test` — passed; 170 tests, 0 failures.
- `bun run typecheck` — passed; workspace link guard clean.
- `bun run lint` — passed; 184 files checked.
- `bun run guard` — passed; workspace, runtime API, diagnostics, and release guards clean.
- `bun run build:registry && bun --cwd=packages/cli run build` — passed; 14 registry items and the Node-targeted CLI bundle built.
- `node --test packages/cli/e2e/*.node-e2e.mjs` — passed; 99 tests passed, 1 opt-in packed-consumer smoke skipped.

## Remaining non-blocking boundaries

- Adding live adapters for more registry items is a separate content-expansion effort, not a visual-system requirement.
- The current catalog contains no hook item, so the Hooks filter's empty result is truthful but cannot serve as a hook-detail visual acceptance sample yet.
- Starlight's menu custom element can produce an `aria-allowed-attr` incomplete result while open; it was not reported by Axe as a violation. Revisit it when upgrading or replacing that upstream menu primitive.

final result: passed
