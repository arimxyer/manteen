import { Button, Center, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * The incompatible half of the collision fixture.
 *
 * `@base/empty-state` takes `{ title?: string }` and nothing else. This one
 * REQUIRES `title` and adds `description` and `action`, so neither component can
 * stand in for the other: installing this over @base's breaks every call site
 * that omitted a title, and installing @base's over this one breaks every call
 * site that passed a description or an action.
 *
 * That is the whole argument for D8 — a destination collision between two
 * distinct canonical ids has no correct answer at a prompt, so it refuses
 * instead of asking.
 */
export interface EmptyStateProps {
  title: string;
  description: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={360} ta="center">
        <Title order={4}>{title}</Title>
        <Text c="dimmed" size="sm">
          {description}
        </Text>
        {action && (
          <Button mt="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Center>
  );
}
