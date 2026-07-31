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
- Combined comparison inputs:
  - `/tmp/manteen-qa/gallery-comparison.png`
  - `/tmp/manteen-qa/article-preview-comparison.png`
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

- [P1] ArticleCard Preview is still an honest empty state instead of the approved live preview and playground.
  - Location: ArticleCard Preview tab.
  - Evidence: the Pencil frame renders the real card, device/theme controls, editable props, event feedback, reset, and copy JSX; the implementation says `Live preview not published yet`.
  - Impact: the core evaluation and experimentation workflow is not implemented.
  - Fix: add a docs-owned, curated ArticleCard preview adapter that renders the real component in `MantineProvider`; do not evaluate arbitrary registry source. Wire the approved controls and callback feedback.

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

## Required fidelity surfaces

- Fonts and typography: Geist/Geist Mono direction is preserved; weight and density need the P3 tuning above.
- Spacing and layout rhythm: responsive columns and cards do not overlap or clip, but desktop proportions differ from the custom Pencil shell.
- Colors and visual tokens: dark background, raised panels, subtle borders, pale indigo accent, green requirements, and syntax colors are materially aligned.
- Image quality and asset fidelity: blocking P1; the design's component preview imagery is not present in the implementation.
- Copy and content: registry-derived names, descriptions, commands, dependencies, files, attribution, and Styles API selectors are truthful. Missing preview/prop/usage metadata produces named empty states rather than invented documentation.
- Icons: Starlight icons are consistent and aligned; no custom SVG or CSS-art substitute was introduced.

## Interaction and accessibility receipt

- Tested gallery search (`carousel`), filter-to-empty behavior, card/detail/raw JSON navigation exposure, copy controls, direct `?tab=` state, click selection, ArrowRight tab navigation, source-file switching surface, and mobile layout.
- Browser console and page-error streams were empty.
- Axe WCAG 2 A/AA audit initially reported three incomplete ARIA checks caused by labels on untyped `div` elements. Breadcrumb was changed to `nav`, the item-count label was removed, and the filter wrapper became a named `group`.
- Post-fix Axe results: gallery 0 violations / 0 incomplete; ArticleCard Styling 0 violations / 0 incomplete.
- Mobile 390 px captures show no page-level horizontal overflow or overlapping controls; long code remains horizontally scrollable inside its code surface.

## Comparison history

1. First desktop/mobile pass found the two P1 product gaps, two P2 shell/discovery differences, and the ARIA incomplete results above.
2. Fixed the actionable ARIA semantics, rebuilt all 23 pages, reloaded the browser, and reran both audits to clean results.
3. The P1/P2 visual gaps remain intentionally open because this implementation is the registry-detail foundation and truthful Styles API slice, not the completed live-preview/curated-gallery milestone.

## Implementation checklist

1. Add the docs-owned ArticleCard live preview and playground.
2. Add real curated gallery previews and featured ordering.
3. Align the header, registry rail, filters, and desktop density with the Pencil frames.
4. Repeat matched desktop comparisons and add a selected mobile design frame before claiming full visual acceptance.

final result: blocked
