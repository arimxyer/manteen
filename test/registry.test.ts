import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileRegistry } from "manteen-kit";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");
const UPSTREAM_REVISION = "ffbf61c559f374a7ea28fcf00355e84dcbe9a908";
const MANTINE_UI_ITEMS = [
  "article-card",
  "authentication-form",
  "button-progress",
  "cards-carousel",
  "dnd-list",
  "dropzone-button",
  "stats-grid",
  "table-sort",
] as const;

describe("house catalog", () => {
  test("compiles and conforms to the wire schema", () => {
    const { source, items, failures } = compileRegistry(CATALOG);

    expect(failures).toEqual([]);
    expect(source.namespace).toBe("@house");
    expect(items).toHaveLength(source.items.length);
  });

  test("every Mantine code item declares the version it needs", () => {
    const { source } = compileRegistry(CATALOG);

    for (const item of source.items.filter((candidate) => candidate.kind !== "file")) {
      expect(item.mantine).toBeDefined();
    }
  });

  test("the curated Mantine UI tranche retains source and installed-license provenance", () => {
    const { source, items } = compileRegistry(CATALOG);
    const authored = new Map(source.items.map((item) => [item.name, item]));
    const compiled = new Map(items.map((item) => [item.name as string, item]));

    for (const name of MANTINE_UI_ITEMS) {
      const item = authored.get(name);
      expect(item).toBeDefined();
      expect(item!.uses).toContain("mantine-ui-license");
      expect(item!.docs).toContain(UPSTREAM_REVISION);

      for (const file of item!.files) {
        expect(readFileSync(resolve(import.meta.dirname, "..", file.path), "utf8")).toContain(
          UPSTREAM_REVISION,
        );
      }

      expect(compiled.get(name)!.registryDependencies).toContain("@house/mantine-ui-license");
      expect(compiled.get(name)!.docs).toContain(UPSTREAM_REVISION);
    }

    const license = compiled.get("mantine-ui-license")!;
    const files = license.files as { target: string; content: string }[];
    expect(files).toHaveLength(1);
    expect(files[0]!.target).toBe("~/LICENSES/MANTINE-UI.txt");
    expect(files[0]!.content).toContain("Copyright (c) 2022 Vitaly Rtischev");
  });

  test("extension items compile their package-level stylesheet requirements", () => {
    const { items } = compileRegistry(CATALOG);
    const compiled = new Map(items.map((item) => [item.name as string, item]));

    expect(compiled.get("cards-carousel")!.css).toEqual({
      '@import "@mantine/carousel/styles.css"': {},
    });
    expect(compiled.get("dropzone-button")!.css).toEqual({
      '@import "@mantine/dropzone/styles.css"': {},
    });
  });

  test("copy-ready examples use the consumer aliases emitted by init", () => {
    const { source } = compileRegistry(CATALOG);
    const registryOnlyAlias = /from\s+["']@(components|hooks|lib|ui)\//;

    for (const item of source.items) {
      if (!item.usage) continue;

      const usage = readFileSync(resolve(import.meta.dirname, "..", item.usage), "utf8");
      expect(usage).not.toMatch(registryOnlyAlias);
    }
  });
});
