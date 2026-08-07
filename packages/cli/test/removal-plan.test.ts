import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../src/config/load";
import type { LoadedConfig } from "../src/config/types";
import type { Receipt } from "../src/plan/types";
import { basePathFor } from "../src/receipt/path";
import { serializeReceipt } from "../src/receipt/write";
import { planRemoval } from "../src/removal/plan";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function makeProject(): { root: string; registry: string; config: LoadedConfig } {
  const root = mkdtempSync(join(tmpdir(), "manteen-removal-plan-"));
  roots.push(root);
  const registry = join(root, "registry");
  mkdirSync(registry);
  const registryBase = pathToFileURL(`${registry}/`).href;

  write(
    join(root, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/components/*": ["./src/components/*"],
            "@/components/ui/*": ["./src/components/ui/*"],
            "@/hooks/*": ["./src/hooks/*"],
            "@/lib/*": ["./src/lib/*"],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@house": `${registryBase}{name}.json` },
        aliases: {
          components: "@/components",
          ui: "@/components/ui",
          hooks: "@/hooks",
          lib: "@/lib",
        },
        theme: "src/lib/theme.ts",
        styles: "src/manteen.css",
      },
      null,
      2,
    )}\n`,
  );
  const loaded = loadConfig(root);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("; "));
  return { root, registry, config: loaded.config };
}

function item(name: string, files: unknown[] = []): Record<string, unknown> {
  return {
    name,
    type: "registry:ui",
    files,
    // Both are deliberately invalid for add/update's narrower Mantine/CSS
    // contracts. Removal does not interpret either surface.
    css: { ":root": { color: "red" } },
    meta: { mantine: { requires: 123 } },
  };
}

function receiptFor(old: string): Receipt {
  return {
    lockfileVersion: 3,
    items: [
      {
        id: "@house/offline",
        registry: "@house",
        sourceUrl: "file:///registry/offline.json",
        wireType: "registry:ui",
        direct: false,
        files: [],
      },
      {
        id: "@house/widget",
        registry: "@house",
        sourceUrl: "file:///registry/widget.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          {
            destination: "src/components/ui/old.tsx",
            wireType: "registry:ui",
            installedSha256: sha(old),
            baseSha256: sha(old),
          },
        ],
      },
    ],
    theme: null,
    styles: null,
  };
}

const DISCOVERY = {
  upstreamRemoved: true,
  dryRun: true,
  files: [],
  discardAdapted: false,
} as const;

describe("production upstream-removal planning", () => {
  test("no receipt is an honest empty discovery with no graph fetch", async () => {
    const { config } = makeProject();
    const plan = await planRemoval(config, DISCOVERY);

    expect(plan.ok).toBe(true);
    expect(plan.candidates).toEqual([]);
    expect(plan.receipt.sha256).toBeNull();
    expect(plan.receipt.projectedChange).toBe(false);
    expect(plan.notes.map((note) => note.code)).toEqual(["no-receipt"]);
  });

  test("an unavailable zero-file receipt root blocks the whole candidate list", async () => {
    const { root, registry, config } = makeProject();
    const old = "export const Old = 1;\n";
    const source = join(root, "src/components/ui/old.tsx");
    write(source, old);
    write(basePathFor(source, root), old);
    write(join(root, "manteen.lock.json"), serializeReceipt(receiptFor(old)));
    write(join(registry, "widget.json"), `${JSON.stringify(item("widget"), null, 2)}\n`);

    const blocked = await planRemoval(config, DISCOVERY);
    expect(blocked.ok).toBe(false);
    expect(blocked.candidates).toEqual([]);
    expect(blocked.diagnostics.map((diagnostic) => diagnostic.code)).toContain("fetch-failed");

    write(join(registry, "offline.json"), `${JSON.stringify(item("offline"), null, 2)}\n`);
    // A receipt root is an exact same-id proof seed. Name resolutions still
    // govern its transitive dependencies, but must not rewrite this root to an
    // item whose omission says nothing about @house/widget.
    const complete = await planRemoval(
      { ...config, resolutions: new Map([["widget", "@house/other"]]) },
      DISCOVERY,
    );
    expect(complete.ok).toBe(true);
    expect(complete.diagnostics).toEqual([]);
    expect(complete.candidates).toEqual([
      {
        itemId: "@house/widget",
        destination: "src/components/ui/old.tsx",
        state: "unchanged",
        base: "present",
        selected: false,
        discardAdaptedRequired: false,
      },
    ]);
  });

  test("a selected plan projects exact receipt bytes and absolute source/base preimages", async () => {
    const { root, registry, config } = makeProject();
    const old = "export const Old = 1;\n";
    const source = join(root, "src/components/ui/old.tsx");
    const base = basePathFor(source, root);
    write(source, old);
    write(base, old);
    const unsortedReceipt = receiptFor(old);
    unsortedReceipt.items.reverse();
    write(join(root, "manteen.lock.json"), `${JSON.stringify(unsortedReceipt, null, 2)}\n`);
    write(join(registry, "widget.json"), `${JSON.stringify(item("widget"), null, 2)}\n`);
    write(join(registry, "offline.json"), `${JSON.stringify(item("offline"), null, 2)}\n`);

    const plan = await planRemoval(config, {
      ...DISCOVERY,
      dryRun: false,
      files: ["src/components/ui/old.tsx"],
    });

    expect(plan.ok).toBe(true);
    expect(plan.receipt.projectedChange).toBe(true);
    expect(plan.removals).toEqual([
      {
        itemId: "@house/widget",
        destination: "src/components/ui/old.tsx",
        source: { path: source, sha256: sha(old) },
        base: { path: base, sha256: sha(old) },
      },
    ]);
    const projected = JSON.parse(plan.receipt.projectedText) as Receipt;
    expect(projected.items.map((entry) => entry.id)).toEqual(["@house/widget", "@house/offline"]);
    expect(projected.items.find((entry) => entry.id === "@house/widget")).toMatchObject({
      direct: true,
      files: [],
    });
  });

  test("a symlinked or junction parent blocks discovery before it grants deletion authority", async () => {
    const { root, registry, config } = makeProject();
    const outside = mkdtempSync(join(tmpdir(), "manteen-removal-plan-outside-"));
    roots.push(outside);
    const old = "export const Old = 1;\n";
    const source = join(root, "src/components/ui/old.tsx");
    write(join(outside, "components/ui/old.tsx"), old);
    symlinkSync(outside, join(root, "src"), process.platform === "win32" ? "junction" : "dir");
    write(basePathFor(source, root), old);
    write(join(root, "manteen.lock.json"), serializeReceipt(receiptFor(old)));
    write(join(registry, "widget.json"), `${JSON.stringify(item("widget"), null, 2)}\n`);
    write(join(registry, "offline.json"), `${JSON.stringify(item("offline"), null, 2)}\n`);

    const plan = await planRemoval(config, DISCOVERY);

    expect(plan.ok).toBe(false);
    expect(plan.candidates).toEqual([]);
    expect(plan.diagnostics).toEqual([
      expect.objectContaining({
        code: "remove-path-unsupported",
        path: "src/components/ui/old.tsx",
      }),
    ]);
  });

  test("a hand-edited receipt cannot make its own bytes a removal source", async () => {
    const { root, registry, config } = makeProject();
    const current = receiptFor("unused");
    current.items = [
      {
        ...current.items[1]!,
        files: [
          {
            destination: "manteen.lock.json",
            wireType: "registry:ui",
            installedSha256: "a".repeat(64),
            baseSha256: "a".repeat(64),
          },
        ],
      },
    ];
    write(join(root, "manteen.lock.json"), serializeReceipt(current));
    write(join(registry, "widget.json"), `${JSON.stringify(item("widget"), null, 2)}\n`);

    const plan = await planRemoval(config, DISCOVERY);

    expect(plan.ok).toBe(false);
    expect(plan.candidates).toEqual([]);
    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ code: "remove-path-unsupported", path: "manteen.lock.json" }),
    ]);
  });
});
