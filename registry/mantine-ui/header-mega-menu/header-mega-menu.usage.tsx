import { Text } from "@mantine/core";
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
          Acme
        </Text>
      }
      links={links}
      featuresViewAllHref="/features"
      onLogin={() => console.log("log in")}
      onSignUp={() => console.log("sign up")}
    />
  );
}
