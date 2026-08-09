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
});
