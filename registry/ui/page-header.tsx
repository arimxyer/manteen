import {
  type BoxProps,
  Divider,
  type ElementProps,
  type Factory,
  factory,
  Group,
  Stack,
  type StylesApiProps,
  Text,
  Title,
  useProps,
  useStyles,
} from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./page-header.module.css";

export type PageHeaderStylesNames =
  | "root"
  | "header"
  | "titleWrapper"
  | "title"
  | "description"
  | "actions"
  | "divider";

export interface PageHeaderProps
  extends BoxProps,
    StylesApiProps<PageHeaderFactory>,
    ElementProps<"div", "title"> {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  withDivider?: boolean;
}

export type PageHeaderFactory = Factory<{
  props: PageHeaderProps;
  ref: HTMLDivElement;
  stylesNames: PageHeaderStylesNames;
}>;

export const PageHeader = factory<PageHeaderFactory>((_props) => {
  const props = useProps("PageHeader", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    title,
    description,
    actions,
    withDivider = true,
    ...others
  } = props;

  const getStyles = useStyles<PageHeaderFactory>({
    name: "PageHeader",
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
    <Stack ref={ref} gap="sm" mb="lg" unstyled={unstyled} {...getStyles("root")} {...others}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" {...getStyles("header")}>
        <Stack gap={4} {...getStyles("titleWrapper")}>
          <Title order={2} {...getStyles("title")}>
            {title}
          </Title>
          {description && (
            <Text c="dimmed" size="sm" {...getStyles("description")}>
              {description}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" {...getStyles("actions")}>
            {actions}
          </Group>
        )}
      </Group>
      {withDivider && <Divider {...getStyles("divider")} />}
    </Stack>
  );
});

PageHeader.classes = classes;
PageHeader.displayName = "PageHeader";

export namespace PageHeader {
  export type Props = PageHeaderProps;
  export type StylesNames = PageHeaderStylesNames;
  export type Factory = PageHeaderFactory;
}
