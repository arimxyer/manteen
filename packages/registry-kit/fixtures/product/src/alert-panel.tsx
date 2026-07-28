import { Stack } from "@mantine/core";

import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";

export interface AlertPanelProps {
  alerts: { id: string; message: string }[];
}

/** Composes one item from @kit and one from @house. */
export function AlertPanel({ alerts }: AlertPanelProps) {
  if (!alerts.length) {
    return <EmptyState title="All clear" description="No active alerts." />;
  }

  return (
    <Stack gap="xs">
      {alerts.map((alert) => (
        <Callout key={alert.id}>{alert.message}</Callout>
      ))}
    </Stack>
  );
}
