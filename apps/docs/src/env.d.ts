/**
 * `SiteHeader.astro` is a Starlight component override, and it re-composes the pieces of the
 * default header by importing them from `virtual:starlight/components/*`. That indirection is
 * deliberate: the virtual module resolves to *whatever is currently overriding* each piece, so
 * the header keeps working if another override is added later. Importing
 * `@astrojs/starlight/components/Search.astro` directly would bind to the default and silently
 * bypass override resolution.
 *
 * Starlight declares those virtual modules in `virtual-internal.d.ts`, but that file is not in
 * its exports map, so `astro check` cannot reach it by package name. Referencing it by path is
 * what makes the six `virtual:starlight/components/*` imports type-check instead of erroring as
 * missing modules.
 */
/// <reference path="../node_modules/@astrojs/starlight/virtual-internal.d.ts" />
