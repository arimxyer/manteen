/**
 * Adapted from Mantine UI's ButtonProgress at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type Factory,
  factory,
  Progress,
  rgba,
  type StylesApiProps,
  useMantineTheme,
  useProps,
  useStyles,
} from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { useState } from "react";

import classes from "./button-progress.module.css";

export type ButtonProgressStylesNames = "root" | "label";

export interface ButtonProgressProps
  extends Omit<
      ButtonProps,
      | "children"
      | "onClick"
      | "classNames"
      | "styles"
      | "vars"
      | "unstyled"
      | "attributes"
      | "variant"
    >,
    StylesApiProps<ButtonProgressFactory> {
  /** Key of Button's variant, e.g. `"filled"` @default 'filled' */
  variant?: ButtonVariant;
  idleLabel?: string;
  progressLabel?: string;
  completeLabel?: string;
  durationMs?: number;
  onComplete?: () => void;
}

export type ButtonProgressFactory = Factory<{
  props: ButtonProgressProps;
  ref: HTMLButtonElement;
  stylesNames: ButtonProgressStylesNames;
}>;

const TICK_MS = 20;

export const ButtonProgress = factory<ButtonProgressFactory>((_props) => {
  const props = useProps("ButtonProgress", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    idleLabel = "Upload files",
    progressLabel = "Uploading files",
    completeLabel = "Files uploaded",
    durationMs = 2000,
    onComplete,
    color,
    ...others
  } = props;

  const theme = useMantineTheme();
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const step = (TICK_MS / Math.max(durationMs, TICK_MS)) * 100;

  const getStyles = useStyles<ButtonProgressFactory>({
    name: "ButtonProgress",
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

  const interval = useInterval(() => {
    setProgress((current) => {
      const next = current + step;
      if (next < 100) return next;

      interval.stop();
      setComplete(true);
      onComplete?.();
      return 0;
    });
  }, TICK_MS);

  const start = () => {
    if (complete) {
      setComplete(false);
      return;
    }
    if (!interval.active) interval.start();
  };

  return (
    <Button
      ref={ref}
      fullWidth
      unstyled={unstyled}
      {...getStyles("root")}
      {...others}
      onClick={start}
      color={complete ? "teal.9" : (color ?? `${theme.primaryColor}.9`)}
    >
      <span {...getStyles("label")} aria-live="polite">
        {progress > 0 ? progressLabel : complete ? completeLabel : idleLabel}
      </span>
      {progress > 0 && (
        <Progress
          value={progress}
          className={classes.progress}
          color={rgba(theme.colors.blue[2], 0.35)}
          radius="sm"
        />
      )}
    </Button>
  );
});

ButtonProgress.classes = classes;
ButtonProgress.displayName = "ButtonProgress";

export namespace ButtonProgress {
  export type Props = ButtonProgressProps;
  export type StylesNames = ButtonProgressStylesNames;
  export type Factory = ButtonProgressFactory;
}
