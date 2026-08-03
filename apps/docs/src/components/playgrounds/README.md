# Playground adapters — the frozen Wave 2 contract

One file per registry item: `<item-name>.playground.tsx`, default-exporting a
`PlaygroundAdapter` (types in `./contract.ts`). **The file's existence is the registration.**
`RegistryItemDetail.astro`, `SiteHead.astro`, and `PlaygroundHost.tsx` discover adapters via
`import.meta.glob("./playgrounds/*.playground.tsx")` — do not edit any of those files, and do
not add your item to any list anywhere.

`article-card.playground.tsx` is the exemplar. Match its shape and voice.

## Rules

1. **Import the component by relative path** from this directory into `registry/…`
   (five levels up: `../../../../../registry/…`), exactly like the exemplar. Never import
   other docs-app components except `./contract`.
2. **`defaultProps` + `controls`**: 2–4 controls that each visibly change the render
   (`text | switch | select` — see `contract.ts`). Every control's `prop` must exist in
   `defaultProps`. `Reset` restores `defaultProps` verbatim. Size controls with intent:
   `wide: true` for long free text (titles), `compact: true` for short values (ratings,
   counts) — a four-character field must not stretch to author-field width. Aim for the
   controls to share rows tightly, not each squat on its own line.
3. **`render(props, recordEvent)`** returns the live component. Wire `recordEvent` into the
   component's callbacks (`onDrop`, `onRowClick`, …) — the shell surfaces each call as a
   transient toast over the stage (plus a screen-reader announcement). Demo data is defined
   as module constants — realistic, small, no lorem ipsum.
4. **`renderJsx(props)`** returns paste-ready consumer JSX for the CURRENT control values:
   consumer alias imports assumed, real prop values inlined, `() => {}` for callbacks, and
   **never a docs-site asset URL** (swap in a canonical remote URL, like the exemplar).
5. **Extra stylesheets ride in the adapter**: if the component needs a package stylesheet
   beyond `@mantine/core` (e.g. `@mantine/carousel/styles.css`,
   `@mantine/dropzone/styles.css`), add the side-effect import at the top of YOUR adapter
   file. SiteHead only links core.
6. **Demo-only styling** goes in `<item-name>.playground.module.css` next to your adapter,
   applied through the component's Styles API `classNames` where possible. Do not touch
   `custom.css` or `PlaygroundShell.module.css`.
7. **Stage sizing**: tune `stage.desktopWidth` / `stage.mobileWidth` / `stage.minHeight`
   instead of styling the stage. Wide components (tables, grids) want
   `desktopWidth: "100%"`.
8. **The component itself is read-only.** If its API cannot support a sensible playground,
   report that — do not modify registry sources.

## Verifying your adapter

The dev server is user-owned on :4321 — refresh it with
`touch apps/docs/astro.config.mjs`, never by killing it. Your page is
`http://localhost:4321/manteen/registry/<item-name>/` — the Preview section must show the
live frame (not the "Curated preview not published" aside), your controls must visibly
mutate the render, and callbacks must raise the stage toast. Lint your files:
`bunx biome check --write apps/docs/src/components/playgrounds/<item-name>.playground.tsx`.
