import { Center, Text } from "@mantine/core";

export function EmptyState({ title = "Nothing here" }: { title?: string }) {
  return (
    <Center py="xl">
      <Text c="dimmed">{title}</Text>
    </Center>
  );
}
