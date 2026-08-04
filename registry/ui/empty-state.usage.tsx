import { EmptyState } from "@/components/ui/empty-state";

export function EmptyInbox() {
  return (
    <EmptyState
      title="No messages yet"
      description="When someone sends you a message, it will show up here."
      action={{
        label: "Compose message",
        onClick: () => console.log("compose"),
      }}
    />
  );
}
