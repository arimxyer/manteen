import { SimpleGrid } from "@mantine/core";
import { IconCoin, IconUsers } from "@tabler/icons-react";
import { StatCard } from "@/components/ui/stat-card";

export function RevenueOverview() {
  return (
    <SimpleGrid cols={2}>
      <StatCard label="Revenue" value="$48,200" diff={12.4} icon={<IconCoin size={20} />} />
      <StatCard label="Active users" value="3,128" diff={-4.1} icon={<IconUsers size={20} />} />
    </SimpleGrid>
  );
}
