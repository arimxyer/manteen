---
name: Manteen
description: Source stewardship presented as a precise editorial field notebook.
colors:
  ink-canvas: "#111318"
  graphite-panel: "#1b1e26"
  raised-graphite: "#22252d"
  active-graphite: "#242833"
  structural-border: "#363b48"
  clear-text: "#f5f7ff"
  quiet-text: "#b8bfcc"
  steward-indigo: "#8495ff"
  verified-mint: "#65d6ad"
  adaptation-amber: "#e8b06a"
  landing-ink: "#0d0e12"
  landing-indigo: "#8f9bff"
  landing-action: "#aab3ff"
  light-paper: "#eef1f7"
  light-panel: "#f6f7fb"
  light-ink: "#171a22"
  light-indigo: "#364fc7"
typography:
  landing-display:
    fontFamily: "Figtree Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 4vw, 3.625rem)"
    fontWeight: 800
    lineHeight: 0.99
    letterSpacing: "-0.033em"
  landing-accent:
    fontFamily: "Fraunces Subset, Georgia, serif"
    fontSize: "clamp(3rem, 4vw, 3.625rem)"
    fontWeight: 400
    lineHeight: 0.99
    letterSpacing: "-0.008em"
  docs-heading:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.625rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  micro-label:
    fontFamily: "JetBrains Mono, Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.75
    letterSpacing: "0.08em"
rounded:
  sm: "0.375rem"
  action: "0.4375rem"
  md: "0.625rem"
  panel: "0.75rem"
  pill: "999px"
spacing:
  "1": "0.35rem"
  "2": "0.5rem"
  "3": "0.8rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
components:
  landing-primary-action:
    backgroundColor: "{colors.landing-action}"
    textColor: "{colors.landing-ink}"
    rounded: "{rounded.action}"
    padding: "0 1.125rem"
    height: "2.625rem"
  registry-search:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.clear-text}"
    rounded: "{rounded.md}"
    padding: "0 0.8rem"
    height: "2.25rem"
  registry-card:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.clear-text}"
    rounded: "{rounded.md}"
    padding: "0.8125rem"
  inline-code:
    backgroundColor: "{colors.active-graphite}"
    textColor: "{colors.clear-text}"
    rounded: "{rounded.sm}"
    padding: "0.15em 0.4em"
  documentation-aside:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.quiet-text}"
    rounded: "{rounded.md}"
    padding: "1rem 1.15rem"
---

# Design System: Manteen

## Overview

**Creative North Star: "The Source Steward's Field Notebook"**

The Source Steward's Field Notebook treats every page as a maintained record: technically exact,
editorially composed, and visibly connected to the source trail behind it. Graphite surfaces,
measured rules, compact labels, code artifacts, and annotated state changes make the product feel
inspectable rather than theatrical. Manny brings human warmth without weakening that precision.

The visual system operates at two tempos. The landing page is an expansive editorial narrative
that explains source stewardship through sequential bands and artifacts. Documentation and catalog
pages become quieter, denser instruments for reading and operating. Both expressions share the
same restrained material logic, semantic state colors, sharp hierarchy, and evidence-first voice.

**Key Characteristics:**

- Editorial narrative over operational exactness.
- Border-led graphite surfaces with restrained responsive elevation.
- Steward Indigo for identity, Verified Mint for resolved state, and Adaptation Amber for change.
- Dense mono metadata paired with highly legible sans-serif prose.
- Manny illustrations used as purposeful guides and state markers.

## Colors

The palette is a dark ink-and-graphite field with a measured light counterpart. Indigo identifies
the product and its plans, mint confirms resolution, and amber keeps local or incoming change
visible without turning every screen into an alert.

### Primary

- **Steward Indigo:** The main interactive and identity accent across navigation, links, focus,
  plan markers, and the landing display accent. The landing page uses a slightly warmer companion
  value to preserve the approved editorial composition.

### Secondary

- **Verified Mint:** Successful, reconciled, healthy, or completed states. It also appears as the
  small guide dot that moves the reader through the source trail.

### Tertiary

- **Adaptation Amber:** Local edits, upstream movement, comparison states, and other facts that
  require attention without implying failure.

### Neutral

- **Ink Canvas:** The documentation page ground, dark enough to keep code and panels distinct.
- **Graphite Panel:** The default contained surface for asides, fields, chips, source rows, and the
  sidebar.
- **Raised Graphite:** A small tonal step reserved for catalog cards and other surfaces that need
  to separate from the base panel.
- **Structural Border:** The persistent one-pixel rule that defines groups, rails, frames, and
  component boundaries.
- **Clear Text / Quiet Text:** A deliberate contrast ladder for primary facts and supporting copy.
- **Light Paper / Light Panel / Light Ink:** The light theme keeps the same monotonic surface order
  and state hierarchy rather than becoming a separate visual language.

**The Source State Rule.** Steward Indigo carries identity and planning; Verified Mint marks
successful or reconciled state; Adaptation Amber marks local or incoming change. These roles do not
trade places.

**The Tonal Ladder Rule.** Canvas, panel, raised panel, and active panel must remain visually ordered
in both themes; borders clarify structure without replacing that hierarchy.

## Typography

- **Display Font:** Figtree Variable with Inter and system sans-serif fallbacks
- **Body Font:** The platform system sans-serif stack in docs; Figtree Variable on the landing page
- **Label/Mono Font:** JetBrains Mono or Geist Mono with a system monospace fallback
- **Editorial Accent:** Fraunces Subset with Georgia fallback

**Character:** The pairing is precise, contemporary, and quietly confident. Figtree supplies the
landing page's strong editorial hierarchy, the system stack keeps long technical documents fast and
familiar, and mono type marks commands, receipts, paths, state labels, and other machine-adjacent
facts. Fraunces adds one human, literary turn inside the landing display rather than becoming a
parallel heading family.

### Hierarchy

- **Landing Display:** A heavy, tightly tracked Figtree headline with nearly solid line spacing;
  only the emphasized phrase changes to Fraunces.
- **Documentation Headline:** A restrained semibold system heading that prioritizes scanning and
  reading over brand display.
- **Section Headline:** Large Figtree headings on narrative bands and system headings in docs,
  always with compact line height and clear separation from body copy.
- **Body:** Comfortable technical prose with approximately 42–75 characters per line depending on
  context. Landing support copy is slightly tighter than documentation prose.
- **Micro Label:** Uppercase mono, compact, bold, and tracked. It is reserved for state, sequence,
  provenance, and section markers rather than ordinary navigation or prose.

**The One Serif Phrase Rule.** Fraunces is a deliberate landing-page accent inside a Figtree display
line, never a second body or heading system.

## Layout

Documentation uses a fixed Starlight header, a persistent desktop sidebar from 50rem upward, a
52rem reading measure, and compact secondary navigation. The catalog uses a two-column card grid
with a one-column collapse below 40rem. Content surfaces align to one reading axis, while code,
tables, and source disclosures gain their own bounded overflow regions when needed.

The landing page uses full-width horizontal bands with a centered maximum canvas, repeated side
gutters, vertical guide rails, and explicit source-state sequences. Wide four-part comparisons and
two-column narrative/artifact compositions progressively collapse at 82rem, 68rem, 48rem, and
30rem. Mobile preserves the story order, shortens the hero scale, and stacks evidence rather than
shrinking it into unreadable miniatures.

Spacing comes from a compact six-step documentation rhythm. Narrative bands may use larger
sectional distances, but their internal controls, labels, and evidence panels return to the same
dense metric.

**The Continuous Record Rule.** Sections connect through aligned rails, repeated gutters, and
visible state sequences; avoid isolated feature islands.

## Elevation & Depth

The system is flat by default and layered by tone. Canvas, panel, raised panel, inset code surface,
and active surface establish depth before any shadow appears. One-pixel borders carry most
structure. The landing page uses no ambient shadow; depth comes from section color, rules, inset
artifacts, and state rails.

### Shadow Vocabulary

- **Responsive Card Hover:** A restrained downward shadow paired with a two-pixel lift appears only
  when a catalog card is actively hovered.
- **Focus Halo:** A two-pixel indigo color-mix halo supplements the visible outline on complex
  controls and bounded regions.

**The Responsive Elevation Rule.** Surfaces are flat at rest. Shadow and lift appear only when
interaction needs feedback, never as ambient decoration.

## Shapes

Documentation uses three durable shapes: gently curved small controls, medium panels, and true
pills for badges or progress tracks. Borders remain crisp and one pixel. The landing page permits a
few tightly bounded radii for actions, code frames, and comparison panels, but its dominant geometry
is rectilinear and rail-driven. Circular forms are status dots, window controls, or Manny artwork—not
default containers.

**The Three-Radius Rule.** Documentation surfaces use the small, medium, and pill tokens; one-off
landing geometry stays tight and never becomes soft SaaS bubble styling.

## Components

### Buttons

- **Shape:** Compact, gently curved, and control-sized rather than oversized.
- **Primary:** The landing action uses a pale Steward Indigo fill, dark ink text, and a compact bold
  label. Documentation controls are quieter icon buttons or text actions.
- **Hover / Focus / Active:** Hover changes tone; active motion moves by a single pixel. Focus uses
  a high-contrast outline with offset. Reduced-motion preference removes nonessential movement.
- **Secondary / Ghost:** Text actions preserve the page background and gain indigo emphasis on
  hover; reset actions read as underlined links because that is how they behave.

### Inputs / Fields

- **Style:** Search fields are compact panel rows with a border, leading icon, transparent input,
  and quiet supporting count.
- **Focus:** The border shifts to Steward Indigo and the shared focus halo appears around the whole
  field, not only the native input.
- **Error / Disabled:** Keep platform or Mantine semantics; do not invent decorative error chrome.

### Chips

- **Style:** Small bordered surfaces with mono content or compact metadata. Semantic badges use the
  established indigo, mint, or neutral roles; package and dependency chips stay quiet.
- **State:** Pills identify kind, source, compatibility, or progress. They are not used as generic
  section containers.

### Cards / Containers

- **Corner Style:** Medium, gently curved corners on documentation cards; landing source cards are
  more rectilinear and joined into sequences.
- **Background:** Raised Graphite for catalog cards, Graphite Panel for ordinary containment, and
  inset ink for code or receipt artifacts.
- **Shadow Strategy:** Flat at rest. Only interactive catalog cards lift on hover.
- **Border:** A visible one-pixel Structural Border is the default frame.
- **Internal Padding:** Compact documentation padding; broader landing cards use space to stage a
  sequence rather than to suggest luxury.

### Navigation

Desktop documentation navigation is quiet semibold text with an indigo underline for the active
section. Mobile navigation becomes a horizontally scrollable row with compact active pills aligned
to the page gutter. The landing page owns a simpler product nav that recedes behind the story.

### Code, Source, and Receipt Surfaces

Code frames use a recessed canvas, unified graphite chrome, mono type, a visible border, and compact
copy controls. Source disclosures are native expandable panels whose header and code body form one
frame. Terminal styling is literal and restrained: it supports command comprehension rather than
simulating a neon console.

### Source Trail

The signature composition joins Installed, Local, Upstream, and Reconciled states into one visual
record. Color rails, mono state labels, small code fragments, and a final Manny state marker make
the lifecycle legible without turning it into a generic stepper.

**The Instrument Rule.** Controls should feel like precise instruments with human warmth: compact,
legible, explicit in state, and never ornamental.

## Do's and Don'ts

### Do:

- **Do** use border-led tonal layering before reaching for shadow.
- **Do** keep Steward Indigo, Verified Mint, and Adaptation Amber tied to their established
  source-state roles.
- **Do** pair generous narrative bands with dense, legible evidence surfaces such as diffs,
  terminals, receipts, and metadata.
- **Do** use Manny as a purposeful guide or state marker, with empty alternative text when the
  surrounding copy already carries the meaning.
- **Do** preserve visible focus, reduced-motion behavior, responsive stacking, and overflow
  affordances.

### Don't:

- **Don't** turn the catalog into a glossy marketplace or the docs into a generic SaaS dashboard.
- **Don't** use neon hacker-terminal spectacle, glass effects, or decorative gradients as shortcuts
  for technical credibility.
- **Don't** add ambient card shadows, oversized pill containers, or soft floating panels to surfaces
  that are currently structured by rules and tone.
- **Don't** expand Fraunces beyond a deliberate editorial accent or replace mono metadata with
  decorative label type.
- **Don't** imply interactivity, live behavior, or evidence that the rendered surface does not
  actually provide.
