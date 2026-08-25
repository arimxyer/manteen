import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { readCompiledRegistry } from "./compiled-registry";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("compiled registry reader", () => {
  test("preserves exact source, usage, and theme-fragment bytes", async () => {
    const source = 'export const message = "π";\r\n// exact trailing line\r\n';
    const usage = "export function Example() {\n  return <>✓</>;\n}\n";
    const themeFragment = 'export const fragment = "theme";\n';
    const directory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          files: [{ path: "registry/ui/alpha.tsx", type: "registry:ui", content: source }],
          meta: {
            mantine: {
              usage: { path: "registry/ui/alpha.usage.tsx", content: usage },
              themeFragment: { path: "registry/lib/alpha.theme.ts", content: themeFragment },
              themeSummary: {
                keys: ["components"],
                components: { items: [], dynamic: false },
                dynamic: false,
              },
            },
          },
        }),
      ],
    });

    const registry = await readCompiledRegistry({ directory });
    const item = registry.getItem("alpha");

    assert.equal(item?.files[0]?.content, source);
    assert.equal(item?.meta?.mantine.usage?.content, usage);
    assert.equal(item?.meta?.mantine.themeFragment?.content, themeFragment);
    assert.deepEqual(Buffer.from(item?.files[0]?.content ?? ""), Buffer.from(source));
    assert.deepEqual(Buffer.from(item?.meta?.mantine.usage?.content ?? ""), Buffer.from(usage));
    assert.deepEqual(
      Buffer.from(item?.meta?.mantine.themeFragment?.content ?? ""),
      Buffer.from(themeFragment),
    );
  });

  test("refuses a missing registry index", async () => {
    const directory = await temporaryDirectory();
    await assert.rejects(
      readCompiledRegistry({ directory }),
      /Cannot read compiled registry index/,
    );
  });

  test("refuses a missing indexed detail", async () => {
    const directory = await fixture({ items: [detail("alpha")] });
    await rm(join(directory, "alpha.json"));

    await assert.rejects(
      readCompiledRegistry({ directory }),
      /Cannot read compiled detail for alpha/,
    );
  });

  test("refuses unsafe and duplicate index names before resolving detail paths", async () => {
    const unsafeDirectory = await fixture({
      items: [detail("alpha")],
      indexItems: [indexItem("../escape")],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: unsafeDirectory }),
      /must be a safe lowercase item name/,
    );

    const duplicateDirectory = await fixture({
      items: [detail("alpha")],
      indexItems: [indexItem("alpha"), indexItem("alpha")],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: duplicateDirectory }),
      /Duplicate registry index item names/,
    );
  });

  test("refuses index/detail identity and type mismatches", async () => {
    const nameDirectory = await fixture({
      items: [detail("beta")],
      indexItems: [indexItem("alpha")],
      detailFileNames: ["alpha"],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: nameDirectory }),
      /has name "beta"; the index declares "alpha"/,
    );

    const typeDirectory = await fixture({
      items: [detail("alpha", "registry:block")],
      indexItems: [indexItem("alpha", "registry:ui")],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: typeDirectory }),
      /has type "registry:block"; the index declares "registry:ui"/,
    );
  });

  test("never executes compiled source or authored examples", async () => {
    const directory = await temporaryDirectory();
    const marker = join(directory, "executed.txt");
    const executableText = `await Bun.write(${JSON.stringify(marker)}, "executed");`;
    await writeFixture(directory, {
      items: [
        detail("alpha", "registry:ui", {
          files: [{ path: "registry/ui/alpha.ts", type: "registry:ui", content: executableText }],
          meta: {
            mantine: {
              usage: { path: "registry/ui/alpha.usage.ts", content: executableText },
              themeFragment: { path: "registry/lib/alpha.theme.ts", content: executableText },
              themeSummary: {
                keys: [],
                components: { items: [], dynamic: true },
                dynamic: true,
              },
            },
          },
        }),
      ],
    });

    const registry = await readCompiledRegistry({ directory });

    assert.equal(registry.getItem("alpha")?.files[0]?.content, executableText);
    await assert.rejects(access(marker));
  });

  test("groups and sorts types and item names by code unit", async () => {
    const directory = await fixture({
      items: [
        detail("zeta", "registry:ui"),
        detail("beta", "registry:ui"),
        detail("alpha", "registry:block"),
      ],
      indexItems: [
        indexItem("zeta", "registry:ui"),
        indexItem("beta", "registry:ui"),
        indexItem("alpha", "registry:block"),
      ],
    });

    const registry = await readCompiledRegistry({ directory });

    assert.deepEqual(
      registry.items.map((item) => item.name),
      ["alpha", "beta", "zeta"],
    );
    assert.deepEqual(
      registry.groups.map((group) => ({
        type: group.type,
        items: group.items.map((item) => item.name),
      })),
      [
        { type: "registry:block", items: ["alpha"] },
        { type: "registry:ui", items: ["beta", "zeta"] },
      ],
    );
  });

  test("accepts absent optional metadata", async () => {
    const directory = await fixture({ items: [detail("alpha")] });

    const registry = await readCompiledRegistry({ directory });
    const item = registry.getItem("alpha");

    assert.equal(item?.meta, undefined);
    assert.equal(item?.dependencies, undefined);
    assert.equal(item?.registryDependencies, undefined);
  });

  test("refuses malformed rendered metadata and unsafe compiled paths", async () => {
    const malformedDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          meta: {
            mantine: {
              props: {
                Alpha: [{ name: "value", type: "string", required: "yes" }],
              },
            },
          },
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: malformedDirectory }),
      /meta.mantine.props.Alpha.0.required/,
    );

    const unsafePathDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          files: [{ path: "../alpha.ts", type: "registry:ui", content: "source" }],
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: unsafePathDirectory }),
      /Unsafe compiled file path/,
    );
  });
});

type JsonObject = Record<string, unknown>;

function indexItem(name: string, type = "registry:ui"): JsonObject {
  return {
    name,
    type,
    title: `${name} title`,
    description: `${name} description`,
  };
}

function detail(name: string, type = "registry:ui", overrides: JsonObject = {}): JsonObject {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type,
    title: `${name} title`,
    description: `${name} description`,
    files: [{ path: `registry/ui/${name}.ts`, type, content: `export const ${name} = true;\n` }],
    ...overrides,
  };
}

async function fixture(options: {
  items: JsonObject[];
  indexItems?: JsonObject[];
  detailFileNames?: string[];
}): Promise<string> {
  const directory = await temporaryDirectory();
  await writeFixture(directory, options);
  return directory;
}

async function writeFixture(
  directory: string,
  options: {
    items: JsonObject[];
    indexItems?: JsonObject[];
    detailFileNames?: string[];
  },
): Promise<void> {
  const indexItems =
    options.indexItems ??
    options.items.map((item) => indexItem(String(item.name), String(item.type)));
  await writeJson(join(directory, "registry.json"), {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "fixture",
    items: indexItems,
  });

  await Promise.all(
    options.items.map((item, index) =>
      writeJson(
        join(directory, `${options.detailFileNames?.[index] ?? String(item.name)}.json`),
        item,
      ),
    ),
  );
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "manteen-compiled-registry-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
