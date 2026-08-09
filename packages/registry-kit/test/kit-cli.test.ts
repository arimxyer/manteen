import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dirname, "../src/cli/index.ts");
const CATALOG = resolve(import.meta.dirname, "../fixtures/base/manteen.registry.json");
const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-kit-cli-"));
  roots.push(root);
  return root;
}

function run(args: string[]) {
  return Bun.spawnSync([process.execPath, CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
}

function document(result: ReturnType<typeof run>): Record<string, unknown> {
  return JSON.parse(result.stdout.toString()) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kit JSON commands", () => {
  test("merge-theme --write --json writes the reported merge", () => {
    const root = temporaryRoot();
    const base = join(root, "theme.ts");
    const fragment = join(root, "fragment.ts");
    writeFileSync(
      base,
      'import { createTheme } from "@mantine/core";\nexport const theme = createTheme({ primaryColor: "blue" });\n',
    );
    writeFileSync(
      fragment,
      'import { createTheme } from "@mantine/core";\nexport const theme = createTheme({ defaultRadius: "md" });\n',
    );

    const result = run(["merge-theme", base, fragment, "--write", "--json"]);
    const json = document(result);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe("");
    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(true);
    expect(json.mutated).toBe(true);
    expect(readFileSync(base, "utf8")).toContain('defaultRadius: "md"');
  });

  test("build --check --json distinguishes missing and clean without mutating", () => {
    const outDir = join(temporaryRoot(), "r");
    const missing = run(["build", CATALOG, outDir, "--check", "--json"]);
    const missingJson = document(missing) as { payload: { status: string }; mutated: boolean };
    expect(missing.exitCode).toBe(1);
    expect(missingJson.payload.status).toBe("missing");
    expect(missingJson.mutated).toBe(false);

    const built = run(["build", CATALOG, outDir, "--json"]);
    expect(built.exitCode).toBe(0);
    expect((document(built) as { mutated: boolean }).mutated).toBe(true);

    const clean = run(["build", CATALOG, outDir, "--check", "--json"]);
    expect(clean.exitCode).toBe(0);
    expect((document(clean) as { payload: { status: string } }).payload.status).toBe("clean");
  });

  test("recognized JSON refusals emit exactly one stdout document", () => {
    const result = run(["build", "--unknown", "--json"]);
    const json = document(result);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toBe("");
    expect(json.ok).toBe(false);
    expect(json.errors).toEqual([expect.objectContaining({ code: "invalid-arguments" })]);
  });
});
