# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Manteen primarily serves React developers using Mantine who want to install source components into
an application, keep ownership of those files, and maintain them without silently losing local
adaptations. Registry authors are a second audience: they need to describe Mantine-native source in
Mantine vocabulary and compile it into an interoperable registry contract.

## Product Purpose

Manteen is a Mantine-native component registry and the toolchain around it. It helps authors publish
composed source components and helps consumers initialize, inspect, install, update, diff, and remove
that source with explicit safety boundaries. Success means the consuming project owns editable
source while the registry remains useful for discovery and maintenance.

## Positioning

Authors work in a Mantine-specific catalog rather than hand-authoring wire-format documents. Manteen
compiles that catalog to an interchange format other registry clients can consume, while its own CLI
adds Mantine-aware initialization, requirements, theme composition, receipt-backed maintenance, and
local-adaptation preservation that the generic format cannot express by itself.

## Operating Context

The repository is a Bun workspace containing the live registry, `manteen-kit` for authors, `manteen`
for consumers, and a Next.js/Fumadocs documentation application. Consumers run Manteen from an
existing application root and review machine-readable dry-run plans before mutation. Registry
authors build static `/r` documents from a versioned catalog and source tree.

## Capabilities and Constraints

- Local adaptations are preserved by default; destructive replacement and verification bypasses are
  separate, explicit choices.
- Registry documents, local synthetic proof, consumer builds, and public release evidence remain
  distinct.
- The documentation must not imply that local receipt health proves the host application builds.
- The home page may promote real capabilities, commands, and source contracts, but must not invent
  customer claims, benchmarks, testimonials, or a completed visual registry catalog.
- Manteen is independent and is not affiliated with the Mantine team.

## Brand Commitments

The product name is Manteen. Its voice is direct, technical, and confident without hiding safety
conditions. The clean-room site inherits Fumadocs' typography, navigation, neutral palette, and
component character. The retired Starlight landing page is not visual authority or source material.

## Evidence on Hand

- Product and architecture truth: `README.md`, the named build-plan documents under `docs/`, and the
  package READMEs.
- Current public-facing clean-room content: `apps/manteen/content/docs/`.
- Real CLI commands and safety contracts exist for initialization, add, update, diff, removal,
  status, and registry authoring.
- The registry catalog UI has not yet been rebuilt in the clean-room application and must not be
  represented as finished.

## Product Principles

- Installed source belongs to the consuming project.
- Make planned mutations inspectable and destructive authority explicit.
- Keep Mantine-native authoring richer than the interchange format without sacrificing interop.
- Demonstrate contracts with real commands and evidence instead of generic feature claims.
- Let documentation and machine-readable behavior describe the same product.

## Accessibility & Inclusion

The web experience must remain responsive, keyboard-usable, zoomable, and compatible with WCAG A/AA
automated checks across supported light and dark themes.
