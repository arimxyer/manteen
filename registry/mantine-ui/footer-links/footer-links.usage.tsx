import { Text } from "@mantine/core";
import { IconBrandInstagram, IconBrandTwitter, IconBrandYoutube } from "@tabler/icons-react";
import {
  FooterLinks,
  type FooterLinksGroup,
  type FooterLinksSocialLink,
} from "@/components/ui/footer-links";

const groups: FooterLinksGroup[] = [
  {
    title: "About",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Support", href: "/support" },
      { label: "Forums", href: "/forums" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Contribute", href: "/contribute" },
      { label: "Media assets", href: "/media" },
      { label: "Changelog", href: "/changelog" },
      { label: "Releases", href: "/releases" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Join Discord", href: "https://discord.gg/acme" },
      { label: "Follow on Twitter", href: "https://twitter.com/acme" },
      { label: "Email newsletter", href: "/newsletter" },
      { label: "GitHub discussions", href: "https://github.com/acme/acme/discussions" },
    ],
  },
];

const socialLinks: FooterLinksSocialLink[] = [
  {
    href: "https://twitter.com/acme",
    label: "Twitter",
    icon: <IconBrandTwitter size={18} stroke={1.5} />,
  },
  {
    href: "https://youtube.com/@acme",
    label: "Youtube",
    icon: <IconBrandYoutube size={18} stroke={1.5} />,
  },
  {
    href: "https://instagram.com/acme",
    label: "Instagram",
    icon: <IconBrandInstagram size={18} stroke={1.5} />,
  },
];

export function SiteFooter() {
  return (
    <FooterLinks
      logo={
        <Text fw={700} size="lg">
          Acme
        </Text>
      }
      tagline="Build fully functional accessible web applications faster than ever"
      groups={groups}
      copyright="© 2026 Acme. All rights reserved."
      socialLinks={socialLinks}
    />
  );
}
