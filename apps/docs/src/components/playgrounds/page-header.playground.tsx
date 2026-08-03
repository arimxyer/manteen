import { Button } from "@mantine/core";
import { PageHeader } from "../../../../../registry/ui/page-header";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "page-header",
  defaultProps: {
    title: "Project settings",
    description: "Manage members, billing, and integrations for this project.",
    withDivider: true,
    actions: true,
  },
  controls: [
    { kind: "text", prop: "title", label: "Title" },
    { kind: "text", prop: "description", label: "Description" },
    { kind: "switch", prop: "actions", label: "Actions" },
    { kind: "switch", prop: "withDivider", label: "Divider" },
  ],
  render: (props, recordEvent) => (
    <PageHeader
      title={String(props.title) || "Untitled page"}
      description={String(props.description) || undefined}
      withDivider={Boolean(props.withDivider)}
      actions={
        props.actions ? (
          <Button variant="default" onClick={() => recordEvent("actions.onClick")}>
            Invite member
          </Button>
        ) : undefined
      }
    />
  ),
  renderJsx: (props) => {
    const actionsProp = props.actions
      ? `\n  actions={
    <Button variant="default" onClick={() => {}}>
      Invite member
    </Button>
  }`
      : "";

    return `<PageHeader
  title=${JSON.stringify(props.title)}
  description=${JSON.stringify(props.description)}
  withDivider={${Boolean(props.withDivider)}}${actionsProp}
/>`;
  },
  stage: {
    desktopWidth: "min(38rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
  },
};

export default adapter;
