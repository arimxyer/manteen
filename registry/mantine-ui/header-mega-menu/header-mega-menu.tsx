/**
 * Adapted from Mantine UI's HeaderMegaMenu at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import {
  Anchor,
  Box,
  Burger,
  Button,
  Center,
  Collapse,
  Divider,
  Drawer,
  Group,
  HoverCard,
  ScrollArea,
  SimpleGrid,
  Text,
  ThemeIcon,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";

import classes from "./header-mega-menu.module.css";

export interface HeaderMegaMenuFeature {
  icon?: ReactNode;
  title: string;
  description: string;
}

export interface HeaderMegaMenuLink {
  label: string;
  href: string;
  /**
   * Renders this link as a hover/tap mega-menu instead of a plain link. Only
   * the first entry in `links` that sets `features` is treated as the
   * mega-menu; `features` on any later entry is ignored.
   */
  features?: readonly HeaderMegaMenuFeature[];
}

export interface HeaderMegaMenuProps {
  /** Rendered at the start of the header bar; nothing renders when omitted. */
  logo?: ReactNode;
  /** Ordered nav links; at most one entry should set `features`. */
  links: readonly HeaderMegaMenuLink[];
  /** "View all" link inside the mega-menu; the link is omitted when unset. */
  featuresViewAllHref?: string;
  featuresFooterHeading?: string;
  featuresFooterDescription?: string;
  featuresFooterActionLabel?: string;
  loginLabel?: string;
  signUpLabel?: string;
  onLogin?: () => void;
  onSignUp?: () => void;
}

export function HeaderMegaMenu({
  logo,
  links,
  featuresViewAllHref,
  featuresFooterHeading = "Get started",
  featuresFooterDescription = "Everything you need to explore what's possible and start building.",
  featuresFooterActionLabel = "Get started",
  loginLabel = "Log in",
  signUpLabel = "Sign up",
  onLogin,
  onSignUp,
}: HeaderMegaMenuProps) {
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);
  const [linksOpened, { toggle: toggleLinks }] = useDisclosure(false);
  const theme = useMantineTheme();

  const featuresLink = links.find((link) => link.features);
  const featureItems = featuresLink?.features?.map((item) => (
    <UnstyledButton className={classes.subLink} key={item.title}>
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={34} variant="default" radius="md">
          {item.icon}
        </ThemeIcon>
        <div>
          <Text size="sm" fw={500}>
            {item.title}
          </Text>
          <Text size="xs" c="dimmed">
            {item.description}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  ));

  return (
    <>
      <header className={classes.header}>
        <Group justify="space-between" h="100%">
          {logo}

          <Group h="100%" gap={0} visibleFrom="sm">
            {links.map((link) =>
              link === featuresLink ? (
                <HoverCard
                  key={link.label}
                  width={600}
                  position="bottom"
                  radius="md"
                  shadow="md"
                  withinPortal
                >
                  <HoverCard.Target>
                    <UnstyledButton className={classes.link}>
                      <Center inline>
                        <Box component="span" mr={5}>
                          {link.label}
                        </Box>
                        <IconChevronDown size={16} color={theme.colors.blue[6]} />
                      </Center>
                    </UnstyledButton>
                  </HoverCard.Target>

                  <HoverCard.Dropdown style={{ overflow: "hidden" }}>
                    <Group justify="space-between" px="md">
                      <Text fw={500}>{link.label}</Text>
                      {featuresViewAllHref && (
                        <Anchor href={featuresViewAllHref} fz="xs">
                          View all
                        </Anchor>
                      )}
                    </Group>

                    <Divider my="sm" />

                    <SimpleGrid cols={2} spacing={0}>
                      {featureItems}
                    </SimpleGrid>

                    <div className={classes.dropdownFooter}>
                      <Group justify="space-between">
                        <div>
                          <Text fw={500} fz="sm">
                            {featuresFooterHeading}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {featuresFooterDescription}
                          </Text>
                        </div>
                        <Button variant="default" onClick={onSignUp}>
                          {featuresFooterActionLabel}
                        </Button>
                      </Group>
                    </div>
                  </HoverCard.Dropdown>
                </HoverCard>
              ) : (
                <a href={link.href} className={classes.link} key={link.label}>
                  {link.label}
                </a>
              ),
            )}
          </Group>

          <Group visibleFrom="sm">
            <Button variant="default" onClick={onLogin}>
              {loginLabel}
            </Button>
            <Button onClick={onSignUp}>{signUpLabel}</Button>
          </Group>

          <Burger
            opened={drawerOpened}
            onClick={toggleDrawer}
            hiddenFrom="sm"
            aria-label="Toggle navigation"
          />
        </Group>
      </header>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="100%"
        padding="md"
        title="Navigation"
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100vh - 80px)" mx="-md">
          <Divider my="sm" />

          {links.map((link) =>
            link === featuresLink ? (
              <div key={link.label}>
                <UnstyledButton
                  className={classes.link}
                  onClick={toggleLinks}
                  aria-expanded={linksOpened}
                >
                  <Center inline>
                    <Box component="span" mr={5}>
                      {link.label}
                    </Box>
                    <IconChevronDown size={16} color={theme.colors.blue[6]} />
                  </Center>
                </UnstyledButton>
                <Collapse expanded={linksOpened}>{featureItems}</Collapse>
              </div>
            ) : (
              <a href={link.href} className={classes.link} key={link.label}>
                {link.label}
              </a>
            ),
          )}

          <Divider my="sm" />

          <Group justify="center" grow pb="xl" px="md">
            <Button variant="default" onClick={onLogin}>
              {loginLabel}
            </Button>
            <Button onClick={onSignUp}>{signUpLabel}</Button>
          </Group>
        </ScrollArea>
      </Drawer>
    </>
  );
}
