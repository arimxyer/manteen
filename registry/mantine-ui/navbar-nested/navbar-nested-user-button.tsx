/**
 * Adapted from Mantine UI's UserButton at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Avatar, Group, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";

import classes from "./navbar-nested-user-button.module.css";

export interface UserButtonProps {
  name: string;
  email: string;
  avatar?: string;
}

export function UserButton({ name, email, avatar }: UserButtonProps) {
  return (
    <UnstyledButton className={classes.user}>
      <Group>
        <Avatar src={avatar} radius="xl" alt="" />

        <div style={{ flex: 1 }}>
          <Text size="sm" fw={500}>
            {name}
          </Text>

          <Text c="dimmed" size="xs">
            {email}
          </Text>
        </div>

        <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />
      </Group>
    </UnstyledButton>
  );
}
