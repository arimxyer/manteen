import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");
const API = join(PKG_ROOT, "dist", "index.mjs");
const WORK = mkdtempSync(join(tmpdir(), "manteen-agent-metadata-"));

assert.equal(process.versions.bun, undefined, "this tier must run under real Node");
assert.ok(existsSync(CLI), `${CLI} is missing; build the CLI first`);
assert.ok(existsSync(API), `${API} is missing; build the CLI first`);

after(() => rmSync(WORK, { recursive: true, force: true }));

const registry = join(WORK, "registry");
const project = join(WORK, "project");
mkdirSync(registry, { recursive: true });
mkdirSync(project, { recursive: true });

const item = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "card",
  type: "registry:ui",
  docs: "Use this card in an agent-built dashboard.",
  files: [{ path: "card.tsx", type: "registry:ui", content: "export const Card = 1;\n" }],
  meta: {
    mantine: {
      props: {
        Card: [{ name: "title", type: "string", required: true, description: "Heading." }],
      },
      usage: {
        path: "examples/card.usage.tsx",
        content: 'export const Example = () => <Card title="BUILT_NODE" />;\n',
      },
    },
  },
};

writeFileSync(join(registry, "card.json"), `${JSON.stringify(item, null, 2)}\n`);
writeFileSync(
  join(registry, "registry.json"),
  `${JSON.stringify(
    {
      name: "house",
      items: [
        { name: "card", type: "registry:ui" },
        { name: "guide", type: "registry:file", description: "Card examples" },
        { name: "panel", type: "registry:ui", title: "Card panel" },
      ],
    },
    null,
    2,
  )}\n`,
);

const registryBase = pathToFileURL(registry).href;
writeFileSync(
  join(project, "manteen.json"),
  `${JSON.stringify(
    {
      registries: {
        "@house": {
          url: `${registryBase}/{name}.json`,
          index: `${registryBase}/registry.json`,
        },
      },
      aliases: {
        components: "@/components",
        ui: "@/components/ui",
        hooks: "@/hooks",
        lib: "@/lib",
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(project, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/components/*": ["src/components/*"],
          "@/components/ui/*": ["src/components/ui/*"],
          "@/hooks/*": ["src/hooks/*"],
          "@/lib/*": ["src/lib/*"],
        },
      },
    },
    null,
    2,
  )}\n`,
);

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    env: childEnv(),
    encoding: "utf8",
  });
}

test("built CLI keeps full metadata in JSON and expands text only on request", () => {
  const listed = cli("list", "@house", "--query", "card", "--json");
  assert.equal(listed.status, 0, `${listed.stdout}\n${listed.stderr}`);
  assert.equal(listed.stderr, "");
  const listEnvelope = JSON.parse(listed.stdout);
  const listedItems = listEnvelope.payload.registries[0].items;
  assert.deepEqual(
    listedItems.map((listedItem) => listedItem.id),
    ["@house/card", "@house/panel", "@house/guide"],
  );
  assert.deepEqual(
    listedItems.map((listedItem) => listedItem.queryRank),
    ["exact-name", "title-prefix", "description-substring"],
  );
  assert.deepEqual(listedItems[0].queryMatches, ["id", "name"]);

  const jsonResult = cli("info", "@house/card", "--json");
  assert.equal(jsonResult.status, 0, `${jsonResult.stdout}\n${jsonResult.stderr}`);
  assert.equal(jsonResult.stderr, "");

  const envelope = JSON.parse(jsonResult.stdout);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.payload.detail.docs, item.docs);
  assert.deepEqual(envelope.payload.detail.meta.props, item.meta.mantine.props);
  assert.equal(envelope.payload.detail.meta.usage.content, item.meta.mantine.usage.content);

  const compact = cli("info", "@house/card");
  assert.equal(compact.status, 0, `${compact.stdout}\n${compact.stderr}`);
  assert.match(compact.stdout, /use --props to expand/);
  assert.doesNotMatch(compact.stdout, /BUILT_NODE/);

  const expanded = cli("info", "@house/card", "--props", "--usage");
  assert.equal(expanded.status, 0, `${expanded.stdout}\n${expanded.stderr}`);
  assert.match(expanded.stdout, /title: string/);
  assert.match(expanded.stdout, /BUILT_NODE/);
});

test("built SDK exposes production-wired reads from its stable façade", async () => {
  const { createManteenClient } = await import(pathToFileURL(API));
  const client = createManteenClient({ cwd: project });

  assert.equal(client.root, project);
  const report = await client.info("@house/card");
  assert.equal(report.detail.docs, item.docs);
  assert.deepEqual(report.detail.meta.props, item.meta.mantine.props);
  assert.equal(report.detail.meta.usage.content, item.meta.mantine.usage.content);
  assert.deepEqual(
    (await client.list()).groups.map((group) => group.registry),
    ["@house"],
  );
});
