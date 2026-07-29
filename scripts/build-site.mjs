#!/usr/bin/env node
/**
 * Generate public/index.html from the COMPILED registry index.
 *
 * Reads `public/r/registry.json` rather than the authoring catalog on purpose:
 * the page should show what is actually being served, so a catalog that fails
 * to compile produces no page rather than a page describing items nobody can
 * install. Run it after `build:registry`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = join(REPO_ROOT, "public");
const REPO_URL = "https://github.com/arimxyer/manteen";

const index = JSON.parse(readFileSync(join(PUBLIC, "r", "registry.json"), "utf8"));

/** The page interpolates registry-authored strings, so every one is escaped. */
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const KIND = {
  "registry:ui": "component",
  "registry:block": "block",
  "registry:hook": "hook",
  "registry:lib": "lib",
  "registry:file": "file",
};

const items = index.items
  .map((item) => {
    const requires = item.meta?.mantine?.requires;
    return `      <li class="item">
        <div class="row">
          <code class="name">@house/${escape(item.name)}</code>
          <span class="kind">${escape(KIND[item.type] ?? item.type)}</span>
          ${requires ? `<span class="req">mantine ${escape(requires)}</span>` : ""}
        </div>
        ${item.description ? `<p class="desc">${escape(item.description)}</p>` : ""}
        <code class="cmd">npx shadcn@latest add @house/${escape(item.name)}</code>
      </li>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>manteen — a Mantine component registry</title>
<meta name="description" content="A component registry for Mantine. Copy-in components you own and edit, installable with any registry client.">
<style>
  :root {
    color-scheme: light dark;
    --bg: #fff; --fg: #16161a; --muted: #6b6b76;
    --line: #e5e5ea; --card: #fafafa; --accent: #4c6ef5;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #131316; --fg: #ececf1; --muted: #9a9aa6; --line: #2a2a31; --card: #1a1a1f; --accent: #91a7ff; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 3rem 1.25rem 5rem; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 2rem; margin: 0 0 .35rem; letter-spacing: -0.02em; }
  .tagline { color: var(--muted); margin: 0 0 2.25rem; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 2.5rem 0 .85rem; }
  code, pre { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: .875em; }
  pre {
    background: var(--card); border: 1px solid var(--line); border-radius: 8px;
    padding: .85rem 1rem; overflow-x: auto; margin: 0 0 .75rem;
  }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
  .item { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1rem; }
  .row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .name { font-weight: 600; }
  .kind, .req {
    font-size: .7rem; text-transform: uppercase; letter-spacing: .05em;
    border: 1px solid var(--line); border-radius: 999px; padding: .1rem .5rem; color: var(--muted);
  }
  .desc { margin: .5rem 0 .75rem; color: var(--muted); }
  .cmd { display: block; overflow-x: auto; white-space: nowrap; color: var(--accent); }
  a { color: var(--accent); }
  footer { margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .875rem; }
</style>
</head>
<body>
<main>
  <h1>manteen</h1>
  <p class="tagline">A component registry for <a href="https://mantine.dev">Mantine</a>. Components you copy in, own, and edit &mdash; not another dependency.</p>

  <h2>Point a client at it</h2>
  <pre>{
  "registries": {
    "@house": "https://arimxyer.github.io/manteen/r/{name}.json"
  }
}</pre>
  <p class="tagline">That shape works in <code>components.json</code> today, so any client that speaks the
  registry format can install these. <code>manteen</code>, the Mantine-aware client, is still in development.</p>

  <h2>${index.items.length} item${index.items.length === 1 ? "" : "s"}</h2>
  <ul>
${items}
  </ul>

  <footer>
    Built from <code>manteen.registry.json</code> on every push &mdash;
    <a href="${REPO_URL}">source on GitHub</a>.
    An independent project, not affiliated with the Mantine team.
  </footer>
</main>
</body>
</html>
`;

writeFileSync(join(PUBLIC, "index.html"), html);
console.log(`build-site: public/index.html (${index.items.length} items).`);
