import type { ReactNode } from "react";
import { Group, Paper, Text, ThemeIcon } from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Percentage change vs. the previous period. Omit to hide the trend row. */
  diff?: number;
  icon?: ReactNode;
}

export function StatCard({ label, value, diff, icon }: StatCardProps) {
  const positive = (diff ?? 0) >= 0;

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fz={28} fw={700} lh={1.2} mt={4}>
            {value}
          </Text>
        </div>
        {icon && (
          <ThemeIcon variant="light" size={38} radius="md">
            {icon}
          </ThemeIcon>
        )}
      </Group>

      {diff !== undefined && (
        <Group gap={4} mt="xs">
          <ThemeIcon variant="transparent" size="sm" c={positive ? "teal" : "red"}>
            {positive ? <IconTrendingUp size={16} /> : <IconTrendingDown size={16} />}
          </ThemeIcon>
          <Text size="sm" c={positive ? "teal" : "red"} fw={500}>
            {positive ? "+" : ""}
            {diff}%
          </Text>
          <Text size="sm" c="dimmed">
            vs last period
          </Text>
        </Group>
      )}
    </Paper>
  );
}
