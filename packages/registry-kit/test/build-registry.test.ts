import { join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  type MantineRegistry,
  type WireItem,
  compileRegistry,
  createWireValidator,
  toWireItem,
  validateCatalog,
} from "../src/build-registry";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const BASE = join(FIXTURES, "base/manteen.registry.json");
const KIT = join(FIXTURES, "kit/manteen.registry.json");
const PRODUCT = join(FIXTURES, "product/manteen.registry.json");

function itemNamed(items: WireItem[], name: string): WireItem {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`no compiled item named ${name}`);
  return found;
}

describe("vocabulary mapping", () => {
  test("compiles Mantine kinds to wire types", () => {
    const { items } = compileRegistry(BASE);

    expect(itemNamed(items, "empty-state").type).toBe("registry:ui");
    expect(itemNamed(items, "data-grid").type).toBe("registry:block");
    // `theme` is a distinct authoring kind with no wire equivalent — it lands as lib.
    expect(itemNamed(items, "theme").type).toBe("registry:lib");
  });

  test("compiles file roles independently of the item's kind", () => {
    const dataGrid = itemNamed(compileRegistry(BASE).items, "data-grid");
    const files = dataGrid.files as { path: string; type: string }[];

    expect(files.map((file) => file.type)).toEqual(["registry:ui", "registry:hook"]);
  });

  test("inlines file contents", () => {
    const emptyState = itemNamed(compileRegistry(BASE).items, "empty-state");
    const files = emptyState.files as { content: string }[];

    expect(files[0]!.content).toContain("export function EmptyState");
  });
});

describe("dependency qualification", () => {
  test("qualifies a bare `uses` name with the registry namespace", () => {
    // A bare name in the wire format resolves against the default public
    // registry, not this one — qualifying at build time is what prevents that.
    const dataGrid = itemNamed(compileRegistry(BASE).items, "data-grid");

    expect(dataGrid.registryDependencies).toEqual(["@base/empty-state"]);
  });

  test("passes an already-namespaced `uses` entry through untouched", () => {
    const alertPanel = itemNamed(compileRegistry(PRODUCT).items, "alert-panel");

    expect(alertPanel.registryDependencies).toEqual(["@kit/callout", "@base/empty-state"]);
  });

  test("omits registryDependencies entirely when there are none", () => {
    const callout = itemNamed(compileRegistry(KIT).items, "callout");

    expect(callout).not.toHaveProperty("registryDependencies");
  });
});

describe("meta.mantine", () => {
  test("carries the version gate and provider requirement", () => {
    const theme = itemNamed(compileRegistry(BASE).items, "theme");
    const meta = (theme.meta as { mantine: Record<string, unknown> }).mantine;

    expect(meta.requires).toBe(">=9");
    expect(meta.provider).toBe("MantineProvider");
  });

  test("carries stylesApi selectors", () => {
    const dataGrid = itemNamed(compileRegistry(BASE).items, "data-grid");
    const meta = (dataGrid.meta as { mantine: { stylesApi: Record<string, string[]> } }).mantine;

    expect(meta.stylesApi.DataGrid).toEqual(["root", "header", "row"]);
  });

  test("puts themeFragment in meta and NOT in files", () => {
    // If it leaked into `files`, every client would drop a stray theme module
    // into the consumer's project instead of merging it.
    const dataGrid = itemNamed(compileRegistry(BASE).items, "data-grid");
    const meta = (dataGrid.meta as { mantine: { themeFragment: { path: string; content: string } } })
      .mantine;
    const files = dataGrid.files as { path: string }[];

    expect(meta.themeFragment.path).toBe("src/data-grid.theme.ts");
    expect(meta.themeFragment.content).toContain("createTheme");
    expect(files.map((file) => file.path)).not.toContain("src/data-grid.theme.ts");
  });

  test("omits meta when an item declares nothing Mantine-specific", () => {
    const bare = toWireItem(
      { name: "bare", kind: "component", files: [{ path: "src/callout.tsx", as: "component" }] },
      "@kit",
      join(FIXTURES, "kit"),
    );

    expect(bare).not.toHaveProperty("meta");
  });
});

describe("index", () => {
  test("surfaces meta.mantine so a client can filter without fetching every item", () => {
    const { index } = compileRegistry(BASE);
    const entries = index.items as { name: string; meta?: { mantine: { requires?: string } } }[];

    expect(entries.find((entry) => entry.name === "theme")!.meta?.mantine.requires).toBe(">=9");
    // empty-state declares no version gate, so it carries no meta at all.
    expect(entries.find((entry) => entry.name === "empty-state")!.meta).toBeUndefined();
    expect(entries).toHaveLength(3);
  });
});

describe("validation", () => {
  test("every compiled item conforms to the vendored wire schema", () => {
    for (const catalog of [BASE, KIT, PRODUCT]) {
      const { items, failures } = compileRegistry(catalog);
      expect(failures).toEqual([]);
      expect(items.length).toBeGreaterThan(0);
    }
  });

  test("rejects a catalog with an unknown kind", () => {
    const errors = validateCatalog({
      name: "bad",
      namespace: "@bad",
      items: [{ name: "x", kind: "widget", files: [{ path: "a.tsx", as: "component" }] }],
    });

    expect(errors).not.toBeNull();
    expect(errors!.join(" ")).toMatch(/kind/);
  });

  test("rejects a catalog whose namespace is not @-prefixed", () => {
    const bad: MantineRegistry = { name: "bad", namespace: "base", items: [] };

    expect(validateCatalog(bad)).not.toBeNull();
  });

  test("rejects an unknown authoring field rather than silently dropping it", () => {
    // Guards the authoring format against drifting toward the wire format.
    const errors = validateCatalog({
      name: "bad",
      namespace: "@bad",
      items: [
        {
          name: "x",
          kind: "component",
          files: [{ path: "a.tsx", as: "component" }],
          tailwind: { config: "" },
        },
      ],
    });

    expect(errors).not.toBeNull();
  });

  test("compileRegistry throws rather than emitting junk for a missing catalog", () => {
    expect(() => compileRegistry(join(FIXTURES, "does-not-exist.json"))).toThrow();
  });

  test("the wire validator catches a malformed item", () => {
    const validateWire = createWireValidator();

    expect(validateWire({ name: "x", type: "registry:ui", files: [] })).toBeNull();
    expect(validateWire({ name: "x", type: "mantine:component" })).not.toBeNull();
    expect(validateWire({ type: "registry:ui" })).not.toBeNull();
  });
});

describe("multi-registry", () => {
  test("one toolchain compiles independent catalogs with their own namespaces", () => {
    expect(compileRegistry(BASE).source.namespace).toBe("@base");
    expect(compileRegistry(KIT).source.namespace).toBe("@kit");
    expect(compileRegistry(PRODUCT).source.namespace).toBe("@product");
  });

  test("a cross-registry item names every registry it spans", () => {
    const alertPanel = itemNamed(compileRegistry(PRODUCT).items, "alert-panel");
    const deps = alertPanel.registryDependencies as string[];

    expect(new Set(deps.map((dep) => dep.split("/")[0]))).toEqual(new Set(["@kit", "@base"]));
  });
});
