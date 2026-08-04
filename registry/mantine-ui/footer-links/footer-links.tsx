/**
 * Adapted from Mantine UI's FooterLinks at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { ActionIcon, Container, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./footer-links.module.css";

export interface FooterLinksLink {
  label: string;
  href: string;
}

export interface FooterLinksGroup {
  title: string;
  links: readonly FooterLinksLink[];
}

export interface FooterLinksSocialLink {
  href: string;
  icon: ReactNode;
  /** Accessible name for the icon-only link, e.g. "Twitter". */
  label: string;
}

export interface FooterLinksProps {
  /** Rendered at the start of the brand block; nothing renders when omitted. */
  logo?: ReactNode;
  /** Short description under the logo; omitted when unset. */
  tagline?: string;
  /** Titled link columns. This is the component's whole point. */
  groups: readonly FooterLinksGroup[];
  /** Copyright / legal line; omitted when unset. */
  copyright?: string;
  /** Social icon links; the row is omitted when unset or empty. */
  socialLinks?: readonly FooterLinksSocialLink[];
}

export function FooterLinks({ logo, tagline, groups, copyright, socialLinks }: FooterLinksProps) {
  const hasBrand = Boolean(logo || tagline);
  const hasSocial = Boolean(socialLinks && socialLinks.length > 0);

  const groupItems = groups.map((group) => {
    const links = group.links.map((link) => (
      <Text key={link.label} className={classes.link} component="a" href={link.href}>
        {link.label}
      </Text>
    ));

    return (
      <div className={classes.wrapper} key={group.title}>
        <Text className={classes.title}>{group.title}</Text>
        {links}
      </div>
    );
  });

  return (
    <footer className={classes.footer}>
      <Container className={classes.inner}>
        {hasBrand && (
          <div className={classes.logo}>
            {logo}
            {tagline && (
              <Text size="xs" c="dimmed" className={classes.description}>
                {tagline}
              </Text>
            )}
          </div>
        )}
        <div className={classes.groups}>{groupItems}</div>
      </Container>

      {(copyright || hasSocial) && (
        <Container className={classes.afterFooter}>
          {copyright && (
            <Text c="dimmed" size="sm">
              {copyright}
            </Text>
          )}

          {hasSocial && (
            <Group gap={0} className={classes.social} justify="flex-end" wrap="nowrap">
              {socialLinks?.map((social) => (
                <ActionIcon
                  key={social.href}
                  size="lg"
                  color="gray"
                  variant="subtle"
                  aria-label={social.label}
                  component="a"
                  href={social.href}
                >
                  {social.icon}
                </ActionIcon>
              ))}
            </Group>
          )}
        </Container>
      )}
    </footer>
  );
}
