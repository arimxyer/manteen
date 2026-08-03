import { IconInbox, IconMoodEmpty, IconSearchOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { EmptyState } from "../../../../../registry/ui/empty-state";
import type { PlaygroundAdapter } from "./contract";

const ICON_INBOX = "inbox";
const ICON_SEARCH = "search";
const ICON_MOOD = "mood";

const ICON_MAP: Record<string, { node: ReactNode; component: string }> = {
  [ICON_INBOX]: { node: <IconInbox size={24} />, component: "IconInbox" },
  [ICON_SEARCH]: { node: <IconSearchOff size={24} />, component: "IconSearchOff" },
  [ICON_MOOD]: { node: <IconMoodEmpty size={24} />, component: "IconMoodEmpty" },
};

const adapter: PlaygroundAdapter = {
  item: "empty-state",
  defaultProps: {
    title: "No messages yet",
    description: "When someone sends you a message, it will show up here.",
    showAction: true,
    icon: ICON_INBOX,
  },
  controls: [
    { kind: "text", prop: "title", label: "Title", wide: true },
    { kind: "text", prop: "description", label: "Description", wide: true },
    {
      kind: "select",
      prop: "icon",
      label: "Icon",
      options: [
        { label: "Inbox", value: ICON_INBOX },
        { label: "Search off", value: ICON_SEARCH },
        { label: "Mood empty", value: ICON_MOOD },
      ],
    },
    { kind: "switch", prop: "showAction", label: "Action" },
  ],
  render: (props, recordEvent) => (
    <EmptyState
      title={String(props.title) || undefined}
      description={String(props.description) || undefined}
      icon={(ICON_MAP[String(props.icon)] ?? ICON_MAP[ICON_INBOX]).node}
      action={
        props.showAction
          ? {
              label: "Compose message",
              onClick: () => recordEvent("onClick"),
            }
          : undefined
      }
    />
  ),
  renderJsx: (props) => {
    const iconEntry = ICON_MAP[String(props.icon)] ?? ICON_MAP[ICON_INBOX];
    const actionProp = props.showAction
      ? `\n  action={{ label: "Compose message", onClick: () => {} }}`
      : "";

    return `<EmptyState
  title=${JSON.stringify(props.title)}
  description=${JSON.stringify(props.description)}
  icon={<${iconEntry.component} size={24} />}${actionProp}
/>`;
  },
  stage: {
    desktopWidth: "min(28rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
  },
};

export default adapter;
