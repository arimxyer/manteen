import {
  type BoxProps,
  Button,
  Center,
  type ElementProps,
  type Factory,
  factory,
  Stack,
  type StylesApiProps,
  Text,
  ThemeIcon,
  Title,
  useProps,
  useStyles,
} from "@mantine/core";
import { IconInbox } from "@tabler/icons-react";
import type { ReactNode } from "react";

import classes from "./empty-state.module.css";

export type EmptyStateStylesNames = "root" | "icon" | "title" | "description" | "action";

export interface EmptyStateProps
  extends BoxProps,
    StylesApiProps<EmptyStateFactory>,
    ElementProps<"div", "title"> {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}

export type EmptyStateFactory = Factory<{
  props: EmptyStateProps;
  ref: HTMLDivElement;
  stylesNames: EmptyStateStylesNames;
}>;

export const EmptyState = factory<EmptyStateFactory>((_props) => {
  const props = useProps("EmptyState", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    title = "Nothing here yet",
    description,
    icon,
    action,
    ...others
  } = props;

  const getStyles = useStyles<EmptyStateFactory>({
    name: "EmptyState",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
  });

  return (
    <Center ref={ref} py="xl" unstyled={unstyled} {...getStyles("root")} {...others}>
      <Stack align="center" gap="xs" maw={360} ta="center">
        <ThemeIcon variant="light" size={48} radius="xl" {...getStyles("icon")}>
          {icon ?? <IconInbox size={24} />}
        </ThemeIcon>
        <Title order={4} {...getStyles("title")}>
          {title}
        </Title>
        {description && (
          <Text c="dimmed" size="sm" {...getStyles("description")}>
            {description}
          </Text>
        )}
        {action && (
          <Button mt="sm" onClick={action.onClick} {...getStyles("action")}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Center>
  );
});

EmptyState.classes = classes;
EmptyState.displayName = "EmptyState";

export namespace EmptyState {
  export type Props = EmptyStateProps;
  export type StylesNames = EmptyStateStylesNames;
  export type Factory = EmptyStateFactory;
}
