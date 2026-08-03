import { Button } from "@mantine/core";
import { PageHeader } from "@/components/ui/page-header";

export function ProjectSettingsHeader() {
  return (
    <PageHeader
      title="Project settings"
      description="Manage members, billing, and integrations for this project."
      actions={
        <Button variant="default" onClick={() => console.log("invite clicked")}>
          Invite member
        </Button>
      }
    />
  );
}
