// Guard: every ec.<hash>.css referenced by built HTML must actually be emitted.
//
// Expressive Code constructs two renderers (integration side for fenced blocks, Vite SSR
// side for the <Code> component). If their configs desync by one CSS byte, pages link a
// stylesheet the build never writes — the build still exits 0 and the 404 only shows at
// runtime (upstream: expressive-code#351/#352). The pinned @expressive-code/core
// devDependency in apps/docs keeps the two graphs on one module instance; this guard is
// the acceptance test for that invariant.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../apps/docs/dist", import.meta.url));
const EC_CSS = /ec\.[a-z0-9]+\.css/g;

const htmlFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith(".html")) htmlFiles.push(path);
  }
};
walk(distDir);

const emitted = new Set(
  readdirSync(join(distDir, "_astro")).filter((name) => /^ec\.[a-z0-9]+\.css$/.test(name)),
);
const referenced = new Map();
for (const file of htmlFiles) {
  for (const match of readFileSync(file, "utf8").matchAll(EC_CSS)) {
    if (!referenced.has(match[0])) referenced.set(match[0], []);
    referenced.get(match[0]).push(file.slice(distDir.length));
  }
}

if (referenced.size === 0) {
  console.error(
    "check-ec-css: no page references an ec.<hash>.css — Expressive Code styling is not being linked at all.",
  );
  process.exit(1);
}

const missing = [...referenced.keys()].filter((name) => !emitted.has(name));
if (missing.length > 0) {
  for (const name of missing) {
    const pages = referenced.get(name);
    console.error(
      `check-ec-css: ${pages.length} page(s) link ${name}, which was never emitted (e.g. ${pages[0]}).`,
    );
  }
  console.error(
    `check-ec-css: emitted: ${[...emitted].join(", ") || "(none)"}. The two Expressive Code renderers have desynced — see ec.config.mjs.`,
  );
  process.exit(1);
}

console.log(
  `check-ec-css: clean — ${referenced.size} hash(es) referenced by ${htmlFiles.length} pages, all emitted.`,
);
