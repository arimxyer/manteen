/**
 * Adapted from Mantine UI's StatsGrid at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Group, Paper, SimpleGrid, Text } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import classes from "./stats-grid.module.css";

export interface StatsGridItem {
  title: string;
  value: ReactNode;
  diff: number;
  icon?: ReactNode;
  comparisonLabel?: string;
}

export interface StatsGridProps {
  items: StatsGridItem[];
}

export function StatsGrid({ items }: StatsGridProps) {
  const desktopColumns = Math.max(1, Math.min(items.length, 4));
  const stats = items.map((stat) => {
    const DiffIcon = stat.diff >= 0 ? IconArrowUpRight : IconArrowDownRight;

    return (
      <Paper withBorder p="md" radius="md" key={stat.title}>
        <Group justify="space-between">
          <Text size="xs" className={classes.title}>
            {stat.title}
          </Text>
          {stat.icon && <span className={classes.icon}>{stat.icon}</span>}
        </Group>

        <Group align="flex-end" gap="xs" mt={25}>
          <Text className={classes.value}>{stat.value}</Text>
          <Text
            c={
              stat.diff >= 0
                ? "light-dark(var(--mantine-color-teal-9), var(--mantine-color-teal-4))"
                : "light-dark(var(--mantine-color-red-9), var(--mantine-color-red-4))"
            }
            fz="sm"
            fw={500}
            className={classes.diff}
          >
            <span>{stat.diff}%</span>
            <DiffIcon size={16} stroke={1.5} />
          </Text>
        </Group>

        <Text fz="xs" mt={7} className={classes.comparison}>
          {stat.comparisonLabel ?? "Compared to previous period"}
        </Text>
      </Paper>
    );
  });

  return (
    <div className={classes.root}>
      <SimpleGrid cols={{ base: 1, xs: 2, md: desktopColumns }}>{stats}</SimpleGrid>
    </div>
  );
}
