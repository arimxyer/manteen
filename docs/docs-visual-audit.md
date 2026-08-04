# manteen docs — whole-site visual QA synthesis

**Sources:** 7 independent auditors (6 browser, 1 code/commit). 68 raw findings → 51 after dedupe.
**Site:** http://127.0.0.1:4399/manteen/ · **Code:** `apps/docs/` · **Pass under review:** `f8a5186 feat(docs): unify the documentation visual system` · **Its self-report:** [`design-qa.md`](./design-qa.md)

> **Archived 2026-08-04.** This is a historical record of the 2026-07-31 audit, kept for the
> reasoning and the measurements. Every screenshot path it cites lived under a session
> scratchpad in `/tmp` and **no longer exists** — the findings below are readable on their own,
> but the images are gone. Re-shoot rather than hunting for them.

---

## Verdict

**Substantiated, and worse than "rough around the edges" implies.** The maintainer's instinct is correct and it has three root causes, all mechanical and all confirmed against the source, not matters of taste.

**Root cause 1 — a leaked Starlight margin rule is silently breaking four flex layouts.** `.sl-markdown-content * + * { margin-top: 1rem }` applies to the children of every flex container the registry renders inside `.sl-markdown-content`. Because the containers stretch, the first child grows to full container height while siblings get 16px of top margin — so they render 16px shorter and 16px lower. This one rule is the sole cause of four defects that three different auditors reported as four unrelated bugs: the detail-page tab strip whose "Preview" tab is 48px tall while the other four are 32px, the gallery filter chips that sit 8px off the search field, the home page's Author/Consume cards staggered a step apart, and the Source tab's file rail. `custom.css:512` already contains the exact fix (`.registry-grid > * { margin-top: 0 }`) — it was applied to one container and never to the other four. **One CSS rule removes four visible defects.**

**Root cause 2 — the "unify" pass added a token vocabulary and never finished wiring it.** I verified this directly with grep: `--manteen-focus-ring` has zero usages, all four surface aliases (`--manteen-canvas`, `--manteen-surface`, `--manteen-surface-raised`, `--manteen-interactive`) have zero usages, and all five `--manteen-space-*` usages sit inside the one component the same commit authored (`.home-overview*`). Meanwhile `RegistryCardPreview.module.css` — which draws every gallery thumbnail — still carries ~16 hardcoded radii off the new scale. So the page still shows 8+ distinct sub-12px radii, 13 font sizes below 14px, and five different sizes for the same uppercase eyebrow role. The tokens exist; the surfaces don't use them. That gap *is* the "rough edges" feeling, mechanically.

**Root cause 3 — third-party chrome (Starlight, Expressive Code) was never brought into the palette.** Inline `<code>` still renders with Starlight's 0px-radius grey fill (9 hard-edged rectangles on the Article Card Preview tab alone, against six other radii on the same page). Expressive Code still draws its own two-tone editor-frame title bar with a near-white 1px hairline — the highest-contrast border anywhere in the dark UI — and its copy button paints opaquely over 40px of the `npx manteen add …` command on mobile.

**And the pass shipped one outright correctness regression.** Its own headline feature — the honest `Static example` / `Registry sample` labels — mislabels Article Card, the single item that actually *is* live, as a static example. The label branches on presentation kind and never checks live-adapter status. The one item the whole product-truth effort was built around is the one item it gets wrong.

**One correction to the auditors themselves:** the home-docs auditor attributed the site-wide header collision to `.site-header__social a { margin-left: -8px }`. **That rule does not exist.** I read `SiteHeader.astro:142-155`: it is `gap: 1rem`, no negative margin (the commit reviewer confirms `f8a5186` removed that hack). Don't go looking for it. The real mechanism is documented in H2 below.

---

## HIGH

### H1 · The Starlight margin leak — one missing CSS rule, four broken layouts
**Reported independently by:** gallery, article-card, mobile (as four separate findings)
**Pages:** `/registry/` (filter chips), `/` (Author/Consume cards), `/registry/article-card/` and all 14 detail routes (tab strip, Source-tab file rail) · both themes · 1440×900 and 390×844

**What's wrong.** Every flex container the registry renders inside `.sl-markdown-content` inherits Starlight's `* + * { margin-top: 1rem }` on its children. With the container's default `align-items: stretch`, the first child (no margin) stretches to the full container height while children 2..n stretch to *height − 16px* and are pushed 16px down. Measured, and the arithmetic matches exactly:

- **Tab strip:** Preview `h=48 y=483`, Usage/Props/Styling/Source `h=32 y=499` (483+16=499). The strip's first tab is the tallest element in the bar *regardless of selection* — so on four of five tabs, the biggest, most prominent target is an **unselected** tab, fighting the small filled pill that actually marks selection. CSS declares only `min-height: 2rem` for all five; nothing intends this. Reproduced on the built preview server at `:4173`, so it is not a dev-server artifact.
- **Filter chips:** search field center y=323, "All" chip center y=331, the other four chips center y=339 — three vertical alignments in one row.
- **Home Author/Consume cards:** left card `y=827 h=213`, right card `y=843 h=197`. Reads as one card dropped a step.
- **Source-tab file rail:** the active file pill is taller, pushing the inactive filename's baseline ~8px lower.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-tabbar-toolbar-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-tabs-firstchild-usage.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-tabs-toolbar-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/crop-dark-controlrow.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-home-overview-stagger.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/home-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-source-files-clip.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/usage-dark-full.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png` (five equal-height tabs on one baseline), `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png` (all five chips on one baseline with the search field)

**Root cause.** `apps/docs/src/styles/custom.css:512` applies `.registry-grid > * { margin-top: 0 }` and stops there. The four unpatched containers are `.registry-tabs` (`RegistryItemDetail.astro:107`), `.registry-filters` (`RegistryCatalog.astro:60`), `.home-overview__grid` (`HomeOverview.astro:11`), `.registry-source-browser__files` (`RegistryItemDetail.astro:393`).

**Fix.** Extend the `custom.css:512` pattern to all four containers (or one `:is(.registry-tabs, .registry-filters, .home-overview__grid, .registry-source-browser__files, .registry-grid) > * { margin-top: 0 }`), then grep for any *other* flex/grid container inside `.sl-markdown-content` — this leak will recur on the next one added.

---

### H2 · Site header: the "Ctrl K" search hint is painted on top of the GitHub icon, on every page
**Reported independently by:** home-docs, gallery, article-card, detail-routes (4 of 6 browser auditors)
**Pages:** every page — `/`, `/registry/`, all 14 detail routes, `/getting-started/`, `/reference/cli/`, `/reference/catalog/`, `/registry-authors/*` · both themes · reproduced at 1280, 1440, 1920

**What's wrong.** The search control's box reserves 32px of flex space while its children paint ~107px. Measured: button box `x=1232→1264` (32px), but the "Search" label renders at `x=1201→1252` and the Ctrl/K kbd at `x=1260→1302`, while the GitHub link occupies `x=1272→1304`. The "K" glyph (`x=1289→1296`) sits directly on top of the GitHub mark. Overflow does not participate in flex layout, so the container's `gap: 1rem` cannot separate them. This is also why axe reports `color-contrast: incomplete` on the two kbd nodes on every page — it can't resolve a background because the icon is painted over them.

This is the single most visible defect on the site: persistent header, above the fold, every page, both themes, all viewports.

*(Auditors reported overlap magnitudes of 30.5px, 30px, and ~6–7px. These differ only by which child element was probed; the mechanism is identical and confirmed in source.)*

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-1440-header-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-light-1440-header-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/crop-dark-header-search-github.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-light-vp.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-header-nav-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/header-zoom.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/header-zoom-light.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png` (three cleanly spaced icon controls)

**Root cause — corrected.** `apps/docs/src/components/SiteHeader.astro:158-171`. The rule clamps Starlight's search button to `width: 2rem; height: 2rem` and tries to hide the children with `:global(.site-header site-search button[data-open-modal] > span), :global(… > kbd) { display: none }` — but the auditors measured computed `display` as `block`/`flex`, so the hide rule is losing. **NOT** the `-8px margin-left` the home-docs auditor named; that rule is not in the file (`.site-header__social` is `display:flex; align-items:center; gap:1rem`).

**Fix.** Drop the fixed `width: 2rem` and let the button size to its actual content (robust regardless of why the hide rule loses). If the icon-only treatment is wanted, first determine *why* `display:none` is being overridden — likely a Starlight `md:sl-block`/`md:sl-flex` utility carrying `!important`, or the `:global()` wrapper changing what ships — and beat it explicitly rather than by guessing.

---

### H3 · The honesty label lies about the one live item
**Reported by:** commits · **independently confirmed in source by me**
**Pages:** `/registry/` and `/` (embedded catalog) · both themes · all viewports

**What's wrong.** `f8a5186` added a `Static example` / `Registry sample` badge to every gallery card, branching purely on presentation kind and never on live-adapter status. I traced it: `article-card` has type `registry:ui` → `registryPresentationKind()` maps that to `"component"` → the card gets **"Static example"**. Article Card is the *only* item with a live playground adapter. The label states the exact opposite of the truth, on the flagship item, on the highest-traffic page.

This directly contradicts design-qa.md's own two claims: *"Added honest `Static example` and `Registry sample` labels to non-live gallery thumbnails"* and *"Article Card is currently the one curated live playground adapter."*

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/live-card-articlecard-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/compare-card-pencil-vs-live.png`
**Root cause.** `apps/docs/src/components/RegistryCatalog.astro:112-114` — `{type === "component" || type === "block" ? "Static example" : "Registry sample"}`. Confirmed against `manteen.registry.json` and `apps/docs/src/lib/registry-presentation.ts:30-44`.
**Fix.** Branch on `hasCuratedPreview` / live-adapter presence, not presentation kind. Article Card should read "Live preview" (or carry no static label at all).

---

### H4 · The `Static example` badge collides with the artwork in 11 of 14 cards
**Reported independently by:** gallery, mobile
**Pages:** `/registry/`, `/` · both themes · 1440×900 and 390×844

**What's wrong.** Programmatic rect-intersection across all 14 cards (run twice, by two auditors, at two viewports): the badge box intersects the mini component's box in **11 of 14**. `position: absolute; top/right: 1.25rem` inside a `.registry-card__preview-link` that carries its own 13px padding puts the pill only ~7px from the visible preview surface, sitting on its 8px corner radius, and nothing in the mini layouts reserves space. Worst cases: Sortable List (covers the "Research" row), Sortable Table and Data Table (cover the table's top-right corner), Cards Carousel (sits on the third "Sedona" swatch), Authentication Form (over the login card header). It reads as a broken overlay, not a label. The Pencil gallery frame has no such badge — previews are clean, uninterrupted miniatures.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-sortablelist-badge.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-light-sortabletable-badge.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-datatable-mini.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-badge-corner.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y1150.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-authform-preview-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-authform-preview-light.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`
**Root cause.** `apps/docs/src/styles/custom.css:420-434`. Also note this rule hardcodes `border: 1px solid #363b48; background: #111318; color: #e8ebf5` as raw literals with **no light-theme override** — a direct counter-example to the "shared semantic tokens" claim.
**Fix.** Move the label out of the preview frame entirely — next to the kind pill in the card header — or reserve a gutter in every mini. Also tokenize its three hardcoded hexes.

---

### H5 · Light theme is 14 near-black slabs punched through a white page
**Reported independently by:** gallery, mobile
**Pages:** `/registry/`, `/`, `/registry/article-card/` · light theme only · both viewports

**What's wrong.** Pixel-sampled: page `#ffffff`, card `#f6f7fb`, but every preview frame is `rgb(36,40,51)` and the Article Card playground stage is `rgb(34,37,45)`. The gallery is a 3×5 grid of 336×142 near-black rectangles on white, each inside an almost-invisible card (card-vs-page contrast 1.07:1) — it reads as a checkerboard, not a catalog. On the detail page a ~460px black stage sits directly under a white panel header, and the frame's 1px light border becomes invisible on three of four sides. On Article Card specifically the demo theme control *works* — clicking it flips the stage to a pale surface that sits correctly — so the defect is precisely the **default**.

**Verdict, since design-qa.md claims this as deliberate** ("Isolated demo-preview color tokens … so miniature examples remain legible"): the *decision* is defensible in the abstract; the *shipped result* is not. Stability of miniatures is not worth making the light theme the harshest surface in the product. The Pencil refs are dark-theme only, so nothing in the approved direction sanctions this. This is a case where the pass optimized a principle past the point where the pixels stopped working.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-light-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-light-dark-thumbnails.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-light-vp.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-light-y620.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-light-y500.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-stage-edge-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/preview-light-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/preview-light-demotoggled.png` (proof the control works)
**Root cause.** `apps/docs/src/components/RegistryCardPreview.module.css:1-31` hardcodes a dark demo palette and reassigns `--manteen-panel-active` / `--manteen-text` inside `.preview`.
**Fix.** Give the previews a light-theme palette, or have the demo canvas follow the page theme on first paint (the toggle already proves the light path renders correctly).

---

### H6 · Card surface separation collapsed to half the design's — cards read as hairline outlines
**Reported by:** gallery · **token wiring confirmed in source by me**
**Pages:** `/registry/`, `/` · dark theme · 1440×900

**What's wrong.** Sampled from rendered pixels: Pencil card `#22252d` on page `#111318` = **1.21:1**. Live: card `#1b1e26` on page `#17181c` = **1.06:1**. Both halves drifted in opposite directions — the card got darker, the page lighter — so the grid loses its raised-panel read and the cards are held together only by a 1px border. This is the strongest single contributor to the "flattened" feeling.

The design's exact card hex is already in the codebase and going unused for this purpose: I confirmed `custom.css:7` defines `--manteen-panel-raised: #22252d` (the Pencil value, exactly), while `custom.css:406` wires `.registry-card` to `--manteen-panel: #1b1e26`.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/compare-card-pencil-vs-live.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/ref-card-articlecard.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/live-card-articlecard-dark.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`
**Root cause.** `custom.css:406` (`.registry-card { background: var(--manteen-panel) }`, rule block at 400-407) should be `--manteen-panel-raised`. Separately, the page background is Starlight's `--sl-color-bg: hsl(224 10% 10%)` = `#17181c` rather than the design's `#111318` (which already exists in-tree as `--manteen-demo-canvas`).
**Fix.** Point `.registry-card` at `--manteen-panel-raised`; darken `--sl-color-bg` toward `#111318`. Two one-line changes.

---

### H7 · Expressive Code chrome was never brought into the palette
**Reported independently by:** article-card, mobile, detail-routes, reference (4 auditors, 4 symptoms, 1 cause)
**Pages:** `/registry/article-card/?tab=source` and `?tab=styling`, all detail routes' Source tab, `/reference/cli/`, `/getting-started/` · both themes · both viewports

**What's wrong.** The code-frame title bar is half-styled and visibly foreign:
- **Two-tone seam.** `SPAN.title` measures `x=502→852, h=35, border-radius "1px 1px 0 0", background rgb(246,247,249)` while the code container runs `x=492→1072` — a lighter 350px "tab" ends abruptly at x=852 and a differently-filled bar continues to the frame edge, producing a hard vertical seam ~60% across the strip, plus a stranded accent rule that starts and stops nowhere meaningful. Most obvious in light theme, where the two fills are white vs grey.
- **Near-white hairline (dark).** Pixel-sampled at y=526: a 1px rule of `rgb(219,228,255)` spanning `x≈48–345` above the file-path title. Every other border on the page is `rgb(54,59,72)`. It is the only high-contrast border in the dark UI and makes the code frame read as a component from a different design system.
- **Radius clash.** The title tab's 1px radius (visually square) against the 6.4/10/12px radii on every neighbouring surface; the copy button at 3.2px.
- **Copy button floats** as a bare 40×40 bordered square over the code rather than a labeled control in the header.
- **No line numbers.** The approved `NhnE6` frame has a numbered gutter, a `article-card.tsx · component · 3.1 kB` meta strip, an "editable source" badge and a labeled "Copy file" button. Live drops all of it and shows a bare repository path. Line numbers are a functional loss for a code viewer, not a stylistic simplification.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-source-header-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-source-header-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-styling-filebar-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-tab-source.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-source-files-clip.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/cards-carousel-source-tab.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/source-panel-zoom.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/cli-codeblock-crop.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/NhnE6.png`
**Fix.** Add an Expressive Code theme override mapping its frame/title/border/copy-button tokens onto `--manteen-*`, and enable the line-number gutter. This is one config surface, not a per-page fix.

---

### H8 · Inline `<code>` is still Starlight's default: 0px radius, raw grey fill
**Reported independently by:** article-card, mobile, reference
**Pages:** every page with prose or metadata — `/registry/article-card/` (all tabs), all detail routes, `/getting-started/`, `/reference/*` · both themes · both viewports

**What's wrong.** All 9 `CODE` elements on the Article Card Preview tab compute `border-radius: 0px` with `background rgb(237,238,243)` (light) / `rgb(53,56,65)` (dark) — the item slug under the H1, the install command, dependency entries, installed-filename chips, requirement values, the event-log status, the callout tokens. Every surface around them is rounded. A radius census on that one tab: **six distinct values (0, 6.4, 7.2, 10, 12, 999) across 41 visible surfaces**, plus 1px and 3.2px on the Source tab — eight radii on one page. Square grey blocks scattered through a rounded page are the most literal cause of "rough around the edges."

Related, same cause: Starlight's asides were never restyled either — the "Next and Tailwind" aside on `/getting-started/` is a fully square-cornered periwinkle block (`rgb(207,212,252)`) with a 4px left accent bar and no border, in a page where every other surface is a 10px-radius bordered panel.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-header-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-files-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-deps-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-aside-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-aside-cards-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/getting-dark-y700.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/sidebar-active-crop.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png` (same content as plain mono text on the panel, no chip fill at all)
**Fix.** Either restyle Starlight's inline-code and aside surfaces onto `--manteen-radius-sm` + the panel tokens, or follow the Pencil direction and drop the chip fill for plain mono. Pick one and apply it globally.

---

### H9 · Neither the radius scale nor the type scale actually reaches the surfaces
**Reported independently by:** article-card, mobile, reference, commits (commits supplies the root cause)
**Pages:** site-wide; densest on `/registry/` and `/registry/article-card/` · both themes · both viewports

**What's wrong — radius.** A computed-style sweep of every bordered/filled surface on `/registry/` returns **4, 4.8, 5.6, 6.4, 7.2, 8, 8.8, 10, 12 and 999px**. Four of them nest four levels deep inside a single card: `.registry-card` 10px → `._preview_` 8px → `._articleMini_` 7.2px → `.registry-card__command` 6.4px. On the home page a `.home-overview__card` (12px, `--manteen-radius-lg`) sits directly above `.registry-card` (10px, `--manteen-radius-md`) in the same scroll — two containers with the same semantic role, different corners. The fractional values (6.4 = 0.4rem, 7.2 = 0.45rem, 8.8 = 0.55rem) also render as mushy corners at dpr 1.

**What's wrong — type.** Census of rendered visible leaf text on the Article Card Preview tab + header: 27 distinct size/weight pairs, **13 sizes below 14px** (9.28, 9.44, 9.92, 10.56, 10.88, 11, 11.2, 11.52, 12, 12.8, 13, 13.12, 13.76). Two clusters are indefensible: the uppercase micro-label role uses **five sizes at weight 700** (9.28 "INSTALL WITH MANTEEN", 9.44 "TITLE/AUTHOR/RATING", 9.92 "COMPONENT", 10.88 "USAGE"/"STYLING", 11.2 "REGISTRY") with three different letter-spacings; inline mono uses six sizes. 9.28px uppercase is below a comfortable reading floor for a docs product. **The fractional values (9.28, 10.88, 13.12) are mechanical proof of compounding relative units rather than a token scale** — which is exactly why a "standardization" pass didn't collapse them.

**Root cause (confirmed by grep).** `f8a5186` introduced `--manteen-radius-sm/md/lg/pill` (`custom.css:19-22`) and applied them through `custom.css` and `ArticleCardPlayground.module.css` — but **`RegistryCardPreview.module.css`, the file that renders every gallery thumbnail, was left entirely off the scale**, with ~16 hardcoded values (0.25/0.3/0.35/0.4/0.45/0.5/0.55rem) at lines 28, 44, 51, 93, 106, 134, 159, 189, 215, 271, 281, 299, 313, 341, 377, 398. The same commit *did* migrate that file's colors to `--manteen-demo-*`, so this reads as an oversight, not an exclusion. Several other values sit within a hundredth of a rem of an existing token and were retyped instead of tokenized: `custom.css:380` (0.75rem vs `--manteen-text-sm: 0.8rem`), `:602` (0.86rem vs `--manteen-text-ui: 0.875rem`), `:904` (0.35rem vs `--manteen-radius-sm: 0.4rem`), `SiteHeader.astro` mobile nav (0.74rem vs `--manteen-text-xs: 0.7rem`).

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y620.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-tab-styling.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-header-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-controls-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-files-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/registry-card-corner-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-1440-cards-radius-crop.png`
**Fix.** Collapse to a real 3-step radius scale (6 / 10 / 999) and one uppercase-eyebrow token (one size, one tracking). Then migrate `RegistryCardPreview.module.css` and hunt the remaining `rem` literals. Replace compounding `em` sizing with absolute token values so sizes stop landing on 9.28px.

---

### H10 · Author notes are rendered twice, verbatim, simultaneously on screen
**Reported independently by:** article-card, detail-routes
**Pages:** `/registry/article-card/?tab=usage`, `/registry/authentication-form/`, `/registry/cards-carousel/`, `/registry/dropzone-button/`, `/registry/mantine-ui-license/` — every item that has authored notes · both themes

**What's wrong.** Confirmed by DOM query on four routes: two headings with `textContent === 'Author notes'` and byte-identical body text — once as an H3 card inside the Usage tab, once as an H2 card in the right rail (`<aside class="registry-metadata">`), roughly 450px apart and both visible at once. On Article Card the shared text is *"Adapted from Mantine UI ArticleCard at ffbf61c559f374a7ea28fcf00355e84dcbe9a908; demo data removed and replaced with typed props."* The approved `U4jTbb` frame carries this content **once**, in the rail, as a short distinct card titled "Adapted from Mantine UI." The duplication makes the layout look unedited, and it is the only reason the Usage panel needs a second card at all.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/usage-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-usage-terminal-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/authentication-form-dark-tall.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/cards-carousel-dark-tall.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/dropzone-button-dark-tall.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/mantine-ui-license-dark-tall.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/cards-carousel-light.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/U4jTbb.png`
**Fix.** Render author notes in the rail only; drop the Usage-tab copy.

---

### H11 · Copy button paints opaquely over the install command (mobile)
**Reported by:** mobile
**Pages:** `/registry/article-card/?tab=usage`, `/getting-started/` · both themes · 390×844

**What's wrong.** In the Terminal frame the command's glyphs extend to `x=346` while Starlight's "Copy to clipboard" button occupies `x=305.6→345.6` with an **opaque** `rgb(35,38,47)` background and `z-index: 1`. **40.4px of `npx manteen add @house/article-card` is unreadable**, and the final glyph sits 8.6px from the pane edge. Same on `/getting-started/`, where `npx manteen info @house/article-card` runs 10px under the button. This is the product's single most important line of text on a phone, and it is covered up.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-terminal-copy-overlap.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/getting-dark-y700.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-tab-usage.png`
**Fix.** Reserve the button's footprint as right padding on the `<pre>`, or give the button a gradient scrim / smaller footprint at mobile widths.

---

### H12 · Playground viewport control: buttons spill 12px below their own fieldset border (mobile)
**Reported by:** mobile
**Pages:** `/registry/article-card/` · both themes · 390×844

**What's wrong.** `_viewportControl_` is a 38.4px-tall bordered fieldset with 3.2px padding (32px content box), but its two 30.4px Desktop/Mobile buttons are offset **+20.2px** from the fieldset top — so they end **12.2px below the fieldset's bottom border**. The fieldset's bottom hairline runs straight through the Desktop pill and the "Mobile" label, and with only 8px to the `_themeButton_` below, the buttons overlap that button's top border by ~4px. Caused by the fieldset/legend box model: the `sr-only` `<legend>` still reserves layout.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-tabs-toolbar-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-light-y500.png`
**Fix.** Take the legend out of flow (`position: absolute` on the sr-only legend) or replace the fieldset with a `div` + `aria-label`.

---

### H13 · Preview toolbar orphaned onto its own row, with mismatched control sizes
**Reported independently by:** article-card, mobile
**Pages:** `/registry/article-card/` · both themes · both viewports

**What's wrong.** In `h42HCk` the Desktop/Mobile/theme controls sit on the **same row** as the tab bar, right-aligned, sharing its vertical center. Live, `_toolbar_` is a separate full-812px-wide row (tablist 478→536, toolbar 552→592, preview frame at 608), leaving a 72px band whose left two-thirds is completely empty and pushing the preview 56px further down. And the two control groups in that row don't match: Desktop/Mobile are `h=30, font-size 12.8px, top y=564`; the theme button is `h=40, font-size 16px, top y=552` — 10px taller, 3.2px larger type, 12px vertically offset. The theme button visibly inherits base body type while its neighbour is styled, so it reads half-finished. At 390px the same mismatch persists (16px "Dark" over 12.8px "Desktop") and the group collapses to an accidental 2+1 stack.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-tabbar-toolbar-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/preview-light-demotoggled.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-controls-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-controls-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-tabs-toolbar-dark.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`
**Root cause.** `apps/docs/src/components/ArticleCardPlayground.module.css` — `_themeButton_` has no font-size/height declaration and falls back to base body type.
**Fix.** Move the toolbar onto the tab row (right-aligned, `align-items: center`) per the ref, and give both control groups one shared size token.

---

### H14 · Mustard/peach "Declaration boundary" callout — the only warm colour in the product
**Reported by:** article-card
**Pages:** `/registry/article-card/?tab=styling` (and any item with this callout) · both themes

**What's wrong.** An informational callout renders as flat olive-brown in dark and pale peach/amber in light, in a page where every other surface is cool blue-grey (panels `rgb(27,30,38)` / `rgb(246,247,251)`). It reads as an error or warning state for neutral explanatory copy, and it is the single most jarring colour transition on the page. It has no border, no icon and no left accent rule, unlike `BlqxN`'s equivalent info block (neutral dark panel, ⓘ icon, subtle border). Compounding it, the `classNames` and `styles` inline-code chips inside keep the global cool-grey fill, so they sit on the warm background as obviously foreign rectangles.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-styling-callout-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-styling-callout-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/styling-light-full.png`
**Pencil ref:** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/BlqxN.png`
**Fix.** Restyle as a neutral panel with a border and an ⓘ icon; reserve warm hues for actual warnings.

---

### H15 · The same H2 renders 35px in the docs shell and 16.8px in the registry shell
**Reported by:** reference
**Pages:** `/reference/cli/`, `/reference/catalog/`, `/getting-started/` vs `/registry/` · both themes · 1440×900

**What's wrong.** Starlight content H2s ("Command overview", "Catalog root", "Item fields") compute to `font-size: 35px, weight 600`. On `/registry/`, the equivalent section heading "Featured and newly added" is also a semantic H2 at weight 600 but computes to **16.8px** — roughly half, reading as bold body text rather than a section heading. This is the loudest "two different products" signal on the site, and it is a byproduct of the pass adding H2 structure to the reference pages without pulling the registry shell's pre-existing heading into the same token scale.

Same seam, smaller: body paragraphs diverge between the shells — docs prose `rgb(53,56,65)` at `line-height 28px` (light), registry copy `rgb(79,88,104)` at `25.6px`. In light theme the colour gap is visually obvious side by side (near-black vs slate-grey); in dark the colour narrows but the line-height mismatch persists in both themes.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/registry-featured-h2-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/registry-dark-full2.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/cli-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/catalog-dark-heading-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/getting-started-p-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/registry-hero-p-crop.png`
**Fix.** Put both shells on one heading + body type scale. The registry H2 should be a section-heading size, not 16.8px.

---

### H16 · Wide reference tables are sliced at the viewport edge with no visual affordance (mobile)
**Reported by:** mobile
**Pages:** `/reference/catalog/`, `/reference/cli/` · both themes · 390×844

**What's wrong.** `.manteen-table-scroll` is 358px wide containing 757px and 861px tables. Every "Meaning" cell is cut mid-word at the container edge — "Discovery, usag", "Declares that th", "Runtime and de" — with no fade, no shadow, no edge gutter, no scrollbar, no "scroll →" hint. design-qa.md claims *"keyboard-focusable, labeled overflow regions for wide tables"*: the `role="region"` / `tabindex="0"` / `aria-label` are genuinely present and correct, but **a sighted phone user gets zero signal that the table continues**, so it just reads as broken text. The semantic claim is true; the visual one was never built.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/catalog-dark-y600.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/catalog-light-y600.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/catalog-dark-y1200.png`
**Fix.** Right-edge gradient mask plus a visible affordance (persistent thin scrollbar or a "scroll" hint chip). Same treatment needed on the Source and Styling code panes.

---

### H17 · Mobile menu button floats 22px below the header row it belongs to
**Reported by:** mobile
**Pages:** `/registry/`, `/getting-started/`, `/reference/*`, all detail routes · both themes · 390×844

**What's wrong.** Starlight's `<starlight-menu-button>` is `position: fixed` at `x=342–374, y=36–68` (center y=52) while every other header control — logo, search, GitHub, theme — centers at `y=30.4`. It hangs 21.6px lower, straddling the gap between the header's two rows and overlapping the nav band. It is also the only solid-white filled circle in the entire header, so it reads as a foreign floating action button pasted on top.

Knock-on effect, same cause: because the fixed button claims the right 48px, `.site-header` is 310px wide on doc pages but 358px on `/` — so clicking Home → Registry visibly slides the search, GitHub and theme controls 48px sideways and reflows the nav columns (three equal 116.7px → natural-width 94.7/94.7/112.6px).

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-header-registry-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-header-home-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-menu-open.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/home-dark-header.png`
**Fix.** Place the menu button in the header's first row as a normal flex item styled like the adjacent 32px icon buttons, so the header has one geometry across the product.

---

### H18 · The license item's Source tab applies code chrome to prose, truncating every line
**Reported by:** detail-routes
**Pages:** `/registry/mantine-ui-license/?tab=source` · dark and light

**What's wrong.** Mantine UI License is a plain-text legal document, but its Source tab renders inside the same fixed-width `white-space: pre` horizontal-scroll panel used for TSX. License prose runs in long unbroken sentences, so **every line is cut mid-word** — "Permission is hereby granted, free of charge, to any person obtai…", "in the Software without restriction, including without limitatio…" (`scrollWidth 687` vs `clientWidth 558`), with no visual affordance. A document meant to be read start-to-finish is effectively illegible without scrolling every individual line. This is the one doc-only item in the catalog and it is presented *worse*, not just differently, than a component's source.

**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/mantine-ui-license-source-tab.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/mantine-ui-license-dark-tall.png`
**Fix.** Detect non-code file types (`.txt`, `.md`) and render them wrapped as prose rather than in the `pre`/code viewer.

---

### H19 · The new token vocabulary is largely dead code — CONFIRMED IN SOURCE, no browser check needed
**Reported by:** commits · **independently verified by me via grep**
**File:** `apps/docs/src/styles/custom.css`

Every one of these I re-ran and confirmed:

| Token | Defined | Usages beyond definition |
| --- | --- | --- |
| `--manteen-focus-ring` | `custom.css:33` | **0** |
| `--manteen-canvas` | `custom.css:15` | **0** |
| `--manteen-surface` | `custom.css:16` | **0** |
| `--manteen-surface-raised` | `custom.css:17` | **0** |
| `--manteen-interactive` | `custom.css:18` | **0** |
| `--manteen-space-1` | `custom.css:23` | **0** |
| `--manteen-space-2..5` | `custom.css:24-27` | 5, **all inside `.home-overview*`** (`:55, :65, :75, :83, :90`) |

Consequences that are visible: three incompatible focus treatments coexist for equivalent controls — `.registry-search:focus-within` uses a border change + its own inline 24%-opacity ring (`custom.css:295-298`, a *different* opacity from the unused 28% token), a large group of buttons/tabs use plain `outline: 2px solid` with no ring (`custom.css:724-731`, mirrored in `ArticleCardPlayground.module.css:86-92`), and `.registry-rail__search:focus-within` — visually the same kind of search input as `.registry-search` — changes only `border-color`, no ring or outline at all (`RegistrySidebar.astro:174-176`). Two visually identical search boxes give different focus feedback.

Every card/panel rule still references `--manteen-panel*` directly, so the four surface aliases add a second unused name for the same four colors without unifying anything.

**Fix.** Either wire the tokens through (focus ring on all four focus treatments; spacing scale across the registry rules) or delete them. A vocabulary nothing uses is worse than none — it makes the next reader believe a system exists.

---

### H20 · Light theme collapsed two distinct semantic accent tokens into one colour — CONFIRMED IN SOURCE
**Reported by:** commits · **verified by me**

`f8a5186` changed light `--sl-color-accent` from `#4c6ef5` to `#364fc7` (`custom.css:39`) to raise contrast. But light `--manteen-accent-soft` was *already* `#364fc7` (`custom.css:49`, untouched). Confirmed by grep:

```
custom.css:3   --sl-color-accent: #8495ff;     (dark)
custom.css:14  --manteen-accent-soft: #c9d4ff; (dark)  ← distinct
custom.css:39  --sl-color-accent: #364fc7;     (light)
custom.css:49  --manteen-accent-soft: #364fc7; (light) ← identical
```

Both are used heavily and side by side for different roles — `--sl-color-accent` for borders/focus rings (`:296-297, :336, :730`), `--manteen-accent-soft` for link/command/badge text (`:114, 205, 543, 601, 666, 779, 893, 930, 1051`). The "interactive accent vs soft accent" distinction that exists in dark mode has been silently erased in light mode. A contrast fix quietly cost a semantic layer.

**Fix.** Pick a distinct AA-passing light value for one of the two (e.g. keep `--sl-color-accent: #364fc7` and move `--manteen-accent-soft` to a lighter/desaturated companion).

---

## MEDIUM

### M1 · Gallery cards have no hover state at all
`/registry/`, `/` · both themes. The card is the page's primary navigation target (thumbnail *and* title are links) yet nothing changes on hover — no border, background, elevation, or title underline. Verified by pixel-identical screenshot diff on hover. `custom.css` has `:hover` rules for `.registry-breadcrumb a`, `.registry-filters button`, `.registry-action`, `.registry-tabs button` and the source file list, but **none** for `.registry-card`, `.registry-card h3 a`, or `.registry-card__preview-link`. In a 14-card drill-down grid, the absence of any pointer affordance is a large part of the "unfinished" feel.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/compare-hover-card2.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/compare-hover-title.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-hover-card2.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-hover-title.png`
**Fix.** Add a border-color + subtle raise on `.registry-card:hover`, plus a title underline.

### M2 · Thumbnail scale is unnormalized — fill ratio ranges 30%–93%, three demos clip
`/registry/`, `/` · both themes, both viewports. All 14 preview frames are identical (336×142 desktop / 326×142 mobile) but the demo inside each sits at a wildly different scale. Mini-width ÷ surface-width: Article Card / Cards Carousel / Page Header / Stats Grid 93%, Dropzone 74%, Auth Form 69%, Sortable List 67%, House Theme 65%, Stat Card 62%, Progress Button 48%, Mantine UI License 46%, Sortable Table 41%, Data Table 37%, Empty State 30%. Top insets measured 1–51.5px; left insets 12px to 113px. **Three demos overflow and are clipped by `overflow:hidden`** — Authentication Form by 11px, Page Header by 6px, Sortable List by 3px. The ref's Data Table thumbnail fills ~91%; live it is 37%, so the two table cards look broken rather than sparse. The grid has no visual rhythm — some thumbnails bleed, some float.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-datatable-mini.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-sortabletable-mini.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y1150.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-authform-preview-dark.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`
**Fix.** Uniform scale-to-fit with a common inset; target ~65–90% fill for all.

### M3 · An unstyled dark rectangle breaks the corner of both table thumbnails
`/registry/` · both themes. Data Table and Sortable Table minis each render a bare dark rectangle top-right of the mock table — presumably a search input — with square corners, no border, no placeholder, and no background distinct from the canvas. It overhangs the mini's rounded top-right corner, cutting a hard notch, and is then half-covered by the `Static example` pill (see H4). Compare the Auth Form mini's email/password fields, which *are* correctly styled — so this is a miss, not a convention.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-light-sortabletable-artifact.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-sortabletable-mini.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/zoom-dark-datatable-mini.png`
**Fix.** Give it the same border/radius/placeholder treatment as the Auth Form fields, or drop it from the mock.

### M4 · Bounded source pane hides 6.5 screens of code behind a hard cut with no signposting
`/registry/article-card/?tab=source` and all detail routes · both themes. `.registry-source-browser__code` is `clientHeight 630 / scrollHeight 4097` with `overflow-y:auto`, and the inner `PRE` is `clientWidth 558 / scrollWidth 855` with `overflow-x:auto`. **Neither scroller has a mask, gradient, visible scrollbar, or expand control.** The last line is sliced by the panel edge mid-statement *and* clipped mid-token at the right edge. Two nested unsignposted scrollers read as a rendering failure rather than a deliberate bound. design-qa.md's claim ("Bounded long source panes and added keyboard-focusable, labeled overflow regions") is half-true: the bound and the a11y attributes exist, the visual affordance does not. Same gap as H16.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-source-bottom-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/source-dark-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/NhnE6.png`
**Fix.** Gradient mask on both axes plus an "Expand" control.

### M5 · The Styling tab is unbounded (~1080px) while Source bounds the same content to 630px
`/registry/article-card/?tab=styling` · both themes. Source caps its code viewport at 630px; Styling's "Editable installed styles" frame runs y≈800→1880 uncapped, making the Styling page 2331px against Source's 1491px. Same content type, two bounding rules, so tab-switching produces a large unexplained jump in page length. It also clips long declarations mid-token with no affordance. `BlqxN` shows this tab as a compact LOCAL CLASS / PURPOSE table plus a theme-token chip row — a scannable block, not a raw CSS dump.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/styling-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/styling-light-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/BlqxN.png`
**Fix.** Apply the Source tab's 630px bound to Styling. Longer-term, follow the ref's table treatment.

### M6 · Usage tab wraps one command in faux-macOS "Terminal" chrome that exists nowhere else
`/registry/article-card/?tab=usage` and all detail routes · both themes. The command block gets a title bar with three grey traffic-light dots and a centered "Terminal" label at 14.4px/500 — a size used by nothing else on the page — with square corners, while the "Author notes" and empty-state cards directly beneath it are rounded, so three stacked blocks change corner language halfway down. **The very same command already appears ~200px above in the install bar** with completely different treatment (eyebrow + plain mono, no chrome): one string, two contradictory containers. `U4jTbb` has no terminal chrome anywhere — code steps are plain bordered rows with a small copy icon.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-usage-terminal-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/usage-dark-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/U4jTbb.png`
**Fix.** Drop the terminal chrome; match the install bar's treatment.

### M7 · Two buttons labeled "Copy command" on one screen, styled as different tiers
`/registry/article-card/?tab=usage` · both themes. The install bar's "Copy command" is the page's only filled primary button (`rgb(201,212,255)` fill dark / solid navy light, h=38, no border). The Usage panel's "Copy command" is a bordered secondary (transparent fill, 1px border). Same label, same action, ~200px apart, two tiers — a viewer cannot tell whether they do different things. The filled variant is also the single highest-contrast element on the dark page and reads harsher than `h42HCk`'s muted blue-grey fill.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-usage-terminal-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/usage-light-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`
**Fix.** One tier for one action; tone the filled variant toward the ref.

### M8 · Props is the only tab with no panel header; its empty state floats in 448px of dead space
`/registry/article-card/?tab=props` · both themes. Usage renders "USAGE / Install the source", Source "SOURCE / Installable files", Styling "STYLING / Author-declared Styles API" — each an eyebrow + H2 + right-aligned action. **Props renders nothing**, opening straight into a vertically centered empty state, so switching to it loses the structural anchor every sibling has. ~250px of content is centered in a 448px panel while the rail beside it runs 866px, leaving the page visibly lopsided. (Context: `a8f1FE` specifies a dense 10-row NAME/TYPE/STATUS/DESCRIPTION table; design-qa.md records the empty state as a deliberate product-truth choice, so the fixable part is the **missing panel header and the density**, not the absent data.)
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-props-empty-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/props-dark-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/props-light-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/a8f1FE.png`
**Fix.** Give Props the same eyebrow + H2 header as its siblings and compact the empty state.

### M9 · Right rail presents the same class of content in three typographic treatments
`/registry/article-card/` and all detail routes · both themes. Dependencies renders entries as mono `<code>` chips with a grey fill (13px). Registry dependencies, the card immediately below, renders its single entry as plain sans body text (11.52px), coloured as a blue underlined link in light and plain grey in dark. Installed files uses a third treatment: a mono chip plus a 9.92px lowercase meta label, on list items inheriting 16px/28px leading while every other rail list runs 11.52px/20px. Same list role, three languages. On mobile the Dependencies `<li>` rows are literally invisible — `background rgb(27,30,38)` and `border-width: 0`, identical to their parent section — so all a reader sees is Starlight's untouched square `<code>` chip floating with 51px of empty space between entries. All three lists are also indented ~10px from their own card heading (heading x=1133, content x=1142.6), so no rail card has a clean left edge.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-deps-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-files-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-aside-cards-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-y1500.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`
**Fix.** One row treatment for all three lists — bordered full-width rows flush with the heading, per the ref.

### M10 · "Declared selectors" mixes two chip languages in one row
`/registry/article-card/?tab=styling` · both themes. On the same row `ArticleCard` renders as a hard-edged grey rectangle (radius 0, no border, ~32px, mono, blue-tinted) while `root image rating title footer action` render as ~24px rounded bordered pills with neutral text. Neither the same height nor the same vertical center. Reads as one styled component beside one unstyled fallback. Root cause is H8 (the square one is a Starlight inline `<code>`).
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-styling-callout-light.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-styling-callout-dark.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/BlqxN.png`

### M11 · Requirements rows are loose, undivided, and label/value don't share a metric
`/registry/article-card/` and all detail routes · both themes, both viewports. Three rows at y=540.7 / 587.9 / 635.1 — a **47px pitch for 22.4px rows**, ~25px of empty space between each with no divider, consuming 180px for three key/value pairs (`h42HCk` fits the same three in roughly half). Within each row `dt` is 12.8px/22.4px and `dd` is 11.2px/19.6px mono, so label and value neither match in size nor share a text center (~1.4–3px offset) — "Mantine / >=9", "Provider / MantineProvider", "Global styles / None" each sit slightly askew.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-requirements-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-aside-cards-dark.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`
**Fix.** Tighter row rhythm plus one shared metric for `dt`/`dd`.

### M12 · Empty state uses a different surface, radius and margin from the grid it replaces
`/registry/` (filter to Hooks) · both themes. `.registry-empty` is a 1124×94 box with `background: transparent`, hardcoded `border-radius: 0.75rem`, `margin-top: 2rem`. Every card it replaces is a filled `--manteen-panel` surface at `--manteen-radius-md` (10px) with `margin-top: 1rem`. The layout visibly jumps when you toggle the filter. The radius is a literal rather than a `--manteen-radius-*` token — another counter-example to the pass's claim. Content is a single muted sentence with no icon and no "clear filter" affordance, **in a product that ships an Empty State component of its own** (`custom.css:550`; the styled `.registry-empty-state` at `:754` exists but isn't used here).
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-empty-hooks.png`

### M13 · Gallery header stat shows "0 published items" while the sidebar reads "14 items"
`/registry/` (filter to Hooks) · both themes. The page-header counter becomes a 29.6px "0" over the caption "published items" while the rail 8px away still shows "REGISTRY — 14 items" and "All items 14". Two contradictory counts visible simultaneously, with a large isolated "0" as the most prominent element in the header. It is a filter-result count wearing a publication-total label.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-empty-hooks.png`
**Fix.** Pin the stat to the catalog total and show the filtered count beside the results heading, or relabel it "0 matching items".

### M14 · Cards keep a hard 354px desktop height at mobile — 58.6px of dead space × 14
`/registry/` · both themes · 390×844. `.registry-card { height: 22.125rem }` (`custom.css:401`) is never relaxed at any breakpoint. At 390px the body content ends 58.6px above the card's bottom edge in **all 14 cards**, while top inner padding is only 13px — bottom padding is 4.5× the top, and the single-column gallery carries ~820px of pure empty scroll. It also makes the card fragile: `overflow: hidden` means a description wrapping to three lines would be silently clipped.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y620.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y1150.png`
**Fix.** `height: auto` below the grid breakpoint.

### M15 · Filter chip rail guillotines the last chip at the viewport edge
`/registry/` · both themes · 390×844. `.registry-filters` has `overflow-x: auto`, `scrollWidth 399 / clientWidth 354`, `padding: 0`, `mask-image: none`. The "Themes" chip starts at x=341.3 and is 77.5px wide, so it is cut at x=390 showing only "The" — its right border and rounded corner vanish at the screen edge with no rail padding and no gradient. Reads as a layout bug rather than a scrollable rail.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-chiprail-rest.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-top.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-chiprail-scrolled.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-chiprail-scrolled.png`
**Fix.** Right-edge fade mask + trailing padding.

### M16 · Discovery block has no vertical rhythm, and the largest semantic break gets the smallest gap
`/registry/` · both themes · 390×844. Consecutive measured gaps: count → search 20px; search → chip rail 38.4px; chip rail → "Featured and newly added" H2 **13.2px**; H2 → sort select 28px; sort → first card 16px. No two are the same and none are on an 8px grid. The 13.2px is the worst: filters→results is the page's largest semantic break yet gets the tightest gap, so the heading visually collides with the chips' rounded bottoms while the filters float loosely from the search field above.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-chiprail-rest.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-top.png`
**Fix.** Monotonic 8px-grid scale with the section break getting the largest step. (This is the `--manteen-space-*` scale's actual job — see H19.)

### M17 · Open mobile drawer is visibly off-center — 31px left gutter vs 19px right
`/registry/` · both themes · 390×844. With the drawer open every row sits at `x=31.2, width=339.8`, ending at x=371. Root cause: `.registry-rail` has asymmetric horizontal padding (`padding-left: 15.2px / padding-right: 4px`) on top of the 16px sidebar padding. That asymmetry may read as a rail hugging a divider on desktop, but as a full-bleed mobile drawer the whole panel looks shoved 12px right.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-menu-open.png`
**Fix.** Symmetric padding at the drawer breakpoint.

### M18 · Playground EVENTS row: "Clear" renders as unstyled plain text on its own line
`/registry/article-card/` · dark · 390×844. At 390px the events strip wraps: row one is the EVENTS micro-label, a faint status dot and a right-aligned "No callbacks yet" chip; row two is **"Clear" as bare left-aligned body text** with no border, background or affordance, followed by empty panel. `h42HCk` puts the whole strip on one line — `EVENTS ● onBookmark fired … now  Clear` — with Clear as a right-aligned control. As shipped it is indistinguishable from a paragraph.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-y1500.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/article-dark-y1000.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`

### M19 · 2 of 14 install commands truncate — and they're the two least guessable slugs
`/registry/`, `/` · both themes, both viewports. `.registry-card__command code` is `white-space: nowrap; text-overflow: ellipsis` at 11.2px. Authentication Form (282px in a 266–276px box) shows `npx manteen add @house/authentication-f…` and Mantine UI License (275px) shows `…@house/mantine-ui-licen…`; the other 12 render in full. In an otherwise identical grid, two truncated rows read as breakage rather than a rule, and the command row is the card's whole payoff. The Pencil ref shows the full string.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y620.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/compare-hover-card2.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-full.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`
**Fix.** ~1px smaller mono, tighter command-row padding, or allow a second line.

### M20 · Home page nav labels are inset ~45px from the gutter everything else aligns to
`/` · both themes · 390×844. `.site-header__nav` splits into three equal 116.7px columns with centered labels, so "Docs" begins at x≈61 while the logo, hero, eyebrow, H2 and every card align to x=16. "Registry authors" also stops ~9px short of the right gutter. On doc pages the same nav uses natural-width left-aligned columns starting at x=16 — so the home page is the odd one out.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-header-home-dark.png`

### M21 · Home page's trailing legal disclaimer has no visual treatment
`/` · both themes. "Manteen is an independent project and is not affiliated with or endorsed by the Mantine team." sits directly beneath the last catalog row with 16px of gap and **no divider, background, border, smaller size, or muted colour** — a plain `<p>` at the same 16px size and nearly the same colour as body copy, inside the same `.sl-markdown-content` flow as the catalog. Every other section boundary on that page gets an eyebrow and/or divider; this one gets neither, so it reads as an accidentally-unstyled trailing line rather than a deliberate footnote.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-1440-disclaimer-crop2.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-1440-disclaimer-crop.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-light-full.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-footer.png`

### M22 · Source-tab file rail is not keyboard-reachable, unlike the code pane beside it
`/registry/article-card/?tab=source` · 390×844. `.registry-source-browser__files` scrolls (`scrollWidth 339 / clientWidth 317`) and carries `aria-label="Source files"` but has **no `tabindex`**, so unlike the `<pre>` directly below it — correctly `role="region" tabindex="0"` — it cannot be reached or scrolled by keyboard. Visually "article-card.module.css" is cut mid-glyph at the rail's right edge with no fade.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/zoom-source-files-clip.png`
**Fix.** Add `tabindex="0"` and a fade mask, matching the code pane's treatment.

---

## LOW

### L1 · Sort control is a bordered box top-aligned with the section heading
`/registry/` · both themes. `.registry-sort`'s select and the "Featured and newly added" H2 share a top edge at y=377, but the select is 36px and the heading's text box 20px, so their optical centers land 8px apart. The ref draws "Recommended" as borderless text with a chevron on the heading's baseline; live it is a 138×36 box with a 1px border and 6.4px radius, giving it more visual weight than the section title beside it.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/crop-dark-controlrow.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`

### L2 · Source file list truncates "article-card.module.…" by 7px in a column with room to spare
`/registry/article-card/?tab=source`, `/registry/cards-carousel/?tab=source` · dark. Filename span `clientWidth 139 / scrollWidth 146` — ellipsised with 7px missing, in a ~190px column inside an 812px main column whose neighbour panel has 579px. The button also has no `title` attribute, so hovering can't recover the full name. Truncating a two-item list by 7px is sloppiness at a glance.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-source-header-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/detail-routes/source-panel-zoom.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/NhnE6.png`

### L3 · Installed-files meta labels read "ui" / "file" and sit 6px off the chip text
`/registry/article-card/` · both themes. `h42HCk` labels the three files "component", "style", "license". Live shows "ui" and "file" — **"file" carries no information at all**, and the two aren't from the same vocabulary. They align to the code chip's outer box edge rather than its text, so each label starts ~6px left of the filename above it. Rendered at 9.92px.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-files-dark.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`

### L4 · Author notes break a raw 40-char commit SHA mid-hash across two lines
`/registry/article-card/` · both themes. The rail card renders "…at ffbf61c559f374a7ea28fcf00355e84dcbe9a90 / 8; demo data removed…", splitting the hash across lines in a 300px card. An unbroken 40-char token in flowing prose produces a bad rag and is unreadable as an identifier. `h42HCk`'s equivalent card carries clean prose with no hash.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-rail-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/preview-dark-full.png`

### L5 · Page header wraps the item slug in a grey chip the ref shows as plain mono; "Mantine >=9" reads as a raw token
`/registry/article-card/` and all detail routes · both themes. `@house/article-card` renders inside a square-cornered grey rectangle (13.76px mono, radius 0) hanging off the left edge of the title with no matching surface in the header block; the ref shows unadorned mono on the page background so H1 and description read as one block. The eyebrow shows "Mantine >=9" with the operator glued to the number where the ref renders "Mantine ≥ 9". (Chip is a symptom of H8.)
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-header-dark.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/h42HCk.png`

### L6 · Install bar nests a grey code chip inside an already-bounded panel
`/registry/article-card/` · both themes. The "INSTALL WITH MANTEEN" panel is a bordered 10px-radius surface and the command inside gets its own square grey fill — a surface on a surface with mismatched corners. Recurs in the playground event log, where "No callbacks yet" gets a chip inside a 7.2px-radius bar inside a 12px-radius panel: three nested surfaces, three radii. (Symptom of H8 + H9.)
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-header-dark.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/article-card/zoom-controls-light.png`

### L7 · Duplicate selector for the same active-nav-link state
`SiteHeader.astro:130-132` and `:134-139` declare `.site-header__nav a[aria-current="page"]` as two adjacent rule blocks (colour, then underline styling added by `f8a5186`) instead of one. Harmless today; a future edit to "the" active-link rule will likely touch only one.

### L8 · Sidebar "All items" active state flattened from indigo to neutral grey — **SUBJECTIVE**
`/registry/` · both themes. Pencil renders the active rail row on an indigo-tinted fill (`#17204d` on a `#111318` sidebar); live it computes `rgb(36,40,51)` with no border and no accent text colour. It is the only selected-state indicator in the rail and now carries no hue, so "where am I" is a barely-perceptible grey step — while the filter chips on the same page still carry a strong accent when active, so two selection systems no longer speak the same language. **Parked as subjective:** the internal inconsistency is a real observation, but the specific hue is a taste call appealing to a dark-only ref.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-dark-vp.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/gallery/gallery-light-vp.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/reference/sidebar-active-crop.png` · **ref** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/pencil-refs/bi8Au.png`

### L9 · Primary tap targets fall under the 44px touch convention — **SUBJECTIVE**
`/registry/` · 390×844. Drawer item links 25.6px tall on a 26.3px pitch (14 stacked); card title links 22px; the per-card copy button 32×26px. **All clear the 24px WCAG 2.5.8 AA floor**, so this is comfort, not failure. Parked as subjective, but noted because the page's whole job is browsing and copying on a phone.
**Evidence.** `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-menu-open.png` · `/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/mobile/registry-dark-y620.png`

### Dropped as taste, not defect
- **H1 sizes differ 42px vs 41.6px across shells** (reference auditor). A 0.4px delta the auditor itself calls imperceptible. It is a rem-base rounding artifact and adds nothing beyond H15, which covers the real cross-shell type problem.

### Excluded — not site defects
- The floating icon cluster appearing mid-page in several full-page screenshots is `<astro-dev-toolbar>`, a dev-server-only overlay. Flagged and correctly excluded by two auditors independently (`/tmp/claude-1000/-home-arimayer-orca-workspaces-mantine-components-cetacean/0b905805-4c8b-4071-9ec2-33a84719599e/scratchpad/audit-shots/home-docs/home-dark-artifact-zoom.png`).
- The home-docs auditor initially misread a code block as staying dark in light mode, and the TOC as inconsistently highlighting — both verified correct on pixel/computed-style check and not reported. Noted for transparency.

---

## Where the previous pass helped vs hurt

An honest ledger against `design-qa.md`'s "Implemented visual system" and "Interaction and accessibility receipt" claims.

### Claims that held up

| Claim | Verdict |
| --- | --- |
| "Made the primary product navigation visible and usable on mobile; removed redundant controls from the mobile sidebar" | **Held.** Verified at 390px: primary nav visible, no duplicated theme/GitHub controls in the drawer. |
| "No page-level horizontal overflow was observed at 390 px" | **Held.** Independently re-verified: `scrollWidth == 390` on all five sampled pages, both themes. |
| "Added a two-path home overview that bridges the product promise… before the embedded catalog" | **Held in substance.** The hero→overview→catalog transition now reads as deliberately bridged (eyebrow, two-path card row, divider, 24–56px section gaps). The previously-flagged abrupt seam is genuinely fixed. *But* the two cards are staggered 16px apart (H1) and the bottom-of-page disclaimer got none of the same polish (M21). |
| "Added explicit full-page and embedded catalog modes with correct H1/H2/H3 hierarchy"; "Replaced the nested detail `main` landmark" | **Held.** Structure is correct across audited pages. |
| "Detail tabs preserve URL state and keyboard tab semantics"; "Registry search, kind filters, and sorting update the visible result count and item set" | **Held.** Verified functional. |
| Radius/text-size tokens threaded through `custom.css` and `ArticleCardPlayground.module.css`; the negative-margin hack and duplicated site-search rule cleaned up | **Held, partially** — see below for where the threading stops. |
| Empty "no live preview" / "no structured props" states are honest, well-worded, consistently sized | **Held** across all six non-flagship routes. |
| Heading hierarchy, callouts, tables, doc-shell sidebar/TOC coherent across doc pages | **Held** *within* the docs shell. Breaks at the shell boundary (H15). |

### Claims that did not hold

| Claim | Verdict |
| --- | --- |
| **"Added honest `Static example` and `Registry sample` labels to non-live gallery thumbnails"** | **Regressed.** The label mislabels Article Card — the one live item — as "Static example" (H3), and collides with the artwork in 11 of 14 cards (H4). The pass's centerpiece feature ships stating the opposite of the truth about its own flagship. |
| **"Added shared semantic tokens for surfaces, text, borders, radii, spacing, controls, focus treatment"** | **Overstated to the point of being false for half the list.** Verified by grep: `--manteen-focus-ring` = 0 usages; all four surface aliases = 0 usages; `--manteen-space-1` = 0 usages; `--manteen-space-2..5` used only inside the one component the same commit authored (H19). "Focus treatment" in particular is *worse* than claimed — three incompatible focus treatments still coexist, and two visually identical search boxes give different feedback. |
| **"Standardized heading weight, section rhythm, controls, cards, metadata, tabs, empty states, source panels"** | **Did not reach the surfaces.** The same H2 renders 35px vs 16.8px across shells (H15); 8+ sub-12px radii and 13 sub-14px font sizes survive (H9); `RegistryCardPreview.module.css` — every gallery thumbnail — was left entirely off the radius scale even as its colors were tokenized in the same commit; tabs, the toolbar and the empty state each still carry their own geometry (H1, H13, M12). |
| **"Bounded long source panes and added keyboard-focusable, labeled overflow regions for wide tables and highlighted code"** | **Half-shipped.** The a11y half is genuinely correct — `role="region"` / `tabindex="0"` / `aria-label` are present and correctly applied only when content actually overflows. The **visual** half was never built: no fade, shadow, gutter, scrollbar or hint anywhere, so a sighted user just sees text sliced at the edge (H16, M4). And the bounding is inconsistent — Source caps at 630px while Styling runs unbounded to ~1080px (M5). The file rail isn't focusable at all (M22). |
| **"Several light-theme secondary labels missed WCAG AA text contrast" → fixed** | **Fixed, with collateral damage.** Raising light `--sl-color-accent` to `#364fc7` made it *identical* to `--manteen-accent-soft`, collapsing two semantic tokens that remain distinct in dark mode (H20). |
| **"Isolated demo-preview color tokens… so miniature examples remain legible and visually stable"** | **Defensible decision, bad outcome — and I'm ruling against it.** The light theme now shows 14 near-black slabs on white and a ~460px black stage under a white panel header (H5). Miniature stability is not worth making light mode the harshest surface in the product. The Article Card theme toggle proves the light path renders fine. |
| **"The home page and light mobile registry each return Axe 4.12.1 results of 0 violations and 0 incomplete checks"** | **Contradicted by measurement.** 2 kbd nodes report `color-contrast: incomplete` on every audited page, caused by H2 painting the GitHub icon over them so axe can't resolve a background. Whatever the pass's axe run measured, it does not describe the shipped header. The pass's own stated explanation for its incomplete nodes ("preview controls overlap layered demo surfaces") describes a different overlap than the one actually causing these. |
| **"The incomplete nodes were also visually inspected in their rendered states"** | **Contradicted by the shipped result.** The kbd nodes' incompleteness is caused by H2, a collision that is above the fold on every page in both themes and that 4 of 6 independent auditors found immediately. I can't see what the pass actually inspected, so I make no claim about the process — only that the header as shipped does not match the described state. |

### The pattern

The pass's build-verification receipt is real and clean — build, biome, 170 tests, typecheck, lint, all four guards, 99 e2e tests all genuinely pass. **None of that touches pixels.** What shipped is a token *vocabulary* plus a self-report written in the past tense about work that was, in several cases, only half-done: tokens defined but unreferenced, an a11y attribute added without its visual counterpart, an honesty label whose logic never checks the thing it claims to be honest about. The maintainer's read — "real churn without the system reaching the surfaces, plus a correctness regression" — is exactly right.

**Suggested repair order.** H1 (one rule, four defects) → H2 (every page, above the fold) → H3 (correctness) → H6 + H5 (two-line token rewires that recover the design's surface separation and fix light theme) → H7 + H8 (third-party chrome, one config surface each) → H9/H19 (finish the token wiring, then delete what stays unused). That sequence removes the large majority of the visible damage for a small amount of CSS.
