// Expressive Code config. Plugins MUST live here, not under starlight({ expressiveCode }):
// function values cannot serialize into the integration's virtual config module (the
// renderer throws on "[Function]"), and this file is the surface the official docs
// recommend so the <Code> component picks the config up too.
//
// The explicit @expressive-code/core devDependency (pinned to the exact version Starlight
// bundles) is load-bearing: it externalizes the package so the integration's renderer and
// the <Code> component's renderer share one module instance. Without it the two module
// graphs can desync a module-level Map inside core, and pages link an ec.<hash>.css the
// build never emits — exits 0, 404s at runtime (expressive-code#351/#352; workaround
// maintainer-confirmed in #222). scripts/check-ec-css.mjs asserts the invariant on every
// build; the exit code alone proves nothing.
import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

export default defineEcConfig({
  plugins: [pluginLineNumbers()],
});
