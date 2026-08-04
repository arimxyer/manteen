import { Text } from "@mantine/core";
import {
  IconBook,
  IconChartPie3,
  IconCode,
  IconCoin,
  IconFingerprint,
  IconNotification,
} from "@tabler/icons-react";

import {
  HeaderMegaMenu,
  type HeaderMegaMenuLink,
} from "../../../../../registry/mantine-ui/header-mega-menu/header-mega-menu";
import type { PlaygroundAdapter } from "./contract";

// HeaderMegaMenu's desktop nav / burger split is driven by Mantine's `visibleFrom` /
// `hiddenFrom`, which watch the real browser viewport via `matchMedia` — not any prop, and
// not container width — so the shell's mobile toggle (which only narrows the stage slot)
// never reaches it. This conditionally mounted `<style>` tag forces Mantine's own stable
// `mantine-visible-from-sm` / `mantine-hidden-from-sm` classes (see MantineClasses.tsx) to
// behave as if the viewport were narrow, matching their own `!important`, only while the
// simulated viewport is "mobile". A document-global rule remains the simplest stable
// mechanism even though the shell now redirects portals (Drawer included) into the stage's
// portal host, so an ancestor-scoped override could technically reach them these days.
const FORCE_MOBILE_CSS = `
  .mantine-visible-from-sm { display: none !important; }
  .mantine-hidden-from-sm { display: block !important; }
`;

const FEATURE_LINKS: HeaderMegaMenuLink["features"] = [
  {
    icon: <IconCode size={22} color="var(--mantine-color-blue-6)" />,
    title: "Open source",
    description: "The full source is on GitHub, under the MIT license",
  },
  {
    icon: <IconCoin size={22} color="var(--mantine-color-blue-6)" />,
    title: "Free for everyone",
    description: "No paid tier gates any core feature",
  },
  {
    icon: <IconBook size={22} color="var(--mantine-color-blue-6)" />,
    title: "Documentation",
    description: "Guides and API references for every component",
  },
  {
    icon: <IconFingerprint size={22} color="var(--mantine-color-blue-6)" />,
    title: "Security",
    description: "SOC 2 Type II audited, with SSO on every plan",
  },
  {
    icon: <IconChartPie3 size={22} color="var(--mantine-color-blue-6)" />,
    title: "Analytics",
    description: "Usage dashboards and exportable reports",
  },
  {
    icon: <IconNotification size={22} color="var(--mantine-color-blue-6)" />,
    title: "Notifications",
    description: "Email and webhook alerts for every event",
  },
];

const LINKS: HeaderMegaMenuLink[] = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features", features: FEATURE_LINKS },
  { label: "Learn", href: "/learn" },
  { label: "Academy", href: "/academy" },
];

const adapter: PlaygroundAdapter = {
  item: "header-mega-menu",
  defaultProps: {
    brandName: "Acme",
    footerHeading: "Get started",
    loginLabel: "Log in",
    showViewAll: true,
  },
  controls: [
    { kind: "text", prop: "brandName", label: "Brand name", compact: true },
    { kind: "text", prop: "loginLabel", label: "Login label", compact: true },
    { kind: "text", prop: "footerHeading", label: "Footer heading", wide: true },
    { kind: "switch", prop: "showViewAll", label: "View all link" },
  ],
  render: (props, recordEvent, context) => (
    <>
      {context.viewport === "mobile" && <style>{FORCE_MOBILE_CSS}</style>}
      <HeaderMegaMenu
        logo={
          <Text fw={700} size="lg">
            {String(props.brandName) || "Acme"}
          </Text>
        }
        links={LINKS}
        featuresViewAllHref={props.showViewAll ? "/features" : undefined}
        featuresFooterHeading={String(props.footerHeading) || "Get started"}
        loginLabel={String(props.loginLabel) || "Log in"}
        onLogin={() => recordEvent("onLogin")}
        onSignUp={() => recordEvent("onSignUp")}
      />
    </>
  ),
  renderJsx: (props) => {
    const viewAllProp = props.showViewAll ? '\n      featuresViewAllHref="/features"' : "";

    return `import { Text } from "@mantine/core";
import {
  IconBook,
  IconChartPie3,
  IconCode,
  IconCoin,
  IconFingerprint,
  IconNotification,
} from "@tabler/icons-react";
import { HeaderMegaMenu, type HeaderMegaMenuLink } from "@ui/header-mega-menu";

const links: HeaderMegaMenuLink[] = [
  { label: "Home", href: "/" },
  {
    label: "Features",
    href: "/features",
    features: [
      {
        icon: <IconCode size={22} color="var(--mantine-color-blue-6)" />,
        title: "Open source",
        description: "The full source is on GitHub, under the MIT license",
      },
      {
        icon: <IconCoin size={22} color="var(--mantine-color-blue-6)" />,
        title: "Free for everyone",
        description: "No paid tier gates any core feature",
      },
      {
        icon: <IconBook size={22} color="var(--mantine-color-blue-6)" />,
        title: "Documentation",
        description: "Guides and API references for every component",
      },
      {
        icon: <IconFingerprint size={22} color="var(--mantine-color-blue-6)" />,
        title: "Security",
        description: "SOC 2 Type II audited, with SSO on every plan",
      },
      {
        icon: <IconChartPie3 size={22} color="var(--mantine-color-blue-6)" />,
        title: "Analytics",
        description: "Usage dashboards and exportable reports",
      },
      {
        icon: <IconNotification size={22} color="var(--mantine-color-blue-6)" />,
        title: "Notifications",
        description: "Email and webhook alerts for every event",
      },
    ],
  },
  { label: "Learn", href: "/learn" },
  { label: "Academy", href: "/academy" },
];

export function SiteHeader() {
  return (
    <HeaderMegaMenu
      logo={
        <Text fw={700} size="lg">
          ${String(props.brandName) || "Acme"}
        </Text>
      }
      links={links}${viewAllProp}
      featuresFooterHeading=${JSON.stringify(props.footerHeading)}
      loginLabel=${JSON.stringify(props.loginLabel)}
      onLogin={() => {}}
      onSignUp={() => {}}
    />
  );
}`;
  },
  stage: {
    desktopWidth: "100%",
  },
};

export default adapter;
