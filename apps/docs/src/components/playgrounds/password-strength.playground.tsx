import { PasswordStrength } from "../../../../../registry/mantine-ui/password-strength/password-strength";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "password-strength",
  defaultProps: {
    sampleValue: "Sample123",
    label: "Password",
    minLength: "6",
    required: true,
  },
  controls: [
    { kind: "text", prop: "sampleValue", label: "Sample password", wide: true },
    { kind: "text", prop: "label", label: "Label", compact: true },
    {
      kind: "text",
      prop: "minLength",
      label: "Min length",
      inputMode: "numeric",
      maxLength: 2,
      compact: true,
    },
    { kind: "switch", prop: "required", label: "Required" },
  ],
  // `key` forces a remount when the seeded sample password changes: PasswordStrength is
  // uncontrolled here (defaultValue + onChange, via useUncontrolled), so defaultValue is
  // only read on mount — without the key, editing "Sample password" would silently no-op
  // against the field's already-live internal state.
  render: (props, recordEvent) => (
    <PasswordStrength
      key={String(props.sampleValue)}
      defaultValue={String(props.sampleValue)}
      label={String(props.label) || "Password"}
      minLength={Number(props.minLength) || 6}
      required={Boolean(props.required)}
      onChange={(value) => recordEvent(`onChange (${value.length} chars)`)}
    />
  ),
  renderJsx: (props) => `<PasswordStrength
  defaultValue=${JSON.stringify(props.sampleValue)}
  label=${JSON.stringify(props.label)}
  minLength={${Number(props.minLength) || 6}}
  required={${Boolean(props.required)}}
  onChange={(value) => console.log(value)}
/>`,
  stage: {
    desktopWidth: "min(24rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
    minHeight: "28rem",
  },
};

export default adapter;
