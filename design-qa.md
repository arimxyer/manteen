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
  - `/tmp/manteen-qa/gallery-viewport.png`
  - `/tmp/manteen-qa/article-preview-viewport.png`
  - `/tmp/manteen-qa/article-styling-desktop.png`
  - `/tmp/manteen-qa/article-source-desktop.png`
  - `/tmp/manteen-qa/gallery-mobile.png`
  - `/tmp/manteen-qa/article-styling-mobile.png`
  - `/tmp/manteen-article-card-preview-final.png`
  - `/tmp/manteen-article-card-interaction.png`
  - `/tmp/manteen-article-card-mobile-light.png`
  - `/tmp/manteen-article-card-final-mobile.png`
- Combined comparison inputs:
  - `/tmp/manteen-qa/gallery-comparison.png`
  - `/tmp/manteen-qa/article-preview-comparison.png`
  - `/tmp/manteen-qa/article-preview-live-comparison.png`
- Desktop gallery viewport: 1440 x 1300 CSS px, source and implementation both 1440 x 1300 pixels, device scale factor 1.
- Desktop detail viewport: 1440 x 1156 CSS px, source and implementation both 1440 x 1156 pixels, device scale factor 1.
- Mobile implementation viewport: 390 x 844 CSS px, device scale factor 1. The Pencil file does not contain a matching mobile frame, so mobile was checked for resilience rather than pixel fidelity.
- Theme/state: dark theme; gallery default state and ArticleCard Preview, Usage, Props, Styling, and Source states.

## Findings

- [P1] The gallery does not yet provide component preview imagery.
  - Location: registry cards.
  - Evidence: the Pencil gallery uses recognizable ArticleCard, AuthenticationForm, Carousel, Dropzone, theme, and table previews; the implementation uses a generic file-count panel for every item.
  - Impact: users still cannot visually judge what they are adding, which was the central reason for redesigning the catalog.
  - Fix: add curated, real preview descriptors or exported preview assets for suitable first-party items; use an explicit nonvisual treatment only for hooks, libraries, themes, and files.

- [P2] The global navigation and registry sidebar remain Starlight-shaped instead of matching the approved catalog shell.
  - Location: header and left navigation.
  - Evidence: the Pencil frame includes Docs, Registry, and Registry authors links, a registry-local search, and a compact 224 px catalog rail; the implementation keeps Starlight's global search and a wider collapsible documentation sidebar.
  - Impact: the registry feels like a nested documentation page rather than the dedicated browsing surface shown in the design.
  - Fix: add the approved header links and registry-local navigation treatment while preserving Starlight search and mobile menu accessibility.

- [P2] Gallery hierarchy and filtering differ from the target.
  - Location: gallery header, filters, ordering, and card grid.
  - Evidence: the Pencil frame leads with `Featured and newly added`, recommends six visual items, and filters Components, Blocks, Hooks, and Themes; the implementation labels all 14 items `Available items`, orders them by the compiled index, and exposes Libraries and Files filters.
  - Impact: the page is complete as an inventory but less useful as a curated discovery experience.
  - Fix: introduce a docs-owned featured/order descriptor and type-appropriate filters without changing registry protocol data.

- [P3] Typography and density are close in palette but heavier and more spacious than the Pencil target.
  - Location: page title, cards, sidebar, and metadata panels.
  - Evidence: both use Geist-like typography and the same dark/accent palette, but implementation headings are heavier and cards are taller with more vertical whitespace.
  - Fix: tune heading weights, card preview height, metadata gaps, and rail width after the P1 content is present.

- [P3] The live card intentionally reflects the installable component where the mock was illustrative.
  - Location: ArticleCard author footer and action icons.
  - Evidence: the Pencil card adds an `8 min read` line and neutral outline actions; the published ArticleCard API has no read-time prop and renders its real colored Mantine actions. The implementation also uses one coherent default author in the card and controls instead of the mock's `Avery Stone` / `Ari Mayer` mismatch.
  - Impact: this is visible drift, but changing it only for documentation would make the preview less truthful than the installed source.
  - Follow-up: evolve the registry component API first if read time or alternate action treatments become product requirements.

## Required fidelity surfaces

- Fonts and typography: Geist/Geist Mono direction is preserved; weight and density need the P3 tuning above.
- Spacing and layout rhythm: responsive columns and cards do not overlap or clip, but desktop proportions differ from the custom Pencil shell.
- Colors and visual tokens: dark background, raised panels, subtle borders, pale indigo accent, green requirements, and syntax colors are materially aligned.
- Image quality and asset fidelity: ArticleCard now uses the exact approved Unsplash source as a local 1080 x 721 JPEG, cropped into the real component's 200 px image slot. Gallery cards still have the blocking P1 generic preview treatment.
- Copy and content: registry-derived names, descriptions, commands, dependencies, files, attribution, and Styles API selectors are truthful. Missing preview/prop/usage metadata produces named empty states rather than invented documentation.
- Icons: Starlight icons are consistent and aligned; no custom SVG or CSS-art substitute was introduced.

## Interaction and accessibility receipt

- Tested gallery search (`carousel`), filter-to-empty behavior, card/detail/raw JSON navigation exposure, copy controls, direct `?tab=` state, click selection, ArrowRight tab navigation, source-file switching surface, and mobile layout.
- Tested ArticleCard title/author/rating edits, `onBookmark` feedback, actions on/off, desktop/mobile preview widths, isolated dark/light color schemes, reset, and Copy JSX success. The isolated mobile card settles at exactly 320 CSS px.
- Browser console and page-error streams were empty.
- Axe WCAG 2 A/AA audit initially reported three incomplete ARIA checks caused by labels on untyped `div` elements. Breadcrumb was changed to `nav`, the item-count label was removed, and the filter wrapper became a named `group`.
- Post-fix Axe results: gallery 0 violations / 0 incomplete; ArticleCard Styling 0 violations / 0 incomplete.
- ArticleCard Preview Axe result: 0 violations / 1 incomplete. Axe could not resolve the line-clamped description's effective background because it considered the text overlapped; browser-computed dark values are `rgb(201, 201, 201)` at 0.9 opacity over `rgb(36, 36, 36)`, which remains comfortably readable. The rating badge was darkened from the mock's accent to `#4c5bd5`, clearing its real WCAG AA contrast violation.
- Mobile 390 px captures show no page-level horizontal overflow or overlapping controls; long code remains horizontally scrollable inside its code surface.

## Comparison history

1. First desktop/mobile pass found the two P1 product gaps, two P2 shell/discovery differences, and the ARIA incomplete results above.
2. Fixed the actionable ARIA semantics, rebuilt all 23 pages, reloaded the browser, and reran both audits to clean results.
3. The P1/P2 visual gaps remain intentionally open because this implementation is the registry-detail foundation and truthful Styles API slice, not the completed live-preview/curated-gallery milestone.
4. Replaced the ArticleCard empty state with a docs-owned React adapter that renders the real registry component inside an isolated `MantineProvider`; added the exact source image, viewport/theme controls, editable props, callbacks, reset, and Copy JSX.
5. The first browser render found a broken asset export and unlayered Mantine globals overriding Starlight. Replaced the invalid WebP with the exact source JPEG, moved Mantine to its layered stylesheet, corrected Starlight descendant margins, and matched the approved 520 px card plus 40/400 preview structure.
6. The post-fix matched comparison at 1440 x 1156 resolves the ArticleCard P1. Desktop/mobile interaction, console/error, overflow, and Axe checks pass at the boundary recorded above. The remaining blockers are the gallery imagery and shell/discovery findings.

## Implementation checklist

1. Add real curated gallery previews and featured ordering.
2. Align the header, registry rail, filters, and desktop density with the Pencil frames.
3. Repeat matched desktop comparisons and add a selected mobile design frame before claiming full visual acceptance.

final result: blocked
