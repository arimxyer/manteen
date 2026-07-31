/**
 * Adapted from Mantine UI's DropzoneButton at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Button, Group, Text, useMantineTheme } from "@mantine/core";
import { Dropzone, type FileRejection, MIME_TYPES } from "@mantine/dropzone";
import { IconCloudUpload, IconDownload, IconX } from "@tabler/icons-react";
import { useRef } from "react";

import classes from "./dropzone-button.module.css";

export interface DropzoneButtonProps {
  onDrop: (files: File[]) => void;
  onReject?: (rejections: FileRejection[]) => void;
  accept?: string[];
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  idleLabel?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  description?: string;
  buttonLabel?: string;
}

export function DropzoneButton({
  onDrop,
  onReject,
  accept = [MIME_TYPES.pdf],
  maxSize = 30 * 1024 ** 2,
  multiple = true,
  disabled = false,
  idleLabel = "Upload files",
  acceptLabel = "Drop files here",
  rejectLabel = "These files cannot be accepted",
  description = "Drag and drop files here, or use the file picker.",
  buttonLabel = "Select files",
}: DropzoneButtonProps) {
  const theme = useMantineTheme();
  const openRef = useRef<() => void>(null);

  return (
    <div className={classes.wrapper}>
      <Dropzone
        openRef={openRef}
        onDrop={onDrop}
        onReject={onReject}
        className={classes.dropzone}
        radius="md"
        accept={accept}
        maxSize={maxSize}
        multiple={multiple}
        disabled={disabled}
        inputProps={{ "aria-label": idleLabel }}
      >
        <div style={{ pointerEvents: "none" }}>
          <Group justify="center">
            <Dropzone.Accept>
              <IconDownload size={50} color={theme.colors.blue[6]} stroke={1.5} />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={50} color={theme.colors.red[6]} stroke={1.5} />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconCloudUpload size={50} stroke={1.5} className={classes.icon} />
            </Dropzone.Idle>
          </Group>

          <Text ta="center" fw={700} fz="lg" mt="xl">
            <Dropzone.Accept>{acceptLabel}</Dropzone.Accept>
            <Dropzone.Reject>{rejectLabel}</Dropzone.Reject>
            <Dropzone.Idle>{idleLabel}</Dropzone.Idle>
          </Text>

          <Text className={classes.description}>{description}</Text>
        </div>
      </Dropzone>

      <Button
        className={classes.control}
        size="md"
        radius="xl"
        color="blue.8"
        disabled={disabled}
        onClick={() => openRef.current?.()}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
