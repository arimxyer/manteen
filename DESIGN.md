---
name: Manteen
description: A restrained technical documentation system that proves source ownership with real contracts.
colors:
  canvas-light: "hsl(0, 0%, 96%)"
  canvas-dark: "hsl(0, 0%, 7.04%)"
  ink-light: "hsl(0, 0%, 3.9%)"
  ink-dark: "hsl(0, 0%, 92%)"
  muted-ink-light: "hsl(0, 0%, 40%)"
  muted-ink-dark: "hsla(0, 0%, 70%, 0.8)"
  surface-light: "hsl(0, 0%, 94.7%)"
  surface-dark: "hsl(0, 0%, 9.8%)"
  rule-light: "hsla(0, 0%, 80%, 0.5)"
  rule-dark: "hsla(0, 0%, 40%, 0.2)"
  action-light: "hsl(0, 0%, 9%)"
  action-dark: "hsl(0, 0%, 98%)"
  action-ink-light: "hsl(0, 0%, 98%)"
  action-ink-dark: "hsl(0, 0%, 9%)"
  proof-amber-light: "oklch(0.62 0.16 65)"
  proof-amber-dark: "oklch(0.78 0.15 78)"
typography:
  display:
    fontFamily: "Geist, sans-serif"
    fontSize: "clamp(3.5rem, 7vw, 6rem)"
    fontWeight: 650
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "clamp(1.8rem, 3vw, 2.65rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  action: "0.375rem"
  code: "0.75rem"
spacing:
  compact: "0.75rem"
  group: "2rem"
  section: "clamp(2.5rem, 7vw, 5.5rem)"
components:
  button-primary-dark:
    backgroundColor: "{colors.action-dark}"
    textColor: "{colors.action-ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "0.5rem 1rem"
  button-primary-light:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.action-ink-light}"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "0.5rem 1rem"
---

# Design System: Manteen

## Overview

**Creative North Star: "The Proof Ledger"**

Manteen inherits the calm, neutral utility of Fumadocs and adds one precise technical signature:
real source contracts traced in amber. The visual system should feel authored for developers without
turning monospace, terminals, or data into decoration.

Marketing surfaces earn confidence through inspectable examples, strong type, and deliberate
spacing. Product truth remains more important than spectacle, but the composition can be bold when
the evidence stays real.

**Key Characteristics:**

- Fumadocs neutrals in both light and dark themes
- Large, tightly tracked Geist display type with JetBrains Mono reserved for code and paths
- Hairline rules, staggered evidence surfaces, and one rare amber trace
- Flat structure at rest with restrained depth around executable evidence

## Colors

The palette is neutral-first and theme-aware. Amber is an annotation color, not a fill color or a
second brand surface.

### Primary

- **Proof Amber:** Marks the line, icon, or contract node that connects a claim to its evidence.

### Neutral

- **Canvas:** The site-wide Fumadocs background for each theme.
- **Ink:** Primary copy and interface labels.
- **Muted Ink:** Explanatory copy and metadata that remains readable without competing with headings.
- **Surface:** Low-contrast code and proof-band separation.
- **Rule:** One-pixel dividers, grids, and boundaries.

### Named Rules

**The One Trace Rule.** Amber identifies proof relationships and stays a minority color on every
screen.

**The Semantic Theme Rule.** Components consume Fumadocs semantic roles so light and dark modes keep
the same hierarchy rather than merely inverting literal colors.

## Typography

**Display Font:** Geist (sans-serif fallback)
**Body Font:** Geist (sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (monospace fallback)

**Character:** Geist supplies a compact, modern documentation voice; JetBrains Mono makes source
paths and commands legible without becoming a generic technical costume.

### Hierarchy

- **Display** (650, responsive up to 6rem, 0.94): Hero promises only; balance the real copy and never
  exceed the six-rem ceiling.
- **Headline** (600, responsive up to 2.65rem, 1.08): Section claims and proof-band titles.
- **Body** (400, 1rem, 1.7): Explanations with a practical maximum measure of about 62–65 characters.
- **Label** (400, 0.72–0.875rem): Code, source paths, and compact metadata only.

### Named Rules

**The Source Only Rule.** Monospace means executable code, registry data, file paths, or measured
values; ordinary marketing language remains Geist.

## Layout

Primary surfaces use a centered 72rem maximum container with three-rem desktop gutters and two-rem
phone gutters. The home surface begins on a 12-column grid, then collapses to one column at 52rem;
proof copy precedes its evidence in the responsive reading order. Staggered proof bands may narrow by
four rem and alternate alignment on wide screens, but mobile surfaces return to the full reading
width. At 34rem, actions stack and structural backgrounds recede so copy and evidence retain the
available width.

Spacing distinguishes relationships: compact controls use the compact step, claim-and-evidence
groups use the group step, and independent proof sections use the responsive section step.

## Elevation & Depth

The system is flat by default. Borders, tonal surfaces, and spacing create structure; code evidence
alone may carry a soft ambient shadow (`0 1.25rem 3rem -2rem`) to distinguish an executable artifact
from surrounding explanation.

### Named Rules

**The Evidence Earns Depth Rule.** Shadows belong to code or similarly inspectable artifacts, never
to empty marketing containers.

## Shapes

Buttons use compact six-pixel corners, code surfaces use twelve-pixel corners, and large layout bands
stay orthogonal. One-pixel rules do more structural work than rounded cards. Focus rings follow the
Fumadocs ring token and sit outside the component edge.

## Components

### Buttons

- **Shape:** Compact rounded rectangle (0.375rem) with a minimum 2.75rem touch height on marketing
  surfaces.
- **Primary:** Fumadocs primary and primary-foreground roles with one-rem horizontal padding.
- **Hover / Focus:** A small arrow translation may reinforce forward navigation; focus keeps a clear
  two-pixel semantic ring and reduced motion removes the transition.
- **Secondary:** Transparent outline treatment with equal dimensions and lower emphasis.

### Cards / Containers

- **Corner Style:** Proof bands stay square; code surfaces use the code radius.
- **Background:** Proof bands use a restrained mix of the semantic card surface and canvas.
- **Shadow Strategy:** Flat for claims, ambient only for code evidence.
- **Border:** Hairline block-axis rules; amber may replace one pixel of the top rule as an interactive
  proof trace.
- **Internal Padding:** Responsive, between two and three-and-a-half rem on wide screens; mobile bands
  shed side padding to preserve measure.

### Navigation

Use the native Fumadocs home layout, search, theme control, and link behavior. Icon-only links require
an accessible link label while their nested decorative SVG stays hidden from assistive technology.

### Proof Band

Pair one declarative claim with a real code fragment, registry flow, or source contract. Vary the
evidence form and band alignment so a sequence never collapses into equal feature cards.

## Do's and Don'ts

### Do:

- **Do** use real registry fields, paths, and CLI commands as the visual proof.
- **Do** keep consumer source ownership primary while preserving a visible registry-author path.
- **Do** verify the actual copy at desktop, breakpoint-adjacent, and phone widths.
- **Do** preserve keyboard focus, reduced motion, and both semantic themes.

### Don't:

- **Don't** fabricate customers, benchmarks, testimonials, or a completed registry catalog.
- **Don't** turn the page into a grid of equal icon-heading-text cards.
- **Don't** use the retired Starlight landing page as visual authority.
- **Don't** use amber as a large background wash or monospace as decorative atmosphere.
