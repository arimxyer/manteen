/**
 * Adapted from Mantine UI's ButtonProgress at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Button, type ButtonProps, Progress, rgba, useMantineTheme } from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { useState } from "react";

import classes from "./button-progress.module.css";

export interface ButtonProgressProps extends Omit<ButtonProps, "children" | "onClick"> {
  idleLabel?: string;
  progressLabel?: string;
  completeLabel?: string;
  durationMs?: number;
  onComplete?: () => void;
}

const TICK_MS = 20;

export function ButtonProgress({
  idleLabel = "Upload files",
  progressLabel = "Uploading files",
  completeLabel = "Files uploaded",
  durationMs = 2000,
  onComplete,
  className,
  ...buttonProps
}: ButtonProgressProps) {
  const theme = useMantineTheme();
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const step = (TICK_MS / Math.max(durationMs, TICK_MS)) * 100;

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
      fullWidth
      {...buttonProps}
      className={[classes.button, className].filter(Boolean).join(" ")}
      onClick={start}
      color={complete ? "teal.9" : (buttonProps.color ?? `${theme.primaryColor}.9`)}
    >
      <span className={classes.label} aria-live="polite">
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
}
