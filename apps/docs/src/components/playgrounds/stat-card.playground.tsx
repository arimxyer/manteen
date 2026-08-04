import { IconCoin } from "@tabler/icons-react";
import { StatCard } from "../../../../../registry/ui/stat-card";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "stat-card",
  defaultProps: {
    label: "Revenue",
    value: "$48,200",
    diff: "12.4",
    icon: true,
  },
  controls: [
    { kind: "text", prop: "label", label: "Label", wide: true },
    { kind: "text", prop: "value", label: "Value", compact: true },
    {
      kind: "text",
      prop: "diff",
      label: "Diff %",
      inputMode: "decimal",
      maxLength: 6,
      compact: true,
    },
    { kind: "switch", prop: "icon", label: "Icon" },
  ],
  render: (props) => {
    const diffText = String(props.diff).trim();
    const diff = diffText === "" ? undefined : Number(diffText);

    return (
      <StatCard
        label={String(props.label) || "Label"}
        value={String(props.value) || "0"}
        diff={diff !== undefined && Number.isNaN(diff) ? undefined : diff}
        icon={props.icon ? <IconCoin size={20} /> : undefined}
      />
    );
  },
  renderJsx: (props) => {
    const diffText = String(props.diff).trim();
    const diff = diffText === "" ? undefined : Number(diffText);
    const diffProp = diff !== undefined && !Number.isNaN(diff) ? `\n  diff={${diffText}}` : "";
    const iconProp = props.icon ? "\n  icon={<IconCoin size={20} />}" : "";

    return `<StatCard
  label=${JSON.stringify(props.label)}
  value=${JSON.stringify(props.value)}${diffProp}${iconProp}
/>`;
  },
  stage: {
    desktopWidth: "min(20rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
  },
};

export default adapter;
