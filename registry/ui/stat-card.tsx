import {
  type BoxProps,
  type ElementProps,
  type Factory,
  factory,
  Group,
  Paper,
  type StylesApiProps,
  Text,
  ThemeIcon,
  useProps,
  useStyles,
} from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import type { ReactNode } from "react";

import classes from "./stat-card.module.css";

export type StatCardStylesNames = "root" | "label" | "value" | "icon" | "diff";

export interface StatCardProps
  extends BoxProps,
    StylesApiProps<StatCardFactory>,
    ElementProps<"div"> {
  label: string;
  value: ReactNode;
  /** Percentage change vs. the previous period. Omit to hide the trend row. */
  diff?: number;
  icon?: ReactNode;
}

export type StatCardFactory = Factory<{
  props: StatCardProps;
  ref: HTMLDivElement;
  stylesNames: StatCardStylesNames;
}>;

export const StatCard = factory<StatCardFactory>((_props) => {
  const props = useProps("StatCard", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    label,
    value,
    diff,
    icon,
    ...others
  } = props;

  const getStyles = useStyles<StatCardFactory>({
    name: "StatCard",
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

  const positive = (diff ?? 0) >= 0;

  return (
    <Paper
      ref={ref}
      withBorder
      p="md"
      radius="md"
      unstyled={unstyled}
      {...getStyles("root")}
      {...others}
    >
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text {...getStyles("label")}>{label}</Text>
          <Text {...getStyles("value")}>{value}</Text>
        </div>
        {icon && (
          <ThemeIcon variant="light" size={38} radius="md" {...getStyles("icon")}>
            {icon}
          </ThemeIcon>
        )}
      </Group>

      {diff !== undefined && (
        <Group gap={4} mt="xs" {...getStyles("diff")}>
          <ThemeIcon variant="transparent" size="sm" c={positive ? "teal" : "red"}>
            {positive ? <IconTrendingUp size={16} /> : <IconTrendingDown size={16} />}
          </ThemeIcon>
          <Text size="sm" c={positive ? "teal" : "red"} fw={500}>
            {positive ? "+" : ""}
            {diff}%
          </Text>
          <Text size="sm" c="dimmed">
            vs last period
          </Text>
        </Group>
      )}
    </Paper>
  );
});

StatCard.classes = classes;
StatCard.displayName = "StatCard";

export namespace StatCard {
  export type Props = StatCardProps;
  export type StylesNames = StatCardStylesNames;
  export type Factory = StatCardFactory;
}
