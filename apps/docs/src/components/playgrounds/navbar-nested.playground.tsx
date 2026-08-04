import { IconCalendarStats, IconGauge, IconLock, IconNotes } from "@tabler/icons-react";
import {
  NavbarNested,
  type NavbarNestedLinkItem,
} from "../../../../../registry/mantine-ui/navbar-nested/navbar-nested";
import type { PlaygroundAdapter } from "./contract";

const AVATAR_URL =
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80";

// Static: the nested links themselves aren't control-editable (a control can only hold a
// string/number/boolean), so the link tree is a fixed, realistic demo dataset. Every link
// points at "#" — real hrefs would navigate the docs page away from the stage.
const LINKS: NavbarNestedLinkItem[] = [
  { label: "Dashboard", icon: IconGauge, link: "#" },
  {
    label: "Market news",
    icon: IconNotes,
    initiallyOpened: true,
    links: [
      { label: "Overview", link: "#" },
      { label: "Forecasts", link: "#" },
      { label: "Outlook", link: "#" },
    ],
  },
  {
    label: "Security",
    icon: IconLock,
    links: [
      { label: "Enable 2FA", link: "#" },
      { label: "Change password", link: "#" },
    ],
  },
  { label: "Releases", icon: IconCalendarStats, link: "#" },
];

const adapter: PlaygroundAdapter = {
  item: "navbar-nested",
  defaultProps: {
    userName: "Jordan Vance",
    userEmail: "jordan@example.com",
    versionLabel: "v1.4.0",
    avatar: true,
  },
  controls: [
    { kind: "text", prop: "userName", label: "User name" },
    { kind: "text", prop: "userEmail", label: "Email" },
    { kind: "text", prop: "versionLabel", label: "Version", compact: true },
    { kind: "switch", prop: "avatar", label: "Avatar photo" },
  ],
  // NavbarNested has no callback props of its own (its links are anchors, not click
  // handlers), so there's nothing to wire recordEvent into — omitted like stat-card.
  render: (props) => (
    <NavbarNested
      links={LINKS}
      versionLabel={String(props.versionLabel) || undefined}
      user={{
        name: String(props.userName) || "Unnamed user",
        email: String(props.userEmail) || "unknown@example.com",
        avatar: props.avatar ? AVATAR_URL : undefined,
      }}
    />
  ),
  renderJsx: (props) => {
    // L-1 — these fragments are spliced into the template below at the indent of their
    // sibling line, not the indent of the line they're appended to: `versionLabel` is a
    // sibling prop of `user={{` (8sp), and `avatar:` is a sibling field of `name:`/`email:`
    // (10sp) — not of the shorter line each is concatenated onto.
    const versionProp = props.versionLabel
      ? `\n        versionLabel=${JSON.stringify(props.versionLabel)}`
      : "";
    const avatarProp = props.avatar ? `,\n          avatar: ${JSON.stringify(AVATAR_URL)}` : "";

    return `import { IconCalendarStats, IconGauge, IconLock, IconNotes } from "@tabler/icons-react";
import { NavbarNested } from "@ui/navbar-nested";

export function AppSidebar() {
  return (
    <div style={{ height: "100vh" }}>
      <NavbarNested${versionProp}
        user={{
          name: ${JSON.stringify(props.userName)},
          email: ${JSON.stringify(props.userEmail)}${avatarProp}
        }}
        links={[
          { label: "Dashboard", icon: IconGauge, link: "/dashboard" },
          {
            label: "Market news",
            icon: IconNotes,
            initiallyOpened: true,
            links: [
              { label: "Overview", link: "/news/overview" },
              { label: "Forecasts", link: "/news/forecasts" },
              { label: "Outlook", link: "/news/outlook" },
            ],
          },
          {
            label: "Security",
            icon: IconLock,
            links: [
              { label: "Enable 2FA", link: "/security/2fa" },
              { label: "Change password", link: "/security/password" },
            ],
          },
          { label: "Releases", icon: IconCalendarStats, link: "/releases" },
        ]}
      />
    </div>
  );
}`;
  },
  stage: {
    desktopWidth: "min(19rem, 100%)",
    mobileWidth: "min(19rem, 100%)",
    minHeight: "30rem",
  },
};

export default adapter;
