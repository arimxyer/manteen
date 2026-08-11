# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a React and Mantine developer evaluating, installing, adapting, or maintaining
editable component source in a real application. They need to understand what will enter their
project, what Manteen owns, what remains theirs to change, and how later registry changes interact
with local work.

Registry authors are the secondary audience. They use Manteen Kit to describe, validate, compile,
preview, and publish Mantine-native registries without depending on a central registry service.

Coding agents and automation are a first-class operating context across both audiences. They need
stable inspection surfaces, explicit authority boundaries, parseable outcomes, and enough evidence
to explain a refusal or proposed mutation before acting.

## Product Purpose

The documentation site explains and demonstrates the complete source-owned component lifecycle. A
consumer should be able to discover and inspect registry items, preview a plan, install source,
integrate it deliberately, adapt it as ordinary project code, compare local and upstream changes,
and maintain or explicitly remove that source without losing track of its lineage.

The site also teaches authors how to create and publish deterministic registries. It documents the
same generated registry contract that it serves, so human guidance, catalog presentation, and the
machine-readable `/r/` surface must remain truthful to one another.

Success means a developer can make the next safe decision in this lifecycle without mistaking an
install receipt for application integration, a conflict-free text merge for behavioral proof, or a
preview for a completed mutation.

## Positioning

Manteen is a source-owned, Mantine-native registry toolchain. It installs composed component source
that a project is expected to edit while preserving the registry identity, pristine ancestry, and
accepted local state needed to understand future updates.

Its distinctive mechanism is inspect-before-write source stewardship: deterministic discovery,
read-only plans, explicit plan identity, receipt-backed provenance, conservative three-way updates,
and named destructive choices. Manteen Kit supplies the corresponding author-side contract for
deterministic registry output. A component gallery or package installer cannot truthfully claim this
maintained-local-source lifecycle merely by copying files into a project.

## Operating Context

Consumers work from an existing React application with Mantine as an ordinary npm dependency. They
use the Manteen CLI to initialize supported frameworks, inspect configured and installed state,
discover registry items, preview mutations, install source, compare revisions, update adaptations,
and explicitly prune files proven absent upstream. Installed files still have to be imported and
composed where the product needs them.

Authors work with normal source files and `manteen.registry.json`. Manteen Kit compiles that
authoring catalog into static registry JSON, validates the result, and owns generated output through
an explicit deterministic receipt. Any suitable static host can serve the compiled registry.

Agents inspect the installed CLI surface first, prefer the stable JSON command envelope, retain a
preview's plan digest, and apply the same inputs with the expected-plan boundary. JSON mode removes
prompting but never supplies overwrite, discard, deployment, or publication authority.

The docs application is an Astro and Starlight web project with React playgrounds. It is deployed
under the `/manteen` base path, while the same static artifact serves the generated registry under
`/r/`. Documentation deployment remains a separate acceptance boundary from package release.

## Capabilities and Constraints

- The site includes a product landing page, getting-started path, agent guide, registry catalog and
  item details, registry-author guidance, concepts, and CLI/catalog reference.
- Human-facing registry pages derive their claims from the generated registry contract and curated
  presentation data. Rebuild `../../public/r/` before trusting registry-backed docs or tests.
- The public `/r/` output is a machine contract. Documentation work must preserve its base-path-safe
  URLs and must not silently alter generated item bytes or expose author-only ownership files.
- Manteen installs and maintains source; it does not infer application placement. A healthy receipt
  or successful add is not evidence that a component renders in a consumer application.
- Local adaptations are preserved by default. Replacement, upstream reset, and deletion require
  explicit, narrowly scoped intent and are never presented as routine retries.
- A preview, fixture, source-tier test, built-Node test, hosted workflow, published package, fresh
  consumer, browser audit, and public deployment are different evidence boundaries. The site must
  not collapse them into a stronger claim than they prove.
- Optional registry metadata is author-supplied and must degrade honestly when absent or malformed.
  A public Styles API may be documented only when the installed component genuinely exposes the
  declared `classNames` or `styles` surface and automated checks catch declaration/implementation
  drift. Editable internal CSS is not sufficient evidence.
- Registry previews must identify whether they are live, curated, static, unavailable, or otherwise
  bounded. A rendered example must not imply unsupported interactivity or universal integration.
- Secrets and expanded registry URL variables must never appear in diagnostics, receipts, plans,
  documentation examples, or generated evidence.
- Signed tags, npm publication, and documentation deployment remain separately authorized actions.

## Brand Commitments

The product name is Manteen. Its durable verbal commitments are **source-owned**, **Mantine-native**,
and **agent-safe**. Copy should be technically precise, direct about authority and destructive
consequences, and careful not to turn implementation or test evidence into a product claim.

Manny, the Manteen mascot, is a binding product asset. Reyamira attribution is retained. The site
must continue to state that Manteen is an independent project and is not affiliated with or endorsed
by the Mantine team.

## Evidence on Hand

- `../../manteen.registry.json` and `../../registry/` contain the live authoring catalog and source.
- `../../public/r/` is the generated machine-readable registry surface; it is build output, not an
  independently authored documentation source.
- `src/components/playgrounds/` contains curated adapters for supported catalog demonstrations.
- `src/components/home/LandingPage.astro` and `src/assets/manny/` contain confirmed product copy and
  mascot assets.
- Repository handoffs and the roadmap distinguish source tests, built-Node acceptance, hosted CI,
  package publication and provenance, fresh-consumer checks, browser audits, and public Pages
  acceptance. Future claims must preserve those distinctions and refresh time-sensitive evidence.
- There are no approved testimonials, customer logos, adoption metrics, benchmarks, pricing claims,
  or Mantine endorsement. Future work must not fabricate them.

## Product Principles

1. **Source stewardship over opaque installation.** Help users own and adapt source without losing
   the lineage needed to maintain it.
2. **Inspect before writing.** Discovery, plans, diffs, diagnostics, and explicit authority precede
   every meaningful mutation.
3. **Preserve local intent.** Local adaptations are expected product state; destructive replacement
   stays exceptional, named, and narrowly authorized.
4. **Keep evidence boundaries visible.** State exactly what a preview, test, receipt, build, release,
   or deployment proves and what it does not.
5. **One truthful contract for humans and machines.** Docs, catalog presentation, agent guidance,
   and generated registry output must describe the same supported behavior.

## Accessibility & Inclusion

The docs product targets WCAG 2.2 AA. Core reading, navigation, catalog discovery, item inspection,
copy actions, tabs, filters, playground controls, and responsive layouts must remain usable with a
keyboard, visible focus, sufficient contrast, semantic structure, and appropriate accessible names.
Automated checks support this requirement but do not replace keyboard, responsive, overflow, theme,
and assistive-technology-oriented review of the shipped interaction.
