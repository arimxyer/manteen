/**
 * D14's guard test — "interactivity is `isTTY && !isCI() && !--yes`, and
 * `CI=true` is a stated invariant. A guard test asserts both directions."
 *
 * The decision claimed this test existed; it did not, and the direction that was
 * missing is the one that hangs. `isInteractive` is the single gate between a CI
 * pipeline and a prompt nobody can answer, and the e2e tier structurally cannot
 * cover it: a `spawnSync` child has no controlling terminal, so `isTTY` is false
 * there and the CI term is never the reason a case passes.
 *
 * The trap this file exists to keep visible, restated because it reads as a
 * typo: `isCI` is an EXACT comparison against the string `"true"`, matching
 * @clack/prompts 1.7. `CI=1` is FALSE — the value GitHub Actions sets is
 * `"true"`, but a hand-rolled harness that exports `CI=1` takes the INTERACTIVE
 * branch, and the only thing standing between it and a hang is that its stdout
 * is usually a pipe. The assertions below pin that as intended behavior rather
 * than an oversight, so that "surely `CI=1` should count too" is a change
 * someone makes on purpose against a red test.
 *
 * Not covered here, deliberately: `interactiveFromProcess`, whose whole body is
 * the ambient read (`process.stdin.isTTY && process.stdout.isTTY`, `process.env`)
 * that this pure predicate exists to keep out of every other module. Faking it
 * means redefining getters on `process`, which tests the fake.
 */
import { describe, expect, test } from "bun:test";

import { isCI, isInteractive } from "../src/ui";

describe("isCI", () => {
  test('only the exact string "true" is CI', () => {
    expect(isCI({ CI: "true" })).toBe(true);
  });

  test("every other truthy spelling is NOT CI — this is the trap, not a bug", () => {
    // If any of these ever flips to `true`, clack and manteen have started
    // disagreeing about what a CI run is, and the prompt gate is no longer the
    // same predicate as the one the prompt library uses internally.
    for (const value of ["1", "yes", "on", "TRUE", "True", ""]) {
      expect(isCI({ CI: value })).toBe(false);
    }
  });

  test("an absent CI variable is not CI", () => {
    expect(isCI({})).toBe(false);
    expect(isCI({ CI: undefined })).toBe(false);
  });
});

describe("isInteractive", () => {
  const base = { isTTY: true, env: {} as Record<string, string | undefined>, yes: false };

  test("a TTY with no CI and no --yes is interactive", () => {
    expect(isInteractive(base)).toBe(true);
  });

  test("CI=true suppresses interactivity", () => {
    expect(isInteractive({ ...base, env: { CI: "true" } })).toBe(false);
  });

  test("CI=1 does NOT suppress interactivity — D14's stated invariant", () => {
    // The direction that hangs. A TTY-attached run with `CI=1` prompts, which is
    // exactly why D14 requires `CI=true` rather than "any truthy CI".
    expect(isInteractive({ ...base, env: { CI: "1" } })).toBe(true);
  });

  test("--yes suppresses interactivity on its own", () => {
    expect(isInteractive({ ...base, yes: true })).toBe(false);
  });

  test("no TTY suppresses interactivity on its own", () => {
    expect(isInteractive({ ...base, isTTY: false })).toBe(false);
  });

  test("every suppressing term wins over a TTY, in every combination", () => {
    for (const isTTY of [true, false]) {
      for (const ci of ["true", "1", undefined]) {
        for (const yes of [true, false]) {
          const expected = isTTY && ci !== "true" && !yes;
          expect(isInteractive({ isTTY, env: { CI: ci }, yes })).toBe(expected);
        }
      }
    }
  });
});
