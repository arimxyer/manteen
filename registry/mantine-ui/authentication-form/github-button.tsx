/**
 * Adapted from Mantine UI's AuthenticationForm social button at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Button, type ButtonProps } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import type { ComponentPropsWithoutRef } from "react";

export function GithubButton(props: ButtonProps & ComponentPropsWithoutRef<"button">) {
  return <Button leftSection={<IconBrandGithub size={16} />} variant="default" {...props} />;
}
