import { AutocompleteLoading } from "../../../../../registry/mantine-ui/autocomplete-loading/autocomplete-loading";
import type { PlaygroundAdapter } from "./contract";

const DEBOUNCE_OPTIONS = [
  { label: "Fast (150ms)", value: "150" },
  { label: "Default (1000ms)", value: "1000" },
  { label: "Slow (2500ms)", value: "2500" },
] as const;

const adapter: PlaygroundAdapter = {
  item: "autocomplete-loading",
  defaultProps: {
    label: "Async Autocomplete data",
    placeholder: "Your email",
    // Seeded so the component reads as populated at rest — the loader and the suggestions
    // dropdown are both transient (only reachable by typing: `loading` is internal state set
    // inside `handleChange`, never on mount), so an empty field would render identically to a
    // bare Autocomplete and hide the whole point of this item, including in the build-time,
    // non-interactive catalog mini.
    defaultValue: "ada.lovelace",
    // Lower than the component's own 1000ms default so typing in the stage shows the
    // Loader (and the populated dropdown) without a long wait — the component's built-in
    // demo `loadOptions` (email-domain suggestions, ~300ms fake latency) is left untouched,
    // so this still demonstrates the component with zero required props.
    debounceMs: "150",
  },
  controls: [
    { kind: "text", prop: "label", label: "Label" },
    { kind: "text", prop: "placeholder", label: "Placeholder" },
    { kind: "text", prop: "defaultValue", label: "Value", wide: true },
    { kind: "select", prop: "debounceMs", label: "Debounce", options: DEBOUNCE_OPTIONS },
  ],
  // Uncontrolled: AutocompleteLoading only reads `defaultValue` on mount (hand-rolled
  // `useState(defaultValue)`, not `useUncontrolled`), so remounting on every "Value" control
  // edit is what makes the control actually re-seed the field — same reasoning as the sibling
  // floating-label-input adapter.
  render: (props, recordEvent) => (
    <AutocompleteLoading
      key={String(props.defaultValue)}
      label={String(props.label) || undefined}
      placeholder={String(props.placeholder) || undefined}
      defaultValue={String(props.defaultValue)}
      debounceMs={Number(props.debounceMs)}
      onChange={(value) => recordEvent(`onChange (${value || "empty"})`)}
      onOptionSubmit={(value) => recordEvent(`onOptionSubmit (${value})`)}
      onFocus={() => recordEvent("onFocus")}
      onBlur={() => recordEvent("onBlur")}
    />
  ),
  renderJsx: (props) => {
    const labelText = String(props.label);
    const labelProp = labelText ? `\n  label=${JSON.stringify(labelText)}` : "";
    const placeholderText = String(props.placeholder);
    const placeholderProp = placeholderText
      ? `\n  placeholder=${JSON.stringify(placeholderText)}`
      : "";
    const valueText = String(props.defaultValue);
    const valueProp = valueText ? `\n  defaultValue=${JSON.stringify(valueText)}` : "";

    return `<AutocompleteLoading${labelProp}${placeholderProp}${valueProp}
  debounceMs={${Number(props.debounceMs)}}
  onChange={(value) => console.log(value)}
  onOptionSubmit={(value) => console.log("selected", value)}
/>`;
  },
  stage: {
    desktopWidth: "min(22rem, 100%)",
    mobileWidth: "min(18rem, 100%)",
  },
};

export default adapter;
