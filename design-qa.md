# Registry browser design QA

## Evidence

- Source visual truth: `/home/arimayer/dev/personal/mantine-components/pencil/workspace-canvas.pen`
  - gallery frame `bi8Au`
  - ArticleCard preview frame `h42HCk`
  - usage frame `U4jTbb`
  - props frame `a8f1FE`
  - styling frame `BlqxN`
  - source frame `NhnE6`
- Source captures:
  - `/tmp/manteen-pencil.ZnNnkc/bi8Au.png`
  - `/tmp/manteen-qa/h42HCk.png`
- Browser-rendered implementation captures:
  - `/tmp/manteen-qa/gallery-accepted-desktop-final.png`
  - `/tmp/manteen-qa/gallery-final-mobile-stacked.png`
  - `/tmp/manteen-qa/gallery-mobile-menu.png`
  - `/tmp/manteen-article-card-preview-final.png`
  - `/tmp/manteen-article-card-final-mobile.png`
- Combined comparison inputs opened for review:
  - `/tmp/manteen-qa/gallery-accepted-comparison-final.png`
  - `/tmp/manteen-qa/article-preview-live-comparison.png`
- Desktop gallery viewport: 1440 x 1300 CSS px; source and implementation are both 1440 x 1300 pixels at device scale factor 1.
- Desktop detail viewport: 1440 x 1156 CSS px; source and implementation are both 1440 x 1156 pixels at device scale factor 1.
- Mobile implementation viewport: 390 x 844 CSS px at device scale factor 1. The Pencil file has no matching mobile frame, so mobile is a resilience check rather than a pixel-fidelity claim.
- State: dark gallery default, gallery search/filter/sort states, registry rail open and searched, and ArticleCard Preview/Usage/Props/Styling/Source states.

## Findings

- No actionable P0, P1, or P2 differences remain.

- [P3] Curated previews favor product truth over a few illustrative mock details.
  - Location: ArticleCard card preview, card descriptions, and package-derived titles.
  - Evidence: the Pencil ArticleCard thumbnail uses skeleton copy, while the implementation shows the real local image and meaningful miniature content. Registry descriptions remain sourced from the compiled entries rather than being rewritten only to match the mock.
  - Impact: the presentation remains visually aligned while accurately representing what users install.
  - Follow-up: none required; change the registry content or component API first if those details become product requirements.

- [P3] The current browser theme preference is shown as `Dark` rather than the mock's `Auto` label.
  - Location: global header theme selector.
  - Evidence: the same theme control and layout are present, but the browser session has an explicit dark preference stored.
  - Impact: this is a truthful user-state difference, not layout drift.
  - Follow-up: none.

## Required fidelity surfaces

- Fonts and typography: Geist/Geist Mono direction, weights, hierarchy, wrapping, and small-label treatment are aligned. Registry card titles were reduced from the earlier heavy treatment to match the approved visual density.
- Spacing and layout rhythm: the accepted gallery measures 1124 px wide at x=284. Search is 716.66 x 48 px, and the first card is 364 x 354 px at x=284, y=428.84, matching the source's 715 px search and 364 x 355 px card boundary within normal subpixel rendering. The second row uses the approved compact gap.
- Colors and visual tokens: dark surface, raised panels, hairline borders, pale-indigo active filter, green success accents, and text hierarchy are aligned. The preview colors were adjusted only where necessary to pass WCAG AA.
- Image quality and asset fidelity: ArticleCard uses the approved source photograph as a local 1080 x 1620 JPEG with a stable cover crop. Other cards use semantic component miniatures and Tabler/Starlight icons; no placeholder assets, custom SVGs, or emoji substitutes remain.
- Copy and content: hero, search, filters, `Featured and newly added`, recommended ordering, and install commands match the approved contract. Registry-derived names and descriptions remain truthful to the compiled catalog.
- Icons: header, search, copy, grid, dropzone, table, and preview actions use the project's existing Starlight and Tabler icon libraries.

## Interaction and accessibility receipt

- Gallery search for `carousel` leaves only `Cards Carousel` visible.
- The Blocks filter returns `Authentication Form`, `Data Table`, `Stats Grid`, and `Sortable Table`.
- Name A-Z sort begins `Article Card`, `Authentication Form`, `Cards Carousel`, `Data Table`.
- Recommended sort begins `Article Card`, `Authentication Form`, `Cards Carousel`, `Dropzone Button`, `House Theme`, `Data Table`.
- Registry-rail search for `dropzone` leaves only `Dropzone Button`; the mobile menu opens to the complete registry-local rail.
- Copying the ArticleCard command changes the accessible button state to `Copied install command`.
- The standard documentation route still renders Starlight's default sidebar, and the global Docs navigation reports the correct active state.
- Desktop and mobile browser console/page-error streams are empty.
- Axe 4.12.1 WCAG 2 A/AA: desktop 0 violations / 0 incomplete; mobile 0 violations / 0 incomplete.
- Mobile 390 px: document and body scroll widths equal the 390 px viewport; the catalog heading and sort control stack cleanly; no page-level horizontal overflow is present.
- ArticleCard interaction coverage remains: editable title/author/rating, action callback feedback, actions on/off, 520/320 preview widths, isolated dark/light schemes, reset, source copy, tab selection, and keyboard tab navigation.

## Comparison history

1. The first gallery/detail comparison found generic file-count thumbnails (P1), an uncustomized Starlight shell (P2), and hierarchy/filter drift (P2).
2. The detail foundation fixed ARIA semantics and introduced truthful empty states for missing preview/props/styles metadata.
3. The ArticleCard milestone replaced its empty state with the real registry component inside an isolated Mantine provider, then fixed asset export, stylesheet layering, card sizing, and contrast. Its matched desktop/mobile comparison resolved the detail P1.
4. The first gallery implementation added curated preview miniatures and docs-owned featured ordering. The browser comparison then exposed a static-route/base-path mismatch that prevented the custom rail from activating and Starlight spacing that inflated grid rows.
5. The shell iteration added primary Docs/Registry/Registry authors navigation, a functional registry-local rail, exact 256 px sidebar geometry, compact cards, target filters, sort control, and responsive behavior.
6. The first accessibility pass found nine contrast failures in small preview/header text. Colors were corrected without changing layout, and the repeated Axe passes returned 0 violations / 0 incomplete.
7. The final matched comparison aligned the 1440 px content boundary, search width, featured card x/y position, 364 x 354 card size, and row rhythm. No P0/P1/P2 findings remain.

## Implementation checklist

- [x] Curated gallery previews and featured ordering.
- [x] Header, registry rail, filters, sorting, and desktop density aligned with the Pencil frame.
- [x] Functional search, filter, sort, rail search, copy, navigation, and mobile menu states.
- [x] Matched desktop comparison plus desktop/mobile accessibility and overflow checks.
- [x] Browser console and page-error checks.

final result: passed
