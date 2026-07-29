import { Button, Center, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconInbox } from "@tabler/icons-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={360} ta="center">
        <ThemeIcon variant="light" size={48} radius="xl">
          {icon ?? <IconInbox size={24} />}
        </ThemeIcon>
        <Title order={4}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
        {action && (
          <Button mt="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Center>
  );
}
