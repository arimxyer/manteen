import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../src/config/load";
import { applyInit } from "../src/init/apply";
import { planInit } from "../src/init/plan";
import { createInitApplyPorts, createInitPlanPorts } from "../src/init/ports";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-init-integration-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("W6 source integration", () => {
  test("a Vite project applies, loads, and produces an empty second mutation plan", async () => {
    const root = fixture();
    write(
      root,
      "package.json",
      `${JSON.stringify(
        {
          dependencies: {
            "@mantine/core": "^9",
            "@mantine/hooks": "^9",
          },
          devDependencies: {
            vite: "^8",
            "postcss-preset-mantine": "^1",
            "postcss-simple-vars": "^7",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(root, "index.html", '<div id="root"></div>\n');
    write(root, "src/main.tsx", "import './App';\n");
    write(
      root,
      "src/App.tsx",
      `export default function App() {
  return <main>Keep this application</main>;
}
`,
    );
    write(root, "tsconfig.app.json", '{"compilerOptions":{"jsx":"react-jsx"}}\n');
    write(
      root,
      "vite.config.ts",
      'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n',
    );

    const planPorts = createInitPlanPorts();
    const first = await planInit(root, {}, planPorts);
    expect(first.ok).toBe(true);
    expect(first.dependencies).toEqual([]);
    expect(first.files.length).toBeGreaterThan(0);

    const outcome = await applyInit(first, { interactive: false }, createInitApplyPorts());
    expect(outcome.ok).toBe(true);
    expect(outcome.complete).toBe(true);
    expect(outcome.files.every((file) => file.written)).toBe(true);

    const loaded = loadConfig(root);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.config.themeDestination).toBe(join(root, "src/lib/theme.ts"));
      expect(loaded.config.tsconfigPath).toBe(join(root, "tsconfig.app.json"));
    }

    const second = await planInit(root, {}, planPorts);
    expect(second.ok).toBe(true);
    expect(second.files).toEqual([]);
    expect(second.dependencies).toEqual([]);
    expect(second.instructions).toEqual([]);
  });
});
