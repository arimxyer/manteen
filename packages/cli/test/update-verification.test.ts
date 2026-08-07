import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { hashFileBytes, preflight } from "../src/apply/preflight";
import { renderVerification, update } from "../src/commands/update";
import { loadConfig } from "../src/config/load";
import { createConfigValidator } from "../src/config/validate";
import { isBlocking } from "../src/plan/diagnostics";
import type { ApplyOutcome, Plan, Receipt } from "../src/plan/types";
import { createReceiptReader, createReceiptValidator } from "../src/receipt/load";
import { basePathFor } from "../src/receipt/path";
import { planUpdateVerification } from "../src/verification/plan";
import {
  verificationEnvironment,
  verificationExecutionCommand,
  verifyAppliedUpdate,
} from "../src/verification/run";
import type {
  PlannedVerification,
  VerificationProcessRequest,
  VerificationProcessResult,
} from "../src/verification/types";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function sha(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(path: string, contents: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

const BASE_CONFIG = {
  registries: { "@test": "https://example.test/r/{name}.json" },
  aliases: {
    components: "@/components",
    ui: "@/components/ui",
    hooks: "@/hooks",
    lib: "@/lib",
  },
};

describe("verification config schema", () => {
  const schema = JSON.parse(
    readFileSync(join(import.meta.dirname, "../schema/manteen.schema.json"), "utf8"),
  ) as object;
  const validate = createConfigValidator(schema);

  test("accepts an ordered, unique, non-empty update script list", () => {
    expect(
      validate({
        ...BASE_CONFIG,
        verification: { update: ["verify:types", "verify:test"] },
      }),
    ).toBeNull();
  });

  test.each([
    ["missing update", {}],
    ["empty list", { update: [] }],
    ["duplicate names", { update: ["test", "test"] }],
    ["empty name", { update: [""] }],
    ["whitespace-only name", { update: ["   "] }],
    ["non-array update", { update: "test" }],
    ["unknown field", { update: ["test"], add: ["test"] }],
  ])("rejects %s", (_label, verification) => {
    expect(validate({ ...BASE_CONFIG, verification })).not.toBeNull();
  });
});

describe("verification planning", () => {
  test("preserves authored order, exact definitions, and the whole package.json pre-image", () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-verification-plan-"));
    roots.push(root);
    const packageJson = `${JSON.stringify(
      {
        packageManager: "npm@10.9.2",
        scripts: {
          test: "node --test",
          typecheck: "tsc --noEmit && echo exact",
        },
      },
      null,
      2,
    )}\n`;
    write(join(root, "package.json"), packageJson);

    const result = planUpdateVerification(root, ["typecheck", "test"], "npm");

    expect(result.diagnostics).toEqual([]);
    expect(result.verification?.checks).toEqual([
      {
        script: "typecheck",
        definition: "tsc --noEmit && echo exact",
        command: "npm run typecheck",
        executable: "npm",
        args: ["run", "typecheck"],
      },
      {
        script: "test",
        definition: "node --test",
        command: "npm run test",
        executable: "npm",
        args: ["run", "test"],
      },
    ]);
    expect(result.verification?.packageJson.sha256).toBe(sha(packageJson));
  });

  test("refuses a missing definition and --force cannot clear the diagnostic", () => {
    const root = mkdtempSync(join(tmpdir(), "manteen-verification-missing-"));
    roots.push(root);
    write(join(root, "package.json"), '{"scripts":{"test":"node --test"}}\n');

    const result = planUpdateVerification(root, ["missing"], "npm");

    expect(result.verification).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("verification-script-unavailable");
    expect(isBlocking(result.diagnostics[0] as never, true)).toBe(true);
  });
});

interface VerificationFixture {
  root: string;
  source: string;
  packagePath: string;
  plan: Plan;
  verification: PlannedVerification;
}

function verificationFixture(scriptNames: string[]): VerificationFixture {
  const root = mkdtempSync(join(tmpdir(), "manteen-verification-run-"));
  roots.push(root);
  const source = join(root, "src", "component.tsx");
  const base = basePathFor(source, root);
  const packagePath = join(root, "package.json");
  const configPath = join(root, "manteen.json");
  const receiptPath = join(root, "manteen.lock.json");
  const component = "export const Component = () => null;\n";
  const packageJson = `${JSON.stringify({
    packageManager: "npm@10.9.2",
    scripts: Object.fromEntries(scriptNames.map((name) => [name, `node ${name}.mjs`])),
  })}\n`;

  write(source, component);
  write(base, component);
  write(packagePath, packageJson);
  write(
    configPath,
    `${JSON.stringify({ ...BASE_CONFIG, verification: { update: scriptNames } })}\n`,
  );
  write(
    join(root, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/components/ui/*": ["./src/components/ui/*"],
          "@/components/*": ["./src/components/*"],
          "@/hooks/*": ["./src/hooks/*"],
          "@/lib/*": ["./src/lib/*"],
        },
      },
    })}\n`,
  );

  const receipt: Receipt = {
    lockfileVersion: 3,
    items: [
      {
        id: "@test/component",
        registry: "@test",
        sourceUrl: "https://example.test/r/component.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          {
            destination: "src/component.tsx",
            wireType: "registry:ui",
            installedSha256: sha(component),
            baseSha256: sha(component),
          },
        ],
      },
    ],
    theme: null,
    styles: null,
  };
  const receiptRaw = `${JSON.stringify(receipt, null, 2)}\n`;
  write(receiptPath, receiptRaw);

  const planned = planUpdateVerification(root, scriptNames, "npm").verification;
  if (planned === null) throw new Error("fixture verification did not plan");

  const plan: Plan = {
    version: 1,
    operation: "update",
    root,
    configPath,
    items: [],
    files: [],
    removedBases: [],
    dependencies: [],
    packageManager: "npm",
    installCommand: null,
    theme: null,
    styles: null,
    verification: planned,
    mantine: { state: "not-installed" },
    receipt: {
      present: true,
      ok: true,
      path: receiptPath,
      sha256: sha(receiptRaw),
      raw: receiptRaw,
      receipt,
    },
    stateIgnored: false,
    diagnostics: [],
    ok: true,
  };

  return { root, source, packagePath, plan, verification: planned };
}

function ports(run: (request: VerificationProcessRequest) => Promise<VerificationProcessResult>) {
  return {
    readReceipt: createReceiptReader(),
    validateReceipt: createReceiptValidator(),
    hash: hashFileBytes,
    run,
  };
}

describe("post-apply verification", () => {
  test("matches nypm's optional Corepack execution policy", () => {
    const fixture = verificationFixture(["verify"]);
    const [npm] = fixture.verification.checks;
    if (npm === undefined) throw new Error("fixture check is missing");
    const pnpm = { ...npm, executable: "pnpm" };

    expect(verificationExecutionCommand(npm, true)).toEqual({
      executable: "npm",
      args: ["run", "verify"],
    });
    expect(verificationExecutionCommand(pnpm, false)).toEqual({
      executable: "pnpm",
      args: ["run", "verify"],
    });
    expect(verificationExecutionCommand(pnpm, true)).toEqual({
      executable: "corepack",
      args: ["pnpm", "run", "verify"],
    });
  });

  test("builds local-bin PATH from the verified project root, not the CLI process cwd", () => {
    const fixture = verificationFixture(["verify"]);
    const env = verificationEnvironment(fixture.root, { PATH: "/global/bin" });
    const entries = env.PATH?.split(delimiter) ?? [];

    expect(entries[0]).toBe(join(fixture.root, "node_modules", ".bin"));
    expect(entries).toContain(join(dirname(fixture.root), "node_modules", ".bin"));
    expect(entries).toContain(dirname(process.execPath));
    expect(entries.at(-1)).toBe("/global/bin");
  });

  test("preflight rejects any whole-package.json change before apply", () => {
    const fixture = verificationFixture(["verify"]);
    write(fixture.packagePath, '{"scripts":{"verify":"node verify.mjs"},"new":true}\n');

    const failure = preflight(fixture.plan);

    expect(failure?.kind).toBe("stale-plan");
    expect(failure?.paths).toContain(fixture.packagePath);
  });

  test("runs checks in order and reports distinct passed results", async () => {
    const fixture = verificationFixture(["first", "second"]);
    const called: string[] = [];

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async ({ check }) => {
        called.push(check.script);
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
    );

    expect(called).toEqual(["first", "second"]);
    expect(outcome.status).toBe("passed");
    expect(outcome.checks.map((check) => check.result)).toEqual(["passed", "passed"]);
    expect(outcome.failure).toBeNull();
  });

  test("fails fast and retains later checks as not-run", async () => {
    const fixture = verificationFixture(["first", "second"]);
    const called: string[] = [];

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async ({ check }) => {
        called.push(check.script);
        return { started: true, exitCode: 7, signal: null, timedOut: false };
      }),
    );

    expect(called).toEqual(["first"]);
    expect(outcome.status).toBe("failed");
    expect(outcome.checks.map((check) => check.result)).toEqual(["failed", "not-run"]);
    expect(outcome.failure).toMatchObject({
      kind: "script-failed",
      script: "first",
      exitCode: 7,
      signal: null,
    });
  });

  test("reports a process that cannot start as spawn-failed", async () => {
    const fixture = verificationFixture(["verify"]);

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async () => ({ started: false, message: "command not found" })),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.checks[0]?.result).toBe("failed");
    expect(outcome.failure).toMatchObject({ kind: "spawn-failed", script: "verify" });
  });

  test("reports a terminated process with its signal", async () => {
    const fixture = verificationFixture(["verify"]);

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async () => ({ started: true, exitCode: null, signal: "SIGTERM", timedOut: false })),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.checks[0]).toMatchObject({
      result: "failed",
      exitCode: null,
      signal: "SIGTERM",
    });
    expect(outcome.failure).toMatchObject({
      kind: "script-failed",
      script: "verify",
      exitCode: null,
      signal: "SIGTERM",
    });
  });

  test("never executes a script definition changed after apply", async () => {
    const fixture = verificationFixture(["verify"]);
    write(fixture.packagePath, '{"scripts":{"verify":"node replacement-that-must-not-run.mjs"}}\n');
    let calls = 0;

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async () => {
        calls += 1;
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
    );

    expect(calls).toBe(0);
    expect(outcome.status).toBe("failed");
    expect(outcome.checks[0]?.result).toBe("not-run");
    expect(outcome.failure).toMatchObject({ kind: "definition-stale", script: "verify" });
  });

  test("an unreadable post-apply receipt is a managed drift result, not a thrown update error", async () => {
    const fixture = verificationFixture(["verify"]);
    let calls = 0;

    const outcome = await verifyAppliedUpdate(fixture.plan, fixture.verification, {
      ...ports(async () => {
        calls += 1;
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
      readReceipt: () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    });

    expect(calls).toBe(0);
    expect(outcome.status).toBe("failed");
    expect(outcome.checks[0]?.result).toBe("not-run");
    expect(outcome.failure).toMatchObject({
      kind: "managed-byte-drift",
      paths: [fixture.plan.receipt.path],
    });
  });

  test("a zero-exit script that changes a managed file fails as managed-byte-drift", async () => {
    const fixture = verificationFixture(["verify"]);

    const outcome = await verifyAppliedUpdate(
      fixture.plan,
      fixture.verification,
      ports(async () => {
        write(fixture.source, "export const Component = 'rewritten';\n");
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.checks[0]?.result).toBe("failed");
    expect(outcome.failure).toMatchObject({
      kind: "managed-byte-drift",
      paths: [fixture.source],
    });
  });
});

function failedApply(kind: "install-failed" | "write-failed" | "rollback-failed"): ApplyOutcome {
  return {
    ok: false,
    cancelled: false,
    dryRun: false,
    files: [],
    dependencies: { installed: false, command: null },
    theme: null,
    styles: null,
    receipt: { path: "/unused/manteen.lock.json", written: false },
    updateState: { changed: false },
    failure: { kind, message: `${kind} fixture` },
  };
}

function cancelledApply(): ApplyOutcome {
  return {
    ...failedApply("write-failed"),
    cancelled: true,
    failure: null,
  };
}

describe("update verification orchestration", () => {
  test("text distinguishes dry-run planning from fail-fast not-run checks", () => {
    const fixture = verificationFixture(["first", "second"]);
    const checks = fixture.verification.checks.map((check) => ({
      script: check.script,
      command: check.command,
      result: "not-run" as const,
      exitCode: null,
      signal: null,
    }));

    expect(
      renderVerification({ status: "planned", checks, failure: null }, fixture.root),
    ).toContain("planned  verification  npm run second");
    expect(
      renderVerification(
        {
          status: "failed",
          checks: [{ ...checks[0], result: "failed" }, checks[1] as (typeof checks)[number]],
          failure: {
            kind: "script-failed",
            script: "first",
            exitCode: 1,
            signal: null,
            message: "fixture failure",
          },
        },
        fixture.root,
      ),
    ).toContain("not-run  verification  npm run second");
  });

  test.each([
    ["cancellation", cancelledApply()],
    ["dependency failure", failedApply("install-failed")],
    ["write failure", failedApply("write-failed")],
    ["rollback failure", failedApply("rollback-failed")],
  ])("does not invoke verification after %s", async (_label, applyOutcome) => {
    const fixture = verificationFixture(["verify"]);
    const loaded = loadConfig(fixture.root);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    let calls = 0;

    const result = await update(
      loaded.config,
      [],
      { interactive: false },
      {
        plan: async () => fixture.plan,
        apply: async () => applyOutcome,
        read: createReceiptReader(),
        validate: createReceiptValidator(),
        hash: hashFileBytes,
        verification: ports(async () => {
          calls += 1;
          return { started: true, exitCode: 0, signal: null, timedOut: false };
        }),
      },
    );

    expect(calls).toBe(0);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.verification).toEqual({ status: "skipped", checks: [], failure: null });
  });
});
