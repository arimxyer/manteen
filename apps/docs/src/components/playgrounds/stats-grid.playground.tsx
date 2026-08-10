import { IconCoin, IconDiscount2, IconReceipt2, IconUserPlus } from "@tabler/icons-react";

import {
  StatsGrid,
  type StatsGridItem,
} from "../../../../../registry/mantine-ui/stats-grid/stats-grid";
import type { PlaygroundAdapter } from "./contract";

const OTHER_ITEMS: StatsGridItem[] = [
  {
    title: "New customers",
    value: "1,204",
    diff: 8,
    icon: <IconUserPlus size={22} stroke={1.5} />,
  },
  {
    title: "Discount volume",
    value: "$3,120",
    diff: -4,
    icon: <IconDiscount2 size={22} stroke={1.5} />,
    comparisonLabel: "Compared to last quarter",
  },
  {
    title: "Refunds",
    value: "312",
    diff: -2,
    icon: <IconReceipt2 size={22} stroke={1.5} />,
  },
];

function buildItems(
  revenueValue: string,
  revenueDiff: number,
  showIcons: boolean,
  columns: number,
) {
  const items: StatsGridItem[] = [
    {
      title: "Revenue",
      value: revenueValue || "$0",
      diff: revenueDiff,
      icon: showIcons ? <IconCoin size={22} stroke={1.5} /> : undefined,
    },
    ...OTHER_ITEMS.map((item) => ({ ...item, icon: showIcons ? item.icon : undefined })),
  ];

  return items.slice(0, columns);
}

const adapter: PlaygroundAdapter = {
  item: "stats-grid",
  defaultProps: {
    revenueValue: "$48,392",
    revenueDiff: "12",
    showIcons: true,
    columns: "4",
  },
  controls: [
    {
      kind: "text",
      prop: "revenueValue",
      label: "Revenue value",
      compact: true,
    },
    {
      kind: "text",
      prop: "revenueDiff",
      label: "Revenue diff %",
      inputMode: "decimal",
      maxLength: 4,
      compact: true,
    },
    { kind: "switch", prop: "showIcons", label: "Icons" },
    {
      kind: "select",
      prop: "columns",
      label: "Columns",
      options: [
        { label: "3 stats", value: "3" },
        { label: "4 stats", value: "4" },
      ],
    },
  ],
  // StatsGrid has no callback props (it is a read-only display component), so there is
  // nothing to wire recordEvent into.
  render: (props) => (
    <StatsGrid
      items={buildItems(
        String(props.revenueValue),
        Number(props.revenueDiff) || 0,
        Boolean(props.showIcons),
        Number(props.columns) || 4,
      )}
    />
  ),
  renderJsx: (props) => {
    const revenueValue = String(props.revenueValue);
    const revenueDiff = Number(props.revenueDiff) || 0;
    const showIcons = Boolean(props.showIcons);
    const columns = Number(props.columns) || 4;

    const items = [
      {
        title: "Revenue",
        value: revenueValue,
        diff: revenueDiff,
        icon: showIcons ? "<IconCoin size={22} stroke={1.5} />" : undefined,
      },
      {
        title: "New customers",
        value: "1,204",
        diff: 8,
        icon: showIcons ? "<IconUserPlus size={22} stroke={1.5} />" : undefined,
      },
      {
        title: "Discount volume",
        value: "$3,120",
        diff: -4,
        icon: showIcons ? "<IconDiscount2 size={22} stroke={1.5} />" : undefined,
        comparisonLabel: "Compared to last quarter",
      },
      {
        title: "Refunds",
        value: "312",
        diff: -2,
        icon: showIcons ? "<IconReceipt2 size={22} stroke={1.5} />" : undefined,
      },
    ].slice(0, columns);

    const itemsSource = items
      .map((item) => {
        const fields = [
          `title: ${JSON.stringify(item.title)}`,
          `value: ${JSON.stringify(item.value)}`,
          `diff: ${item.diff}`,
        ];
        if (item.icon) fields.push(`icon: ${item.icon}`);
        if (item.comparisonLabel)
          fields.push(`comparisonLabel: ${JSON.stringify(item.comparisonLabel)}`);
        return `    {\n      ${fields.join(",\n      ")},\n    }`;
      })
      .join(",\n");

    const iconImports = showIcons
      ? 'import { IconCoin, IconDiscount2, IconReceipt2, IconUserPlus } from "@tabler/icons-react";\n'
      : "";

    return `${iconImports}import { StatsGrid } from "@/components/ui/stats-grid";

<StatsGrid
  items={[
${itemsSource},
  ]}
/>`;
  },
  stage: {
    desktopWidth: "100%",
  },
};

export default adapter;
