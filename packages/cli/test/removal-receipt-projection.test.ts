import { describe, expect, test } from "bun:test";
import type { Receipt } from "../src/plan/types";
import {
  projectRemovalReceipt,
  serializeProjectedRemovalReceipt,
} from "../src/removal/receipt-projection";

const HASH = "a".repeat(64);

function receipt(): Receipt {
  return {
    $schema: "./node_modules/manteen/schema/manteen.lock.schema.json",
    lockfileVersion: 3,
    items: [
      {
        id: "@house/empty",
        registry: "@house",
        sourceUrl: "https://example.test/r/empty.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          {
            destination: "src/empty.tsx",
            wireType: "registry:ui",
            installedSha256: HASH,
            baseSha256: HASH,
          },
        ],
      },
      {
        id: "@house/multi",
        registry: "@house",
        sourceUrl: "https://example.test/r/multi.json",
        wireType: "registry:ui",
        direct: false,
        files: [
          {
            destination: "src/keep.tsx",
            wireType: "registry:ui",
            installedSha256: HASH,
            baseSha256: HASH,
          },
          {
            destination: "src/remove.tsx",
            wireType: "registry:ui",
            installedSha256: HASH,
            baseSha256: HASH,
          },
        ],
      },
    ],
    theme: {
      destination: "src/lib/theme.ts",
      sha256: HASH,
      sources: [{ itemId: "@house/empty", kind: "absorbed-file", path: "theme.ts" }],
    },
    styles: {
      destination: "src/manteen.css",
      sha256: HASH,
      sources: [
        {
          itemId: "@house/empty",
          dependsOn: [],
          imports: ["@mantine/core/styles.css"],
        },
      ],
    },
  };
}

describe("pure removal receipt projection", () => {
  test("filters exact owner/destination pairs while retaining zero-file items and provenance", () => {
    const original = receipt();
    const before = structuredClone(original);
    const result = projectRemovalReceipt(original, [
      { itemId: "@house/empty", destination: "src/empty.tsx" },
      { itemId: "@house/multi", destination: "src/remove.tsx" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.receipt.items).toHaveLength(2);
    expect(result.receipt.items[0]).toMatchObject({
      id: "@house/empty",
      direct: true,
      registry: "@house",
      files: [],
    });
    expect(result.receipt.items[1]?.files.map((file) => file.destination)).toEqual([
      "src/keep.tsx",
    ]);
    expect(result.receipt.$schema).toBe(original.$schema);
    expect(result.receipt.theme).toBe(original.theme);
    expect(result.receipt.styles).toBe(original.styles);
    expect(original).toEqual(before);
  });

  test("fails closed on a duplicate or non-owned exact pair", () => {
    const selection = { itemId: "@house/empty", destination: "src/empty.tsx" };
    expect(projectRemovalReceipt(receipt(), [selection, selection])).toEqual({
      ok: false,
      reason: "duplicate-selection",
      selection,
    });
    expect(
      projectRemovalReceipt(receipt(), [{ itemId: "@wrong/empty", destination: "src/empty.tsx" }]),
    ).toEqual({
      ok: false,
      reason: "record-not-found",
      selection: { itemId: "@wrong/empty", destination: "src/empty.tsx" },
    });
  });

  test("an empty projection returns the original receipt unchanged", () => {
    const original = receipt();
    const result = projectRemovalReceipt(original, []);
    expect(result).toEqual({ ok: true, changed: false, receipt: original, removed: [] });
    if (result.ok) expect(result.receipt).toBe(original);
  });

  test("removal serialization preserves existing item and file order", () => {
    const original = receipt();
    original.items.reverse();
    original.items[0]?.files.reverse();
    const result = projectRemovalReceipt(original, [
      { itemId: "@house/multi", destination: "src/remove.tsx" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.parse(serializeProjectedRemovalReceipt(result.receipt)) as Receipt;
    expect(serialized.items.map((item) => item.id)).toEqual(["@house/multi", "@house/empty"]);
    expect(serialized.items[0]?.files.map((file) => file.destination)).toEqual(["src/keep.tsx"]);
  });
});
