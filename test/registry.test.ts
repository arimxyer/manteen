import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";
import { compileRegistry } from "manteen-kit";

const CATALOG = resolve(import.meta.dirname, "../manteen.registry.json");

describe("house catalog", () => {
  test("compiles and conforms to the wire schema", () => {
    const { source, items, failures } = compileRegistry(CATALOG);

    expect(failures).toEqual([]);
    expect(source.namespace).toBe("@house");
    expect(items).toHaveLength(source.items.length);
  });

  test("every item declares the Mantine version it needs", () => {
    const { source } = compileRegistry(CATALOG);

    for (const item of source.items) {
      expect(item.mantine).toBeDefined();
    }
  });
});
