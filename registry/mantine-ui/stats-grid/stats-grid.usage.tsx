import { IconCoin, IconDiscount2, IconReceipt2, IconUserPlus } from "@tabler/icons-react";
import { StatsGrid } from "@ui/stats-grid";

export function QuarterlyStats() {
  return (
    <StatsGrid
      items={[
        {
          title: "Revenue",
          value: "$48,392",
          diff: 12,
          icon: <IconCoin size={22} stroke={1.5} />,
        },
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
      ]}
    />
  );
}
