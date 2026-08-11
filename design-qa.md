# Landing Study F design QA

**Evidence**

- Source visual truth: `pencil/exports/landing-study-f-reference/aGeM6.png`, exported from Pencil node `aGeM6` (`Landing Study F — Canonical Manny`).
- Focused source truth: `pencil/exports/landing-study-f-reference/reconcile/gFZuc.png`, exported from Pencil node `gFZuc` (`Reconcile — Compare Before Writing`).
- Rendered implementation: `http://127.0.0.1:4321/manteen/preview/hero-d/`.
- Current Pencil export: `/tmp/manteen-owner-review/source/aGeM6.png` (1579 × 6749).
- Current implementation screenshot: `/tmp/manteen-owner-review/screenshots/1579-full-loaded.png`.
- Current full-view comparison: `/tmp/manteen-owner-review/screenshots/1579-full-compare.png` (source left, implementation right).
- Focused hero comparison: `/tmp/manteen-owner-review/screenshots/hero-compare.png` (source left, implementation right).
- Focused reconcile comparison: `/tmp/manteen-study-f-reconcile-compare.png` (source left, implementation right).
- Responsive evidence: real Chromium captures at 390 × 844 and 320 × 700 under `/tmp/manteen-owner-review/screenshots/`, with measured DOM overflow checks and axe-core 4.12.1 runs at both phone widths.

**Normalization**

- Source export: 1917 × 8192 pixels. Pencil capped the requested 2× export at 8192 pixels tall.
- Source normalized copy: 1579 × 6748 pixels, matching the Study F canvas's 1579 CSS px width and full content height.
- Implementation capture: Chromium, 1579 CSS px wide, device scale factor 1, hidden scrollbar; normalized to the current 1579 × 6749 Pencil export for the full-view comparison.
- Focused hero: 1579 × 1000 pixels on both sides.
- Focused reconcile: 1579 × 1150 pixels on both sides. The implementation was scrolled into view before capture so its intentionally lazy-loaded Manny image was present.
- State: dark theme, default navigation and CTA state, no authentication, no user data, review route and production home using the same Astro component.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: Figtree, Fraunces, and JetBrains Mono roles, weights, wrapping, tracking, and hierarchy match the source. The final hero comparison confirms `Source you own,` remains one line at the target width.
- Spacing and layout rhythm: all seven bands retain the source order, width, section heights, rails, grids, borders, and dark-surface hierarchy. Desktop, 390 px, and 320 px layouts show no page-level horizontal overflow, clipping, or mascot/content collisions.
- Colors and visual tokens: canvas background, panels, dividers, purple/amber/green states, text, and muted-copy values map to the Pencil variables. No replacement gradients or decorative CSS art were introduced.
- Image quality and asset fidelity: all nine approved transparent Manny assets are used directly. Nine rendered images were present, with zero broken images. The hero's reconciled card uses Welcome Manny; the closing CTA uses Success Manny; and the compare-diffs section uses the approved green/red document version.
- Copy and content: Study F's product language is retained, including the explicit installed-versus-in-use distinction, plan verification language, ecosystem split, and independence disclaimer. The Pencil canvas's accidental EDIT step-number text was rendered as the intended `02`.
- Icons and controls: Tabler icons preserve one consistent stroke family. Product navigation, footer links, primary CTAs, and the copy button are semantic and labeled.
- Accessibility: sections have labelled headings, navigation landmarks are named, decorative Manny images use empty alt text, focus-visible treatment is present, and mobile tap targets remain usable. Axe reports zero violations at 1579, 390, and 320 px; its remaining color-contrast result is explicitly incomplete/manual-review rather than a reported failure.

**Interaction and runtime evidence**

- All rendered links had non-empty resolved `href` values.
- The page rendered seven sections, nine images, zero broken images, and no page-level horizontal overflow. At 320 px, only the install command and source diff are horizontally scrollable; both regions are keyboard-focusable and preserve readable code without shrinking it into illegibility.
- Browser console: zero errors after adding the approved-Manny favicon. The earlier default `/favicon.svg` 404 is fixed.
- The final owner-review browser run exercised the real copy button successfully: it requested the exact command `npx manteen add @house/article-card --dry-run --json` and changed the visible label to `Copied`. An earlier environment-denied run had already verified the visible `Copy unavailable` refusal path without a console error.

**Comparison history**

- P2 — inherited Starlight markdown rhythm and code-pill styles altered the artifact geometry. Fixed by resetting markdown sibling margins and inline-code chrome inside the Study F component boundary. Post-fix evidence: full-view and focused comparisons listed above.
- P2 — the initial hero implementation wrapped `Source you own,` across two lines. Fixed by removing the artificial 11-character heading maximum. Post-fix evidence: `/tmp/manteen-study-f-hero-compare.png`.
- P2 — the initial automated full-page capture appeared to omit the reconcile Manny. The focused Pencil node export established the intended bounds; the implementation's stacking order was made explicit, and the section was scrolled into view before capturing its lazy image. Post-fix evidence: `/tmp/manteen-study-f-reconcile-compare.png` and Pencil's focused `img[src*='manny-comparing-diffs']` capture.
- Runtime polish — Starlight requested a missing default favicon and logged a 404. Fixed with a 64 × 64 favicon derived from the approved Manny asset and an explicit Starlight favicon setting. Post-fix browser check reported zero console errors.
- P1 — the earlier responsive claim came from Pencil's 998 px integrated browser, not a phone viewport. A fresh 390/320 px Chromium pass found Compare Manny crossing the destructive-warning/transaction copy. Fixed by moving Edit and Compare Manny into normal document flow on phones and removing their fixed spacer padding. Post-fix evidence: `390-reconcile-bottom-after.png`, `320-edit-manny-after.png`, and `320-reconcile-manny-after.png`.
- P1 — at 320 px the install terminal expanded to 474 px inside a 278 px card and was clipped. Fixed by constraining the command row and making its command an explicit keyboard-focusable horizontal scroll region.
- P2 — individual source lines became unfocusable overflow regions at 320 px. Fixed by moving horizontal scrolling to one labelled, keyboard-focusable source-diff region.
- P2 — the designed footer was followed by Starlight's empty 72 px footer and extra main padding. Both framework leftovers are suppressed only on Study F routes; the page now ends exactly at the independence disclaimer.
- P2 — the hero's reconciled card first used Mantine Ambassador Manny and was then briefly switched to Success Manny. Final owner review established Welcome Manny as the intended asset; the card now uses the approved Welcome Manny while Success Manny remains in the closing CTA.
- Final owner review — the current Pencil selection identifies `Hero B Manny — Welcome`, and the revised 1579, 390, and 320 px implementation captures all show that same Welcome Manny pose. The post-fix full-view and focused comparisons listed above have no new actionable P0/P1/P2 differences.

**Open Questions**

- None blocking. The Astro development toolbar is visible in local development captures and absent from the static production build; it is browser tooling, not page content.

**Implementation Checklist**

- [x] One shared component drives the home and review routes.
- [x] Approved Manny assets replace every placeholder or old sprite.
- [x] Desktop source comparison has no actionable P0/P1/P2 drift.
- [x] 390 px and 320 px layouts have no overlap, clipping, or page-level horizontal overflow; dense code regions scroll intentionally and remain keyboard-accessible.
- [x] Primary navigation, CTAs, and copy refusal/success handler paths were checked.
- [x] Browser console is clean.
- [x] Astro checks, static build, registry build, repository tests, lint, guards, and built-Node e2e pass.

final result: passed
