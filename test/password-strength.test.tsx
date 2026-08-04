import { describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordStrength } from "../registry/mantine-ui/password-strength/password-strength";

function render(node: React.ReactElement) {
  return renderToStaticMarkup(<MantineProvider>{node}</MantineProvider>);
}

// Ports getPasswordStrength's formula for the assertions below: with the
// default 4 requirements, multiplier = (length < minLength ? 1 : 0) + count
// of unmet requirements; strength = max(100 - 20 * multiplier, 0). Verified
// against the source rather than re-derived independently, so these counts
// pin the *rendered* output, not a re-implementation of the logic.
describe("PasswordStrength strength calculation", () => {
  test("empty value is Weak with every requirement unmet", () => {
    const html = render(<PasswordStrength value="" onChange={() => undefined} />);

    expect(html).toContain("Password strength: Weak");
    // Length row + 4 default requirements, all unmet -> 5 x icons, 0 checks.
    expect((html.match(/tabler-icon-x/g) ?? []).length).toBe(5);
    expect(html).not.toContain("tabler-icon-check");
  });

  test("a value meeting length + 2 of 4 requirements is Fair", () => {
    // len 8 >= 6 (met), lowercase + digit met, uppercase + symbol unmet.
    const html = render(<PasswordStrength value="abcdefg1" onChange={() => undefined} />);

    expect(html).toContain("Password strength: Fair");
    expect((html.match(/tabler-icon-check/g) ?? []).length).toBe(3); // length + lowercase + digit
    expect((html.match(/tabler-icon-x/g) ?? []).length).toBe(2); // uppercase + symbol
  });

  test("a value meeting length + all 4 requirements is Strong", () => {
    const html = render(<PasswordStrength value="Abcdefg1!" onChange={() => undefined} />);

    expect(html).toContain("Password strength: Strong");
    expect((html.match(/tabler-icon-check/g) ?? []).length).toBe(5);
    expect(html).not.toContain("tabler-icon-x");
  });

  test("exactly 80 (one unmet requirement) reads Fair, not Strong", () => {
    // len 8 >= 6, lower+upper+digit met, symbol unmet -> multiplier 1 -> strength 80.
    // `strength > 80` must be a strict inequality for this to read Fair.
    const html = render(<PasswordStrength value="Abcdefg1" onChange={() => undefined} />);

    expect(html).toContain("Password strength: Fair");
  });
});

describe("PasswordStrength requirement checks", () => {
  test("minLength drives both the length requirement's pass/fail and its label", () => {
    const short = render(
      <PasswordStrength value="Abcdefg1!" minLength={20} onChange={() => undefined} />,
    );
    expect(short).toContain("Has at least 20 characters");
    // Length now unmet (1 x) even though all 4 regex requirements are met (4 checks).
    expect((short.match(/tabler-icon-x/g) ?? []).length).toBe(1);
    expect((short.match(/tabler-icon-check/g) ?? []).length).toBe(4);
  });

  test("minLength of 1 singularizes the requirement label", () => {
    const html = render(<PasswordStrength value="a" minLength={1} onChange={() => undefined} />);
    expect(html).toContain("Has at least 1 character");
    expect(html).not.toContain("Has at least 1 characters");
  });

  test("a custom requirements list replaces the defaults entirely", () => {
    const html = render(
      <PasswordStrength
        value="hunter2"
        requirements={[{ re: /^hunter2$/, label: "Is literally hunter2" }]}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Is literally hunter2");
    expect(html).not.toContain("Includes number");
    expect(html).not.toContain("Includes uppercase letter");
  });
});

describe("PasswordStrength controlled/uncontrolled value", () => {
  test("uncontrolled defaultValue seeds the initial strength", () => {
    const html = render(<PasswordStrength defaultValue="Abcdefg1!" />);
    expect(html).toContain("Password strength: Strong");
  });

  test("uncontrolled with no defaultValue starts empty and Weak", () => {
    const html = render(<PasswordStrength />);
    expect(html).toContain("Password strength: Weak");
    expect((html.match(/tabler-icon-x/g) ?? []).length).toBe(5);
  });
});
