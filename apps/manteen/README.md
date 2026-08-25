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
