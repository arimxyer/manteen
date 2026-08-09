import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createManteenClient,
  ManteenClientConfigError,
  type ManteenPlanHandle,
} from "../src/client/index";
import type { LoadedConfig } from "../src/config/types";

function emptyConfig(root: string): LoadedConfig {
  return {
    configPath: join(root, "manteen.json"),
    root,
    raw: {
      registries: {},
      aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
    },
    registries: new Map(),
    aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
    aliasBacking: {
      components: { key: "@/*", sample: join(root, "src/components/example.tsx") },
      ui: { key: "@/*", sample: join(root, "src/ui/example.tsx") },
      hooks: { key: "@/*", sample: join(root, "src/hooks/example.tsx") },
      lib: { key: "@/*", sample: join(root, "src/lib/example.tsx") },
    },
    themeDestination: null,
    stylesDestination: null,
    tsconfigPath: join(root, "tsconfig.json"),
    tsconfig: { path: join(root, "tsconfig.json"), config: {} } as LoadedConfig["tsconfig"],
    jsconfigOnly: false,
    resolutions: new Map(),
    target: () => {
      throw new Error("target is unreachable in read-only tests");
    },
  };
}

describe("createManteenClient", () => {
  test("wires read operations for one validated project without requiring a registry", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-client-"));
    const client = createManteenClient({ config: emptyConfig(root) });

    expect(client.root).toBe(root);
    expect((await client.list()).groups).toEqual([]);
    expect((await client.available()).registries).toEqual([]);
    expect(client.installed().source.state).toBe("absent");
  });

  test("rejects a forged plan handle before apply can mutate anything", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-client-"));
    const client = createManteenClient({ config: emptyConfig(root) });
    const forged = { kind: "manteen-plan", preview: {} } as unknown as ManteenPlanHandle;

    expect(client.apply(forged)).rejects.toThrow("foreign or expired plan handle");
  });

  test("returns a frozen, content-free preview backed by an applicable opaque handle", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-client-"));
    const client = createManteenClient({ config: emptyConfig(root) });

    const handle = await client.plan([]);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(Object.isFrozen(handle.preview)).toBe(true);
    expect(handle.preview.items).toEqual([]);
    expect(handle.preview.files).toEqual([]);
    expect(JSON.stringify(handle.preview)).not.toContain("content");

    // Applying the genuine handle in dry-run mode returns the ordinary preview
    // outcome rather than treating the opaque handle itself as invalid.
    const outcome = await client.apply(handle, { dryRun: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.files).toEqual([]);
    expect(outcome.updateState.changed).toBe(false);
  });

  test("surfaces config loading failures as a typed error", () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-client-"));
    expect(() => createManteenClient({ cwd: root })).toThrow(ManteenClientConfigError);
    try {
      createManteenClient({ cwd: root });
    } catch (error) {
      expect(error).toBeInstanceOf(ManteenClientConfigError);
      expect((error as ManteenClientConfigError).errors.length).toBeGreaterThan(0);
    }
  });
});
