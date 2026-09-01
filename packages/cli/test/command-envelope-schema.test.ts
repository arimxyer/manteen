import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../schema/command-envelope.schema.json"), "utf8"),
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    command: "status",
    root: "/project",
    ok: true,
    exitCode: 0,
    mutated: false,
    payload: { healthy: false },
    diagnostics: [],
    errors: [],
    notes: [],
    actions: [],
    ...overrides,
  };
}

describe("published command envelope schema", () => {
  test("accepts the exact success envelope and enforces ok/exitCode equivalence", () => {
    expect(validate(envelope())).toBe(true);
    expect(validate(envelope({ ok: true, exitCode: 1 }))).toBe(false);
    expect(validate(envelope({ ok: false, exitCode: 0 }))).toBe(false);
  });

  test("requires typed remediation or rationale on every blocking fact", () => {
    expect(
      validate(
        envelope({
          ok: false,
          exitCode: 1,
          diagnostics: [
            {
              code: "plan-mismatch",
              severity: "error",
              message: "review a fresh plan",
              forceable: false,
              actions: [{ kind: "rerun", argv: ["manteen", "add", "--dry-run", "--json"] }],
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      validate(
        envelope({
          ok: false,
          exitCode: 1,
          diagnostics: [
            {
              code: "plan-mismatch",
              severity: "error",
              message: "review a fresh plan",
              forceable: false,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  test("refuses extra top-level fields so the eleven-key boundary cannot drift", () => {
    expect(validate(envelope({ extra: true }))).toBe(false);
  });

  test("requires every non-usage update result to retain kind and dry-run mode", () => {
    const updateFailure = envelope({
      command: "update",
      ok: false,
      exitCode: 1,
      payload: { kind: "failed", dryRun: true },
    });
    expect(validate(updateFailure)).toBe(true);
    expect(validate({ ...updateFailure, payload: null })).toBe(false);
    expect(validate({ ...updateFailure, payload: { kind: "failed" } })).toBe(false);
    expect(validate({ ...updateFailure, ok: false, exitCode: 2, payload: null })).toBe(true);
  });
});
