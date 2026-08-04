import { FloatingLabelInput } from "../../../../../registry/mantine-ui/floating-label-input/floating-label-input";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "floating-label-input",
  defaultProps: {
    label: "Email",
    defaultValue: "hello!gmail.com",
    error: "Enter a valid email address",
    required: true,
  },
  controls: [
    { kind: "text", prop: "label", label: "Label" },
    { kind: "switch", prop: "required", label: "Required" },
    { kind: "text", prop: "defaultValue", label: "Value", wide: true },
    { kind: "text", prop: "error", label: "Error message", wide: true },
  ],
  // Uncontrolled: FloatingLabelInput only reads `defaultValue` on mount, so remounting on
  // every "Value" control edit is what makes the control actually re-seed the field — the
  // rendered input still tracks its own keystrokes normally in between edits, same as any
  // uncontrolled consumer usage.
  render: (props, recordEvent) => (
    <FloatingLabelInput
      key={String(props.defaultValue)}
      label={String(props.label) || "Floating label"}
      defaultValue={String(props.defaultValue)}
      required={Boolean(props.required)}
      error={String(props.error) || undefined}
      onChange={(event) => recordEvent(`onChange (${event.currentTarget.value})`)}
      onFocus={() => recordEvent("onFocus")}
      onBlur={() => recordEvent("onBlur")}
    />
  ),
  renderJsx: (props) => {
    const requiredProp = props.required ? "\n  required" : "\n  required={false}";
    const errorText = String(props.error);
    const errorProp = errorText ? `\n  error=${JSON.stringify(errorText)}` : "";

    return `<FloatingLabelInput
  label=${JSON.stringify(props.label)}
  defaultValue=${JSON.stringify(props.defaultValue)}${requiredProp}${errorProp}
  onChange={(event) => console.log(event.currentTarget.value)}
/>`;
  },
  stage: {
    desktopWidth: "min(22rem, 100%)",
    mobileWidth: "min(18rem, 100%)",
  },
};

export default adapter;
