import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewedApplyActions } from "../src/cli/machine";
import type { Streams } from "../src/cli/render";
import {
  runRegistryAdd,
  runRegistryList,
  runRegistryReconnect,
  runRegistryRemove,
} from "../src/commands/registry";
import {
  runVerificationClear,
  runVerificationSet,
  runVerificationShow,
} from "../src/commands/verification";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-config-command-"));
  roots.push(root);
  writeFileSync(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@house": "https://house.test/{name}.json" },
        aliases: { components: "@/components", ui: "@/ui", hooks: "@/hooks", lib: "@/lib" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ scripts: { test: "bun test", typecheck: "tsc --noEmit", lint: "eslint ." } })}\n`,
  );
  return root;
}

function capture(): { streams: Streams; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    streams: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

describe("registry configuration commands", () => {
  test("reconnect verifies installed identities and atomically migrates config plus receipt", async () => {
    const root = fixture();
    const receiptPath = join(root, "manteen.lock.json");
    writeFileSync(
      receiptPath,
      `${JSON.stringify(
        {
          lockfileVersion: 3,
          items: [
            {
              id: "@house/card",
              registry: "@house",
              sourceUrl: "http://127.0.0.1:4000/card.json",
              wireType: "registry:ui",
              direct: true,
              files: [],
            },
          ],
          theme: null,
          styles: null,
        },
        null,
        2,
      )}\n`,
    );
    const server = createServer((request, response) => {
      if (request.url !== "/card.json") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: "card",
          type: "registry:ui",
          files: [{ path: "card.tsx", type: "registry:ui", content: "export const Card = 1;" }],
        }),
      );
    });
    await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("test server did not bind");
    const url = `http://127.0.0.1:${address.port}/{name}.json`;
    try {
      const beforeConfig = readFileSync(join(root, "manteen.json"), "utf8");
      const beforeReceipt = readFileSync(receiptPath, "utf8");
      const planned = capture();
      expect(
        await runRegistryReconnect(
          "@house",
          { cwd: root, url, dryRun: true, json: true },
          planned.streams,
        ),
      ).toBe(0);
      expect(readFileSync(join(root, "manteen.json"), "utf8")).toBe(beforeConfig);
      expect(readFileSync(receiptPath, "utf8")).toBe(beforeReceipt);
      const preview = JSON.parse(planned.stdout.join(""));
      expect(preview.plan.items).toEqual([
        expect.objectContaining({
          id: "@house/card",
          wireType: "registry:ui",
          sourceUrl: url.replace("{name}", "card"),
        }),
      ]);

      const applied = capture();
      expect(
        await runRegistryReconnect(
          "@house",
          { cwd: root, url, expectPlan: preview.planDigest, json: true },
          applied.streams,
        ),
      ).toBe(0);
      expect(
        JSON.parse(readFileSync(join(root, "manteen.json"), "utf8").toString()).registries[
          "@house"
        ],
      ).toBe(url);
      expect(JSON.parse(readFileSync(receiptPath, "utf8")).items[0].sourceUrl).toBe(
        url.replace("{name}", "card"),
      );
    } finally {
      await new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      );
    }
  });

  test("reconnect refuses an endpoint whose item identity changed", async () => {
    const root = fixture();
    const receiptPath = join(root, "manteen.lock.json");
    writeFileSync(
      receiptPath,
      `${JSON.stringify({
        lockfileVersion: 3,
        items: [
          {
            id: "@house/card",
            registry: "@house",
            sourceUrl: "http://old.test/card.json",
            wireType: "registry:ui",
            direct: true,
            files: [],
          },
        ],
        theme: null,
        styles: null,
      })}\n`,
    );
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: "not-card",
          type: "registry:ui",
          files: [{ path: "card.tsx", type: "registry:ui", content: "export const Card = 1;" }],
        }),
      );
    });
    await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("test server did not bind");
    try {
      const result = capture();
      expect(
        await runRegistryReconnect(
          "@house",
          {
            cwd: root,
            url: `http://127.0.0.1:${address.port}/{name}.json`,
            dryRun: true,
          },
          result.streams,
        ),
      ).toBe(1);
      expect(result.stderr.join("")).toContain("registry-reconnect-refused");
      expect(result.stderr.join("")).toContain("expected card");
    } finally {
      await new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      );
    }
  });

  test("dry-run redacts templates, applies the exact plan, and lists without expansion", async () => {
    const root = fixture();
    const before = readFileSync(join(root, "manteen.json"), "utf8");
    const planned = capture();
    const flags = {
      cwd: root,
      url: "https://registry.test/{name}.json",
      header: ["Authorization=Bearer ${WORKSHOP_TOKEN}"],
      param: ["token=${WORKSHOP_QUERY}"],
      dryRun: true,
      json: true,
    };

    expect(await runRegistryAdd("@workshop", flags, planned.streams)).toBe(0);
    expect(readFileSync(join(root, "manteen.json"), "utf8")).toBe(before);
    const preview = JSON.parse(planned.stdout.join(""));
    expect(preview.source).toEqual({
      url: "https://registry.test/{name}.json",
      headerKeys: ["Authorization"],
      paramKeys: ["token"],
    });
    expect(planned.stdout.join("")).not.toContain("WORKSHOP_TOKEN");
    expect(planned.stdout.join("")).not.toContain("WORKSHOP_QUERY");

    const applied = capture();
    expect(
      await runRegistryAdd(
        "@workshop",
        { ...flags, dryRun: false, expectPlan: preview.planDigest },
        applied.streams,
      ),
    ).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).registries).toHaveProperty(
      "@workshop",
    );

    const listed = capture();
    expect(await runRegistryList({ cwd: root, json: true }, listed.streams)).toBe(0);
    expect(listed.stdout.join("")).not.toContain("WORKSHOP_TOKEN");
    expect(listed.stdout.join("")).not.toContain("WORKSHOP_QUERY");
  });

  test("refuses replacing a differing source without explicit review and removing the last source", async () => {
    const root = fixture();
    const replace = capture();
    expect(
      await runRegistryAdd(
        "@house",
        { cwd: root, url: "https://new.test/{name}.json", dryRun: true },
        replace.streams,
      ),
    ).toBe(2);
    expect(replace.stderr.join("")).toContain("--replace");

    const remove = capture();
    expect(await runRegistryRemove("@house", { cwd: root, dryRun: true }, remove.streams)).toBe(2);
    expect(remove.stderr.join("")).toContain("last configured registry");
  });

  test("refuses an invalid authored config instead of mutating through an unchecked cast", async () => {
    const root = fixture();
    const path = join(root, "manteen.json");
    const before = '{"registries":[],"aliases":{}}\n';
    writeFileSync(path, before);
    const result = capture();

    expect(
      await runRegistryAdd(
        "@workshop",
        { cwd: root, url: "https://registry.test/{name}.json", dryRun: true },
        result.streams,
      ),
    ).toBe(2);
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(result.stderr.join("")).toContain("must be object");
  });

  test("a dry-run payload produces one exact reviewed rerun action", () => {
    const digest = "a".repeat(64);
    const actions = reviewedApplyActions(
      { dryRun: true, planDigest: digest },
      [
        "manteen",
        "registry",
        "add",
        "@workshop",
        "--dry-run",
        "--json",
        "--expect-plan",
        "b".repeat(64),
      ],
      "/project",
    );

    expect(actions).toEqual([
      {
        kind: "rerun",
        argv: [
          "manteen",
          "registry",
          "add",
          "@workshop",
          "--json",
          "--cwd",
          "/project",
          "--expect-plan",
          digest,
        ],
      },
    ]);
    expect(
      reviewedApplyActions(
        { dryRun: true, planDigest: digest, candidates: [{ selected: false }] },
        ["manteen", "remove", "--upstream-removed", "--dry-run", "--json"],
      ),
    ).toEqual([]);
  });
});

describe("verification configuration commands", () => {
  test("discovers scripts and sets, preserves, and clears explicit operation lists", async () => {
    const root = fixture();
    const shown = capture();
    expect(await runVerificationShow({ cwd: root, json: true }, shown.streams)).toBe(0);
    expect(JSON.parse(shown.stdout.join("")).availableScripts).toEqual([
      "lint",
      "test",
      "typecheck",
    ]);

    const planned = capture();
    expect(
      await runVerificationSet(
        { cwd: root, add: ["test", "typecheck"], timeoutMs: "5000", dryRun: true, json: true },
        planned.streams,
      ),
    ).toBe(0);
    const preview = JSON.parse(planned.stdout.join(""));
    const applied = capture();
    expect(
      await runVerificationSet(
        {
          cwd: root,
          add: ["test", "typecheck"],
          timeoutMs: "5000",
          expectPlan: preview.planDigest,
        },
        applied.streams,
      ),
    ).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).verification).toEqual({
      add: ["test", "typecheck"],
      timeoutMs: 5000,
    });

    const clearPlanOutput = capture();
    expect(
      await runVerificationClear(
        { cwd: root, operation: "add", dryRun: true, json: true },
        clearPlanOutput.streams,
      ),
    ).toBe(0);
    const clearPlan = JSON.parse(clearPlanOutput.stdout.join(""));
    expect(
      await runVerificationClear(
        { cwd: root, operation: "add", expectPlan: clearPlan.planDigest },
        capture().streams,
      ),
    ).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "manteen.json"), "utf8")).verification,
    ).toBeUndefined();
  });

  test("refuses unknown scripts and a timeout-only verification block", async () => {
    const root = fixture();
    const unknown = capture();
    expect(
      await runVerificationSet({ cwd: root, add: ["missing"], dryRun: true }, unknown.streams),
    ).toBe(2);
    expect(unknown.stderr.join("")).toContain("does not define");

    const timeout = capture();
    expect(
      await runVerificationSet({ cwd: root, timeoutMs: "5000", dryRun: true }, timeout.streams),
    ).toBe(2);
    expect(timeout.stderr.join("")).toContain("at least one add, update, or remove");
  });
});
