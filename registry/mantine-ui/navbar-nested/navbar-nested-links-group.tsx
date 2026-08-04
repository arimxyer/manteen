/**
 * Adapted from Mantine UI's NavbarLinksGroup at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Box, Collapse, Group, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconChevronRight, type TablerIcon } from "@tabler/icons-react";
import { useState } from "react";

import classes from "./navbar-nested-links-group.module.css";

export interface NavbarNestedLink {
  label: string;
  link: string;
}

interface NavbarNestedLinkItemBase {
  icon: TablerIcon;
  label: string;
}

/** An entry that expands a nested list of secondary links. */
export interface NavbarNestedLinkGroupItem extends NavbarNestedLinkItemBase {
  initiallyOpened?: boolean;
  links: NavbarNestedLink[];
}

/** An entry that navigates directly; it has no nested list. */
export interface NavbarNestedLinkLeafItem extends NavbarNestedLinkItemBase {
  link: string;
}

export type NavbarNestedLinkItem = NavbarNestedLinkGroupItem | NavbarNestedLinkLeafItem;

export function LinksGroup(props: NavbarNestedLinkItem) {
  const { icon: Icon, label } = props;
  const [opened, setOpened] = useState("links" in props ? (props.initiallyOpened ?? false) : false);

  const content = (
    <Group justify="space-between" gap={0}>
      <Box style={{ display: "flex", alignItems: "center" }}>
        <ThemeIcon variant="light" size={30}>
          <Icon size={18} aria-hidden="true" />
        </ThemeIcon>
        <Box ml="md">{label}</Box>
      </Box>
      {"links" in props && (
        <IconChevronRight
          className={classes.chevron}
          stroke={1.5}
          size={16}
          aria-hidden="true"
          style={{ transform: opened ? "rotate(-90deg)" : "none" }}
        />
      )}
    </Group>
  );

  return (
    <>
      {"links" in props ? (
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          className={classes.control}
          aria-expanded={opened}
        >
          {content}
        </UnstyledButton>
      ) : (
        <UnstyledButton component="a" href={props.link} className={classes.control}>
          {content}
        </UnstyledButton>
      )}
      {"links" in props && (
        <Collapse expanded={opened}>
          {props.links.map((link) => (
            <Text<"a"> component="a" className={classes.link} href={link.link} key={link.label}>
              {link.label}
            </Text>
          ))}
        </Collapse>
      )}
    </>
  );
}
