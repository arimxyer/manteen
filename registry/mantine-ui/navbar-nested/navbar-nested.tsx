/**
 * Adapted from Mantine UI's NavbarNested at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Code, Group, ScrollArea } from "@mantine/core";
import classes from "./navbar-nested.module.css";
import { LinksGroup, type NavbarNestedLinkItem } from "./navbar-nested-links-group";
import { Logo } from "./navbar-nested-logo";
import { UserButton, type UserButtonProps } from "./navbar-nested-user-button";

export type {
  NavbarNestedLink,
  NavbarNestedLinkGroupItem,
  NavbarNestedLinkItem,
  NavbarNestedLinkLeafItem,
} from "./navbar-nested-links-group";
export type { UserButtonProps } from "./navbar-nested-user-button";

export interface NavbarNestedProps {
  links: NavbarNestedLinkItem[];
  user: UserButtonProps;
  versionLabel?: string;
}

export function NavbarNested({ links, user, versionLabel }: NavbarNestedProps) {
  const items = links.map((item) => <LinksGroup {...item} key={item.label} />);

  return (
    <nav className={classes.navbar}>
      <div className={classes.header}>
        <Group justify="space-between">
          <Logo style={{ width: 120 }} />
          {versionLabel && <Code fw={700}>{versionLabel}</Code>}
        </Group>
      </div>

      <ScrollArea className={classes.links}>
        <div className={classes.linksInner}>{items}</div>
      </ScrollArea>

      <div className={classes.footer}>
        <UserButton {...user} />
      </div>
    </nav>
  );
}
