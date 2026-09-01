import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStatus, runStatus } from "../src/commands/status";

function project(): string {
  return mkdtempSync(join(tmpdir(), "manteen-status-"));
}

describe("offline status", () => {
  test("missing setup is a successful unhealthy assessment", async () => {
    const root = project();
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(
      await runStatus(
        { cwd: root, json: true },
        { stdout: (chunk) => stdout.push(chunk), stderr: (chunk) => stderr.push(chunk) },
      ),
    ).toBe(0);
    expect(stderr).toEqual([]);
    const document = JSON.parse(stdout.join(""));
    expect(document).toMatchObject({
      command: "status",
      ok: true,
      healthy: false,
      initialized: false,
      config: { ok: false },
    });
  });

  test("reports config, receipt, verification, gitignore and skill without registry I/O", async () => {
    const root = project();
    writeFileSync(
      join(root, "manteen.json"),
      `${JSON.stringify({
        registries: { "@private": "https://offline.invalid/${REGISTRY_TOKEN}/{name}.json" },
        aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
        verification: { update: ["check"] },
      })}\n`,
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } })}\n`,
    );
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ packageManager: "npm@11.0.0", scripts: { check: "node --check index.js" } })}\n`,
    );
    mkdirSync(join(root, ".agents/skills/manteen"), { recursive: true });
    writeFileSync(join(root, ".agents/skills/manteen/SKILL.md"), "---\nname: manteen\n---\n");

    const status = await buildStatus(root);
    expect(status.initialized).toBe(true);
    expect(status.config.ok).toBe(true);
    expect(status.receipt.value.state).toBe("absent");
    expect(status.verification).toMatchObject({ ok: true, value: { configured: true } });
    expect(status.skill).toMatchObject({ ok: false, value: { installed: true, owned: false } });
  });

  test.each([
    [
      "invalid JSON",
      '{"private":"INVALID_JSON_SECRET"',
      "INVALID_JSON_SECRET",
      "receipt-invalid-json",
      "unparseable",
    ],
    [
      "wrong top-level type",
      '["WRONG_TYPE_SECRET"]\n',
      "WRONG_TYPE_SECRET",
      "receipt-schema-invalid",
      "invalid",
    ],
    [
      "unsupported version",
      '{"lockfileVersion":2,"private":"UNSUPPORTED_VERSION_SECRET"}\n',
      "UNSUPPORTED_VERSION_SECRET",
      "receipt-unsupported-version",
      "unsupported-version",
    ],
    [
      "future version",
      '{"lockfileVersion":4,"private":"FUTURE_VERSION_SECRET"}\n',
      "FUTURE_VERSION_SECRET",
      "receipt-future-version",
      "future-version",
    ],
  ] as const)(
    "distinguishes %s receipt recovery without exposing source bytes",
    async (_, source, secret, code, reason) => {
      const root = project();
      writeFileSync(join(root, "manteen.lock.json"), source);

      const status = await buildStatus(root);

      expect(status.healthy).toBe(false);
      expect(status.receipt).toMatchObject({
        ok: false,
        value: { state: "unreadable", reason, itemCount: 0 },
      });
      expect(status.diagnostics).toEqual([
        expect.objectContaining({
          code,
          severity: "warn",
          forceable: false,
          actions: [
            {
              kind: "manual",
              instruction: expect.stringContaining("trusted version control or backup"),
            },
          ],
        }),
      ]);
      expect(status.actions).toEqual(status.diagnostics[0]?.actions ?? []);
      expect(JSON.stringify(status)).not.toContain(secret);
    },
  );

  test("distinguishes a receipt I/O failure from invalid receipt bytes", async () => {
    const root = project();
    mkdirSync(join(root, "manteen.lock.json"));

    const status = await buildStatus(root);

    expect(status.receipt).toMatchObject({
      ok: false,
      value: { state: "unreadable", reason: "io", itemCount: 0 },
    });
    expect(status.diagnostics).toEqual([
      expect.objectContaining({
        code: "receipt-io-unreadable",
        severity: "warn",
        actions: [
          {
            kind: "manual",
            instruction: expect.stringContaining("trusted version control or backup"),
          },
        ],
      }),
    ]);
  });
});
