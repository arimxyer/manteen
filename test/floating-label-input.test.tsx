import { describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";

import { FloatingLabelInput } from "../registry/mantine-ui/floating-label-input/floating-label-input";

function render(node: React.ReactElement) {
  return renderToStaticMarkup(<MantineProvider>{node}</MantineProvider>);
}

// `floating` (and therefore `data-floating`) is computed off whichever value
// is live — no focus event is needed for these assertions since a non-empty
// value alone satisfies `currentValue.trim().length !== 0`. Focus-only
// floating (an empty, focused field) requires a real focus event and is out
// of reach for a static-markup render; it's not pinned here.
describe("FloatingLabelInput controlled/uncontrolled value", () => {
  test("resting state (no value) renders no data-floating attribute", () => {
    const html = render(<FloatingLabelInput />);
    expect(html).not.toContain("data-floating");
  });

  test("controlled value floats the label and sets the input value", () => {
    const html = render(
      <FloatingLabelInput value="hello@example.com" onChange={() => undefined} />,
    );
    expect(html).toContain('value="hello@example.com"');
    expect(html).toContain('data-floating="true"');
  });

  test("controlled value of only whitespace does not float", () => {
    const html = render(<FloatingLabelInput value="   " onChange={() => undefined} />);
    expect(html).not.toContain("data-floating");
  });

  test("uncontrolled defaultValue floats the label the same way controlled value does", () => {
    const html = render(<FloatingLabelInput defaultValue="hello@example.com" />);
    expect(html).toContain('value="hello@example.com"');
    expect(html).toContain('data-floating="true"');
  });

  test("defaultValue is ignored once a controlled value is provided", () => {
    const html = render(
      <FloatingLabelInput
        value="controlled"
        defaultValue="uncontrolled"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('value="controlled"');
    expect(html).not.toContain("uncontrolled");
  });
});

describe("FloatingLabelInput error composes with the floating label", () => {
  test("a non-empty value plus an error keeps the label floating and shows the error", () => {
    const html = render(
      <FloatingLabelInput value="notanemail" error="Invalid email" onChange={() => undefined} />,
    );

    // Floating and error are disjoint attributes on the same element — both fire.
    expect(html).toContain('data-floating="true"');
    expect(html).toContain('data-error="true"');
    expect(html).toContain("Invalid email");
  });

  test("the default error icon renders alongside the error, not instead of the field", () => {
    const html = render(
      <FloatingLabelInput value="notanemail" error="Invalid email" onChange={() => undefined} />,
    );
    expect(html).toContain("tabler-icon-alert-triangle");
    // The label + input are still present, not replaced by an error-only view.
    expect(html).toContain('value="notanemail"');
  });

  test("errorIcon={null} keeps the invalid styling without rendering an icon", () => {
    const html = render(
      <FloatingLabelInput
        value="notanemail"
        error="Invalid email"
        errorIcon={null}
        onChange={() => undefined}
      />,
    );
    expect(html).not.toContain("tabler-icon-alert-triangle");
    expect(html).toContain('data-error="true"');
    expect(html).toContain("Invalid email");
  });

  test("no error means no error icon and no data-error attribute", () => {
    const html = render(<FloatingLabelInput value="hello" onChange={() => undefined} />);
    expect(html).not.toContain("tabler-icon-alert-triangle");
    expect(html).not.toContain("data-error");
  });
});
