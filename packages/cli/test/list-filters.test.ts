import { describe, expect, test } from "bun:test";

import { buildList, type ListOptions, type ListPorts, renderList } from "../src/commands/list";
import type { LoadedConfig, Registry } from "../src/config/types";

const ZERO_HASH = "0".repeat(64);

const INDEXES: Record<string, unknown> = {
  "@alpha": {
    name: "Alpha components",
    items: [
      {
        name: "data-hook",
        type: "registry:hook",
        title: "Loader",
        description: "Fetches remote data",
      },
      {
        name: "card",
        type: "registry:ui",
        title: "Feature Panel",
        description: "Overview analytics",
      },
    ],
  },
  "@beta": {
    name: "Beta components",
    items: [
      {
        name: "select",
        type: "registry:ui",
        title: "Picker",
        description: "Choose a value",
      },
      {
        name: "chart",
        type: "registry:block",
        title: "Revenue Chart",
        description: "Visualizes metrics",
      },
    ],
  },
};

function registry(namespace: string): Registry {
  return {
    namespace,
    url: `https://example.test/${namespace.slice(1)}/{name}.json`,
    index: `https://example.test/${namespace.slice(1)}/index.json`,
    headers: {},
    params: {},
  };
}

function config(): LoadedConfig {
  const root = "/project";
  return {
    root,
    // Deliberately reverse insertion order. `readAvailable` owns canonical
    // registry ordering and filters must not disturb it.
    registries: new Map([
      ["@beta", registry("@beta")],
      ["@alpha", registry("@alpha")],
    ]),
  } as unknown as LoadedConfig;
}

function ports(): ListPorts {
  const receipt = {
    lockfileVersion: 3,
    items: [
      {
        id: "@alpha/card",
        registry: "@alpha",
        sourceUrl: "https://example.test/alpha/card.json",
        wireType: "registry:ui",
        direct: true,
        files: [],
      },
    ],
    theme: null,
    styles: null,
  };

  return {
    available: {
      env: {},
      load: async (request) => ({
        ok: true,
        doc: INDEXES[request.registry],
        redactedUrl: request.redactedUrl,
      }),
    },
    installed: {
      read: () => ({ present: true, raw: JSON.stringify(receipt), sha256: ZERO_HASH }),
      validate: () => true,
      hash: () => ZERO_HASH,
    },
  };
}

async function filtered(options: ListOptions) {
  return buildList(config(), ports(), options);
}

function ids(result: Awaited<ReturnType<typeof filtered>>): (string | null)[][] {
  return result.groups.map((group) => group.rows.map((row) => row.item.id));
}

describe("list filters", () => {
  test("query matches canonical id, name, title, and description case-insensitively", async () => {
    expect(ids(await filtered({ query: "@BETA/CHART" }))).toEqual([[], ["@beta/chart"]]);
    expect(ids(await filtered({ query: "HOOK" }))).toEqual([["@alpha/data-hook"], []]);
    expect(ids(await filtered({ query: "feature" }))).toEqual([["@alpha/card"], []]);
    expect(ids(await filtered({ query: "ANALYTICS" }))).toEqual([["@alpha/card"], []]);
  });

  test("repeatable types are exact, OR-ed, and preserve registry and item order", async () => {
    const result = await filtered({ types: ["registry:hook", "registry:block"] });
    expect(result.groups.map((group) => group.registry)).toEqual(["@alpha", "@beta"]);
    expect(ids(result)).toEqual([["@alpha/data-hook"], ["@beta/chart"]]);

    expect(ids(await filtered({ types: ["REGISTRY:UI"] }))).toEqual([[], []]);
  });

  test("installed keeps only receipt-backed rows and composes with other filters", async () => {
    expect(ids(await filtered({ installed: true }))).toEqual([["@alpha/card"], []]);
    expect(ids(await filtered({ installed: true, query: "card", types: ["registry:ui"] }))).toEqual(
      [["@alpha/card"], []],
    );
    expect(ids(await filtered({ installed: true, types: ["registry:hook"] }))).toEqual([[], []]);
  });

  test("keeps empty groups and does not mistake filtered installed rows for missing index rows", async () => {
    const result = await filtered({ query: "select" });
    expect(ids(result)).toEqual([[], ["@beta/select"]]);
    expect(result.notes.some((note) => note.code === "not-in-index")).toBe(false);
    expect(renderList(result)).toContain("@alpha  Alpha components");
    expect(renderList(result)).toContain("  (no items)");
  });
});
