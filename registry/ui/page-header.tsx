import type { ReactNode } from "react";
import { Divider, Group, Stack, Text, Title } from "@mantine/core";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  withDivider?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  withDivider = true,
}: PageHeaderProps) {
  return (
    <Stack gap="sm" mb="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Title order={2}>{title}</Title>
          {description && (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          )}
        </Stack>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
      {withDivider && <Divider />}
    </Stack>
  );
}
