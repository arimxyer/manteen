import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

const CLI = resolve(import.meta.dirname, "../src/cli/index.ts");
const CATALOG = resolve(import.meta.dirname, "../fixtures/base/manteen.registry.json");
const COMMAND_SCHEMA = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../schema/manteen-kit-command.schema.json"), "utf8"),
);
const validateCommand = new Ajv2020({ allErrors: true, strict: true }).compile(COMMAND_SCHEMA);
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
  const parsed = JSON.parse(result.stdout.toString()) as Record<string, unknown>;
  expect(validateCommand(parsed), JSON.stringify(validateCommand.errors)).toBe(true);
  return parsed;
}

function invalidConformanceFixture(): { catalog: string; outDir: string; sentinel: string } {
  const root = temporaryRoot();
  const catalog = join(root, "manteen.registry.json");
  const outDir = join(root, "public/r");
  const sentinel = join(outDir, "sentinel.txt");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(root, "src/alpha.tsx"), "export const Alpha = () => null;\n");
  writeFileSync(sentinel, "unchanged\n");
  writeFileSync(
    catalog,
    `${JSON.stringify(
      {
        name: "third-party",
        namespace: "@workshop",
        authorProfile: "manteen.author-profile.json",
        items: [
          {
            name: "alpha",
            kind: "component",
            files: [{ path: "src/alpha.tsx", as: "component" }],
            stylesApi: { Alpha: ["root"] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "manteen.author-profile.json"),
    `${JSON.stringify({ schemaVersion: 1, stylesApi: [] }, null, 2)}\n`,
  );
  return { catalog, outDir, sentinel };
}

function invalidRangeFixture(item: Record<string, unknown>): {
  catalog: string;
  outDir: string;
  sentinel: string;
} {
  const root = temporaryRoot();
  const catalog = join(root, "manteen.registry.json");
  const outDir = join(root, "public/r");
  const sentinel = join(outDir, "sentinel.txt");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(root, "src/alpha.tsx"), "export const Alpha = () => null;\n");
  writeFileSync(sentinel, "unchanged\n");
  writeFileSync(
    catalog,
    `${JSON.stringify(
      {
        name: "independent",
        namespace: "@independent",
        items: [
          {
            name: "alpha",
            kind: "component",
            files: [{ path: "src/alpha.tsx", as: "component" }],
            ...item,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { catalog, outDir, sentinel };
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

  test("build and build --check author refusals are one valid zero-write envelope", () => {
    const created = invalidConformanceFixture();

    for (const mode of [[], ["--check"]]) {
      const result = run(["build", created.catalog, created.outDir, ...mode, "--json"]);
      const json = document(result);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe("");
      expect(json).toMatchObject({
        schemaVersion: 1,
        command: "build",
        ok: false,
        exitCode: 1,
        mutated: false,
        payload: null,
        errors: [{ code: "author-conformance-failed" }],
      });
      expect(readFileSync(created.sentinel, "utf8")).toBe("unchanged\n");
      expect(readdirSync(created.outDir)).toEqual(["sentinel.txt"]);
    }
  });

  test("range refusals are stable JSON and cannot mutate output", () => {
    const cases = [
      { item: { mantine: "not-a-range" }, code: "mantine-range-invalid" },
      { item: { mantine: "  " }, code: "mantine-range-invalid" },
      {
        item: { mantine: ">=9 <10", npm: ["@mantine/core@ "] },
        code: "mantine-range-invalid",
      },
      { item: { npm: ["@mantine/core@^9"] }, code: "mantine-gate-missing" },
      {
        item: { mantine: ">=9 <11", npm: ["@mantine/core@^9", "@mantine/hooks@^10"] },
        code: "mantine-ranges-disjoint",
      },
      {
        item: { mantine: ">=9.5.0 <10", npm: ["@mantine/core@^10"] },
        code: "mantine-dependency-outside-gate",
      },
    ];

    for (const { item, code } of cases) {
      const created = invalidRangeFixture(item);
      const result = run(["build", created.catalog, created.outDir, "--json"]);
      const json = document(result);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe("");
      expect(json).toMatchObject({
        ok: false,
        mutated: false,
        payload: null,
        errors: [
          {
            code: "mantine-range-validation-failed",
            details: [expect.objectContaining({ code })],
          },
        ],
      });
      expect(readFileSync(created.sentinel, "utf8")).toBe("unchanged\n");
      expect(readdirSync(created.outDir)).toEqual(["sentinel.txt"]);
    }
  });
});
