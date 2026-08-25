# Manteen site

Status: checked replacement candidate, not the deployed documentation application. CI runs its
type and production builds; the manual Pages workflow still publishes `apps/docs/dist` and the
generated `/r` registry from the Astro/Starlight application.

This clean-room documentation site is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs) and adapted to the Manteen monorepo.

From the repository root:

```bash
bun run site:dev
bun run site:check
bun run site:build
```

The scaffold was created with the Next.js Fumadocs MDX template, a `src` directory, default search,
and `next/og`. AI chat was not enabled. Its generated Biome setup is intentionally replaced by the
repository's root Biome configuration.

Registry item-detail pages are statically generated from the repository's compiled `public/r`
index and item documents. The reader preserves compiled source strings without importing or
evaluating them and refuses raw terminal-control bytes before rendering. Syntax-highlighted views
can normalize visual line endings, so their explicit **Copy exact** action writes the preserved
registry string instead of copying rendered DOM text. Rebuild the artifact with
`bun run build:registry` before checking or building the site. `MANTEEN_BASE_PATH=/manteen bun run
site:build` exercises a sub-path build; internal registry navigation uses `next/link` so Next.js
owns prefixing.

These pages remain local/CI evidence for the replacement candidate. They do not change the live
`/r` artifact, prove that an item installs or previews successfully, or deploy this application.

## Structure

- `src/lib/source.ts` defines the Fumadocs MDX collection through its Macro API.
- `src/app/docs` contains the documentation routes and search endpoint.
- `content/docs` contains the clean-room documentation source.

The promoted homepage implementations in this replacement candidate are independent of their
former prototype sources. The three public `/prototypes/*` route suites and the unused
`InteropStages` comparison were retired after direct import verification. The design process and
promotion decisions remain preserved in the
[`authoring descriptor motion retrospective`](../../docs/research/authoring-descriptor-motion-retrospective.md)
and [`interop motion concept brief`](../../docs/research/interop-motion-concept-brief.md).

No generator version is claimed because it was not captured when the scaffold was created.

See [`docs/project-context.md`](../../docs/project-context.md) for the repository-wide authority and
evidence map.
