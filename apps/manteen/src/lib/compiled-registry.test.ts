import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REGISTRY_FILE_TYPES,
  REGISTRY_ITEM_TYPES,
  readCompiledRegistry,
} from "./compiled-registry";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("compiled registry reader", () => {
  test("keeps rendered item and file types aligned with the current wire schema", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../../../packages/registry-kit/schema/wire/registry-item.schema.json",
        ),
        "utf8",
      ),
    ) as {
      properties: {
        type: { enum: string[] };
        files: { items: { properties: { type: { enum: string[] } } } };
      };
    };

    assert.deepEqual([...REGISTRY_ITEM_TYPES], schema.properties.type.enum);
    assert.deepEqual([...REGISTRY_FILE_TYPES], schema.properties.files.items.properties.type.enum);
  });

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
    assert.equal(item?.meta?.mantine?.usage?.content, usage);
    assert.equal(item?.meta?.mantine?.themeFragment?.content, themeFragment);
    assert.deepEqual(Buffer.from(item?.files[0]?.content ?? ""), Buffer.from(source));
    assert.deepEqual(Buffer.from(item?.meta?.mantine?.usage?.content ?? ""), Buffer.from(usage));
    assert.deepEqual(
      Buffer.from(item?.meta?.mantine?.themeFragment?.content ?? ""),
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

  test("accepts wire-valid optional and open fields without dropping rendered data", async () => {
    const directory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          title: undefined,
          description: undefined,
          files: [],
          devDependencies: ["typescript@^6"],
          categories: ["future-wire-field"],
          meta: {
            futureClient: { enabled: true },
            mantine: {
              futureDisplayField: "ignored by this reader",
              props: { Alpha: [] },
            },
          },
        }),
      ],
      indexItems: [
        {
          name: "alpha",
          type: "registry:ui",
          futureIndexField: true,
          meta: { futureClient: true },
        },
      ],
    });

    const item = (await readCompiledRegistry({ directory })).getItem("alpha");
    assert.equal(item?.title, undefined);
    assert.equal(item?.description, undefined);
    assert.deepEqual(item?.files, []);
    assert.deepEqual(item?.devDependencies, ["typescript@^6"]);
    assert.deepEqual(item?.meta?.mantine?.props, { Alpha: [] });
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

    const controlPathDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          files: [{ path: "registry/ui/alpha\n.ts", type: "registry:ui", content: "source" }],
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: controlPathDirectory }),
      /Unsafe compiled file path/,
    );

    const unknownTypeDirectory = await fixture({
      items: [detail("alpha", "registry:not-real")],
      indexItems: [indexItem("alpha", "registry:not-real")],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: unknownTypeDirectory }),
      /Invalid option: expected one of/,
    );

    const unsafeTargetDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          files: [
            {
              path: "registry/ui/alpha.ts",
              type: "registry:ui",
              target: "../../outside.ts",
              content: "source",
            },
          ],
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: unsafeTargetDirectory }),
      /Unsafe install target/,
    );

    const driveTargetDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          files: [
            {
              path: "registry/ui/alpha.ts",
              type: "registry:ui",
              target: "C:/outside.ts",
              content: "source",
            },
          ],
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: driveTargetDirectory }),
      /Unsafe install target/,
    );

    const missingTargetDirectory = await fixture({
      items: [
        detail("alpha", "registry:file", {
          files: [{ path: "registry/file/alpha.txt", type: "registry:file", content: "source" }],
        }),
      ],
      indexItems: [indexItem("alpha", "registry:file")],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: missingTargetDirectory }),
      /has no install target/,
    );
  });

  test("refuses raw terminal controls before rendered registry text reaches HTML", async () => {
    for (const [label, character] of [
      ["NUL", "\u0000"],
      ["BEL", "\u0007"],
      ["ESC", "\u001b"],
      ["DEL", "\u007f"],
      ["CSI", "\u009b"],
    ] as const) {
      const directory = await fixture({
        items: [
          detail("alpha", "registry:ui", {
            files: [
              {
                path: "registry/ui/alpha.ts",
                type: "registry:ui",
                content: `safe${character}unsafe`,
              },
            ],
          }),
        ],
      });

      await assert.rejects(
        readCompiledRegistry({ directory }),
        /must not contain raw terminal control characters/,
        label,
      );
    }

    const cssDirectory = await fixture({
      items: [
        detail("alpha", "registry:ui", {
          css: { "@layer base": { ".alpha": `safe\u007funsafe` } },
        }),
      ],
    });
    await assert.rejects(
      readCompiledRegistry({ directory: cssDirectory }),
      /must not contain raw terminal control characters/,
    );
  });

  test("clears a rejected default read so a later registry rebuild can recover", async () => {
    const root = await temporaryDirectory();
    const appDirectory = join(root, "apps/manteen");
    const registryDirectory = join(root, "public/r");
    await mkdir(appDirectory, { recursive: true });
    const previousCwd = process.cwd();

    try {
      process.chdir(appDirectory);
      await assert.rejects(readCompiledRegistry(), /Cannot read compiled registry index/);
      await mkdir(registryDirectory, { recursive: true });
      await writeFixture(registryDirectory, { items: [detail("alpha")] });

      assert.equal((await readCompiledRegistry()).getItem("alpha")?.name, "alpha");
    } finally {
      process.chdir(previousCwd);
    }
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
