import { describe, expect, test } from "bun:test";

import type { AuthorConformanceInspection } from "../src/author-conformance";
import {
  type AuthorVerificationPorts,
  type AuthorVerificationProcessResult,
  authorVerificationExecutionCommand,
  runAuthorVerification,
} from "../src/author-verification";

function inspection(scripts: string[]): AuthorConformanceInspection {
  return {
    enabled: true,
    profilePath: "manteen.author-profile.json",
    mappings: [],
    failures: [],
    claimCount: 0,
    evidenceCount: 0,
    verification: { scripts, timeoutMs: 1234 },
  };
}

function ports(
  scripts: Record<string, string>,
  run: AuthorVerificationPorts["run"],
): AuthorVerificationPorts {
  return {
    readPackageJson: () => JSON.stringify({ packageManager: "npm@11", scripts }),
    run,
    output: () => {},
  };
}

describe("author verification hooks", () => {
  test("normalizes Windows package-manager shims without a shell-interpreted script name", () => {
    expect(
      authorVerificationExecutionCommand(
        ["npm", "run", "--silent", "verify:author"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd run --silent verify:author"],
    });
    expect(authorVerificationExecutionCommand(["bun", "run", "typecheck"], "win32")).toEqual({
      executable: "bun",
      args: ["run", "typecheck"],
    });
  });

  test("runs declared package scripts in order with a per-check ceiling", () => {
    const requests: Array<{ command: string[]; timeoutMs: number }> = [];
    const outcome = runAuthorVerification(
      "/registry/manteen.registry.json",
      inspection(["lint", "typecheck"]),
      ports({ lint: "eslint .", typecheck: "tsc --noEmit" }, (request) => {
        requests.push({ command: request.command, timeoutMs: request.timeoutMs });
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
    );

    expect(outcome).toMatchObject({
      phase: "post-compile-pre-publish",
      status: "passed",
      checks: [
        { script: "lint", result: "passed" },
        { script: "typecheck", result: "passed" },
      ],
      failure: null,
    });
    expect(requests).toEqual([
      { command: ["npm", "run", "--silent", "lint"], timeoutMs: 1234 },
      { command: ["npm", "run", "--silent", "typecheck"], timeoutMs: 1234 },
    ]);
  });

  test("fails fast and leaves later hooks explicitly not run", () => {
    let calls = 0;
    const results: AuthorVerificationProcessResult[] = [
      { started: true, exitCode: 1, signal: null, timedOut: false },
    ];
    const outcome = runAuthorVerification(
      "/registry/manteen.registry.json",
      inspection(["lint", "typecheck"]),
      ports({ lint: "eslint .", typecheck: "tsc --noEmit" }, () => {
        const result = results[calls];
        calls += 1;
        return result!;
      }),
    );

    expect(calls).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(outcome.failure?.code).toBe("author-verification-script-failed");
    expect(outcome.checks.map((check) => check.result)).toEqual(["failed", "not-run"]);
  });

  test("refuses missing package script definitions without starting a process", () => {
    let calls = 0;
    const outcome = runAuthorVerification(
      "/registry/manteen.registry.json",
      inspection(["lint"]),
      ports({}, () => {
        calls += 1;
        return { started: true, exitCode: 0, signal: null, timedOut: false };
      }),
    );

    expect(calls).toBe(0);
    expect(outcome.failure).toMatchObject({
      code: "author-verification-script-missing",
      script: "lint",
    });
  });

  test("a verifier cannot replace a later package script definition", () => {
    const before = JSON.stringify({
      packageManager: "npm@11",
      scripts: { lint: "eslint .", typecheck: "tsc --noEmit" },
    });
    const after = JSON.stringify({
      packageManager: "npm@11",
      scripts: { lint: "eslint .", typecheck: "node hostile.mjs" },
    });
    let reads = 0;
    let calls = 0;
    const outcome = runAuthorVerification(
      "/registry/manteen.registry.json",
      inspection(["lint", "typecheck"]),
      {
        readPackageJson: () => (reads++ === 0 ? before : after),
        run: () => {
          calls += 1;
          return { started: true, exitCode: 0, signal: null, timedOut: false };
        },
        output: () => {},
      },
    );

    expect(calls).toBe(1);
    expect(outcome.failure?.code).toBe("author-verification-package-drift");
    expect(outcome.checks.map((check) => check.result)).toEqual(["failed", "not-run"]);
  });
});
