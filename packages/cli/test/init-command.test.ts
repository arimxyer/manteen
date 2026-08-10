import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Streams } from "../src/cli/render";
import { runInit } from "../src/commands/init";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-init-command-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

function packageJson(extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      ...extra,
      dependencies: { "@mantine/core": "^9", "@mantine/hooks": "^9" },
      devDependencies: {
        vite: "^8",
        "postcss-preset-mantine": "^1",
        "postcss-simple-vars": "^7",
      },
    },
    null,
    2,
  )}\n`;
}

function streams() {
  const output = { stdout: "", stderr: "" };
  const value: Streams = {
    stdout(text) {
      output.stdout += text;
    },
    stderr(text) {
      output.stderr += text;
    },
  };
  return { output, value };
}

function viteFixture(root: string): void {
  write(root, "package.json", packageJson());
  write(root, "index.html", '<div id="root"></div>\n');
  write(root, "src/main.tsx", "import './App';\n");
  write(root, "src/App.tsx", "export default function App() { return <main>Keep me</main>; }\n");
  write(root, "tsconfig.app.json", '{"compilerOptions":{"jsx":"react-jsx"}}\n');
  write(
    root,
    "vite.config.ts",
    'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n',
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("W6 init command shell", () => {
  test("text dry-run previews without writing and a real run applies", async () => {
    const root = fixture();
    viteFixture(root);

    const preview = streams();
    expect(await runInit({ cwd: root, dryRun: true, yes: true }, preview.value)).toBe(0);
    expect(preview.output.stderr).toBe("");
    expect(preview.output.stdout).toContain("Dry run — nothing was written.");
    expect(preview.output.stdout).toContain("create");
    expect(existsSync(join(root, "manteen.json"))).toBe(false);

    const applied = streams();
    expect(await runInit({ cwd: root, yes: true }, applied.value)).toBe(0);
    expect(applied.output.stderr).toBe("");
    expect(applied.output.stdout).toContain("written");
    expect(existsSync(join(root, "manteen.json"))).toBe(true);
  });

  test("JSON carries required Tailwind and manual work without corrupting stdout", async () => {
    const root = fixture();
    const tailwind = `export default { plugins: { "@tailwindcss/postcss": {} } };\n`;
    write(root, "package.json", packageJson());
    write(root, "tsconfig.json", '{"compilerOptions":{}}\n');
    write(root, "postcss.config.mjs", tailwind);

    const captured = streams();
    const exit = await runInit(
      { cwd: root, dryRun: true, json: true, framework: "manual" },
      captured.value,
    );
    const document = JSON.parse(captured.output.stdout) as {
      command: string;
      ok: boolean;
      complete: boolean;
      instructions: { code: string }[];
    };

    expect(exit).toBe(0);
    expect(captured.output.stderr).toBe("");
    expect(document.command).toBe("init");
    expect(document.ok).toBe(true);
    expect(document.complete).toBe(false);
    expect(document.instructions.map((instruction) => instruction.code)).toEqual([
      "manual-framework",
      "tailwind-postcss",
    ]);
    expect(readFileSync(join(root, "postcss.config.mjs"), "utf8")).toBe(tailwind);
  });

  test("JSON planning refusals preserve the requested dry-run mode", async () => {
    const root = fixture();
    viteFixture(root);
    const sourcePath = join(root, "src/App.tsx");
    const source = "export default chooseAtRuntime();\n";
    writeFileSync(sourcePath, source, "utf8");

    const captured = streams();
    const exit = await runInit({ cwd: root, dryRun: true, json: true }, captured.value);
    const document = JSON.parse(captured.output.stdout) as {
      ok: boolean;
      dryRun: boolean;
      diagnostics: { code: string }[];
    };

    expect(exit).toBe(1);
    expect(captured.output.stderr).toBe("");
    expect(document.ok).toBe(false);
    expect(document.dryRun).toBe(true);
    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "init-source-unsupported",
    );
    expect(readFileSync(sourcePath, "utf8")).toBe(source);
  });

  test("unknown framework and package-manager values are usage errors", async () => {
    const root = fixture();
    const framework = streams();
    const manager = streams();

    expect(await runInit({ cwd: root, framework: "astro" }, framework.value)).toBe(2);
    expect(framework.output.stderr).toContain("--framework astro is unknown");
    expect(await runInit({ cwd: root, pm: "magic" }, manager.value)).toBe(2);
    expect(manager.output.stderr).toContain("--pm magic");
  });
});
