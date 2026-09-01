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
        description: "Fetches remote card data",
      },
      {
        name: "card",
        type: "registry:ui",
        title: "Feature Panel",
        description: "Overview analytics",
      },
      {
        name: "manual",
        type: "registry:file",
        title: "Reference",
        description: "Card manual",
      },
    ],
  },
  "@beta": {
    name: "Beta components",
    items: [
      {
        name: "select",
        type: "registry:ui",
        title: "Card",
        description: "Choose a value",
      },
      {
        name: "chart",
        type: "registry:block",
        title: "Revenue Card Chart",
        description: "Visualizes metrics",
      },
      {
        name: "grid",
        type: "registry:layout",
        title: "Card Grid",
        description: "Arranges content",
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

function matches(result: Awaited<ReturnType<typeof filtered>>) {
  return result.groups.flatMap((group) =>
    group.rows.map((row) => [row.item.id, row.queryMatches] as const),
  );
}

function ranks(result: Awaited<ReturnType<typeof filtered>>) {
  return result.groups.flatMap((group) =>
    group.rows.map((row) => [row.item.id, row.queryRank] as const),
  );
}

describe("list filters", () => {
  test("query matches canonical id, name, title, and description case-insensitively", async () => {
    const canonical = await filtered({ query: "@BETA/CHART" });
    const name = await filtered({ query: "HOOK" });
    const title = await filtered({ query: "feature" });
    const description = await filtered({ query: "ANALYTICS" });

    expect(ids(canonical)).toEqual([[], ["@beta/chart"]]);
    expect(ids(name)).toEqual([["@alpha/data-hook"], []]);
    expect(ids(title)).toEqual([["@alpha/card"], []]);
    expect(ids(description)).toEqual([["@alpha/card"], []]);
    expect(matches(canonical)).toEqual([["@beta/chart", ["id"]]]);
    expect(matches(name)).toEqual([["@alpha/data-hook", ["id", "name"]]]);
    expect(matches(title)).toEqual([["@alpha/card", ["title"]]]);
    expect(matches(description)).toEqual([["@alpha/card", ["description"]]]);
    expect(ranks(canonical)).toEqual([["@beta/chart", "exact-id"]]);
    expect(ranks(name)).toEqual([["@alpha/data-hook", "identity-substring"]]);
    expect(ranks(title)).toEqual([["@alpha/card", "title-prefix"]]);
    expect(ranks(description)).toEqual([["@alpha/card", "description-substring"]]);
  });

  test("query relevance is deterministic within registries and exposes the winning rank", async () => {
    const result = await filtered({ query: "card" });

    expect(ids(result)).toEqual([
      ["@alpha/card", "@alpha/data-hook", "@alpha/manual"],
      ["@beta/select", "@beta/grid", "@beta/chart"],
    ]);
    expect(ranks(result)).toEqual([
      ["@alpha/card", "exact-name"],
      ["@alpha/data-hook", "description-substring"],
      ["@alpha/manual", "description-substring"],
      ["@beta/select", "exact-title"],
      ["@beta/grid", "title-prefix"],
      ["@beta/chart", "title-substring"],
    ]);
    expect(matches(result)).toEqual([
      ["@alpha/card", ["id", "name"]],
      ["@alpha/data-hook", ["description"]],
      ["@alpha/manual", ["description"]],
      ["@beta/select", ["title"]],
      ["@beta/grid", ["title"]],
      ["@beta/chart", ["title"]],
    ]);
  });

  test("no query preserves canonical registry and item order", async () => {
    expect(ids(await filtered({}))).toEqual([
      ["@alpha/card", "@alpha/data-hook", "@alpha/manual"],
      ["@beta/chart", "@beta/grid", "@beta/select"],
    ]);
  });

  test("repeatable types are exact, OR-ed, and preserve registry and item order", async () => {
    const result = await filtered({ types: ["registry:hook", "registry:block"] });
    expect(result.groups.map((group) => group.registry)).toEqual(["@alpha", "@beta"]);
    expect(ids(result)).toEqual([["@alpha/data-hook"], ["@beta/chart"]]);
    expect(matches(result)).toEqual([
      ["@alpha/data-hook", []],
      ["@beta/chart", []],
    ]);

    expect(ids(await filtered({ types: ["REGISTRY:UI"] }))).toEqual([[], []]);
  });

  test("installed keeps only receipt-backed rows and composes with other filters", async () => {
    expect(ids(await filtered({ installed: true }))).toEqual([["@alpha/card"]]);
    expect(ids(await filtered({ installed: true, query: "card", types: ["registry:ui"] }))).toEqual(
      [["@alpha/card"]],
    );
    expect(ids(await filtered({ installed: true, types: ["registry:hook"] }))).toEqual([[]]);
  });

  test("installed is receipt-first and never fetches a registry index", async () => {
    const configured = config();
    const configuredPorts = ports();
    let loads = 0;
    configuredPorts.available.load = async () => {
      loads += 1;
      return {
        ok: false,
        reason: "network",
        detail: "ECONNREFUSED",
        redactedUrl: "https://example.test/alpha/index.json",
      };
    };

    const result = await buildList(configured, configuredPorts, {
      installed: true,
      registries: [],
    });

    expect(loads).toBe(0);
    expect(ids(result)).toEqual([["@alpha/card"]]);
    expect(result.notes.some((note) => note.code === "index-unreachable")).toBe(false);
  });

  test("keeps empty groups and does not mistake filtered installed rows for missing index rows", async () => {
    const result = await filtered({ query: "select" });
    expect(ids(result)).toEqual([[], ["@beta/select"]]);
    expect(result.notes.some((note) => note.code === "not-in-index")).toBe(false);
    expect(renderList(result)).toContain("@alpha  Alpha components");
    expect(renderList(result)).toContain("  (no items)");
  });
});
