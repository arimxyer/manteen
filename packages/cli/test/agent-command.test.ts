import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAgentGuide, runAgentInstall } from "../src/commands/agent";

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    streams: {
      stdout: (chunk: string) => stdout.push(chunk),
      stderr: (chunk: string) => stderr.push(chunk),
    },
  };
}

describe("packaged agent guidance", () => {
  test("guide works without project configuration", async () => {
    const output = io();
    expect(await runAgentGuide({ json: true }, output.streams)).toBe(0);
    expect(output.stderr).toEqual([]);
    const document = JSON.parse(output.stdout.join(""));
    expect(document).toMatchObject({
      command: "agent guide",
      ok: true,
      manifest: { schemaVersion: 1, skill: { name: "manteen" } },
    });
    expect(document.skill).toContain("name: manteen");
  });

  test("dry-run plans the default copy without creating it", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-agent-dry-"));
    const output = io();
    expect(await runAgentInstall({ cwd: root, dryRun: true, json: true }, output.streams)).toBe(0);
    const document = JSON.parse(output.stdout.join(""));
    expect(document).toMatchObject({ action: "install", dryRun: true, mutated: false });
    expect(existsSync(join(root, ".agents/skills/manteen"))).toBe(false);
  });

  test("installs, detects local adaptation, and requires explicit replacement", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-agent-install-"));
    const destination = join(root, "skill");
    const first = io();
    expect(
      await runAgentInstall(
        { cwd: root, target: "custom", path: "skill", json: true },
        first.streams,
      ),
    ).toBe(0);
    expect(existsSync(join(destination, ".manteen-skill.json"))).toBe(true);

    writeFileSync(
      join(destination, "SKILL.md"),
      `${readFileSync(join(destination, "SKILL.md"), "utf8")}\nlocal\n`,
    );
    const refused = io();
    expect(
      await runAgentInstall(
        { cwd: root, target: "custom", path: "skill", update: true, json: true },
        refused.streams,
      ),
    ).toBe(1);
    expect(JSON.parse(refused.stdout.join(""))).toMatchObject({
      action: "refused",
      mutated: false,
    });

    const replaced = io();
    expect(
      await runAgentInstall(
        {
          cwd: root,
          target: "custom",
          path: "skill",
          update: true,
          takePackaged: true,
          json: true,
        },
        replaced.streams,
      ),
    ).toBe(0);
    expect(readFileSync(join(destination, "SKILL.md"), "utf8")).not.toContain("\nlocal\n");
  });

  test("never adopts an unowned destination", async () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-agent-unowned-"));
    mkdirSync(join(root, "skill"));
    writeFileSync(join(root, "skill/note.txt"), "mine\n");
    const output = io();
    expect(
      await runAgentInstall(
        {
          cwd: root,
          target: "custom",
          path: "skill",
          update: true,
          takePackaged: true,
          json: true,
        },
        output.streams,
      ),
    ).toBe(1);
    expect(readFileSync(join(root, "skill/note.txt"), "utf8")).toBe("mine\n");
  });
});
