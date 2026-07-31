# Documentation site handoff

Status: **implementation and local acceptance complete; first hosted Starlight deployment pending.**

## Question and stopping condition

Can Manteen replace its generated one-page catalog with a maintainable public documentation system
without changing the `/r/*.json` registry protocol or weakening the manual release gate that keeps
registry content behind its required public client contract?

The implementation milestone stops when:

1. public product documentation is separate from engineering decision records;
2. the site has navigable, searchable consumer, authoring, sharing, concept, and reference pages;
3. the live catalog is generated from the compiled registry index rather than duplicated by hand;
4. one executable starter proves the documented multi-file, dependency, package-style, theme, and
   direct-URL workflow;
5. the Starlight artifact contains byte-identical compiled registry documents at `/r/`;
6. repository CI builds that artifact while Pages remains explicitly dispatched; and
7. a browser check covers the GitHub Pages base path, navigation, search, content, and console.

Hosted acceptance is a separate final step: CI must pass on the implementation commit, the manual
Pages workflow must deploy it, and the public docs plus an existing registry item must return the
expected bytes before this handoff can claim public completion.

## Architecture

`apps/docs` is a private workspace using Astro `7.1.6` and Starlight `0.41.5`. Public content lives
under `apps/docs/src/content/docs`; the existing `docs/` directory remains the engineering record.
The initial site uses Starlight's static output, sidebar, Pagefind search, code blocks, dark mode,
SEO metadata, sitemap, and edit links with minimal brand CSS.

The generated catalog component reads `public/r/registry.json` during the docs build. After Astro
finishes, `scripts/build-site.mjs` validates that every indexed item document exists, removes only
the fixed generated `apps/docs/dist/r` directory, and copies the complete compiled registry there.
`diff -qr public/r apps/docs/dist/r` is empty. Pages now uploads `apps/docs/dist`; the URLs remain:

```text
https://arimxyer.github.io/manteen/r/registry.json
https://arimxyer.github.io/manteen/r/<item>.json
```

The release guard asserts both `bun run build:site` and the Starlight upload path. It retains the
existing assertion that Pages has only `workflow_dispatch`, so an ordinary documentation or
content commit cannot publish a registry contract ahead of npm.

## Public information architecture

The first milestone ships eight static pages:

- a product home and generated 14-item `@house` catalog;
- consumer installation and maintenance onboarding;
- a full registry-authoring walkthrough;
- GitHub Pages publishing plus direct-URL and configured-namespace sharing;
- the URL-versus-namespace decision boundary;
- CLI and authoring-catalog reference pages; and
- a generated 404 page.

Package READMEs link into the public guide. The CLI README also documents direct HTTP, HTTPS, and
`file:` item URLs and names what they cannot provide.

## Executable starter and disposable receipt

`examples/registry-starter` is a standalone `manteen-kit@^0.2.0` project. Its self-contained
`release-panel` contains a React component, hook, CSS module, `@mantine/carousel` package style,
three runtime dependencies, a Paper theme fragment, provider/version metadata, Styles API
selectors, and author documentation.

`bun run verify:docs:consumer` builds the current kit and CLI, then keeps every consumer byte under
`mkdtemp()`. On 2026-07-31 ET it:

- compiled the starter with zero authoring or wire-schema failures;
- created a fresh Vite React TypeScript consumer with `create-vite@9.1.1`;
- initialized the app through the built Node CLI;
- fetched `info` and installed the item by direct `file:` URL;
- wrote the component, CSS module and hook, folded `Paper.extend` into the theme, composed the
  Carousel import into `src/manteen.css`, and recorded the URL in receipt v2;
- rendered the installed component and production-built 7,010 modules with Vite `8.2.0`;
- completed an idempotent URL update; and
- ended with `No changes. 5 files unchanged.`

The scratch consumer was deleted after the run. This is built-local-toolchain evidence, not public
HTTPS evidence for the starter registry.

## Verification receipt

- `bun run verify:docs`: starter compilation, 14-item house compilation, eight-page Starlight
  build, Pagefind index, sitemap, and `/r` copy passed.
- Browser preview at `/manteen/`: meaningful home/catalog content, working base-path navigation,
  no error overlay or captured console errors, and Pagefind results for `direct URL` passed.
- React review: the starter uses stable item ids, explicit empty-state rendering, a controlled
  slide callback, typed public props, and decorative-icon semantics; no corrective finding remains.
- `bun run test`: 168 passed, 0 failed, 613 assertions.
- `bun run typecheck`, `bun run lint`, and `bun run guard`: clean.
- Built Node e2e: 100 tests, 99 passed, 1 intentional unselected-package-manager skip.
- Workspace guard after the deliberate docs dependency install: three `node_modules` roots, all
  links resolved.

## Non-evidence and next boundary

This milestone does not add a component marketplace, live Mantine playground, documentation
versioning, localization, analytics, authenticated registry, or central registry directory. The
starter proves the documented lifecycle but is not itself a newly hosted third-party registry.

After the hosted receipt closes this milestone, Wc returns to the previously agreed sequence:
small useful attributed content tranches, followed by broader framework-specific browser
acceptance for representative installed content.
