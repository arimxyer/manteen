import "@mantine/dropzone/styles.css";

import { DropzoneButton } from "../../../../../registry/mantine-ui/dropzone-button/dropzone-button";
import type { PlaygroundAdapter } from "./contract";

const adapter: PlaygroundAdapter = {
  item: "dropzone-button",
  defaultProps: {
    idleLabel: "Upload your resume",
    buttonLabel: "Select file",
    description: "Drag and drop a PDF here, or click the button to browse your files.",
    disabled: false,
  },
  controls: [
    { kind: "text", prop: "idleLabel", label: "Idle label" },
    { kind: "text", prop: "description", label: "Description", wide: true },
    { kind: "text", prop: "buttonLabel", label: "Button label", compact: true },
    { kind: "switch", prop: "disabled", label: "Disabled" },
  ],
  render: (props, recordEvent) => (
    <DropzoneButton
      idleLabel={String(props.idleLabel) || "Upload files"}
      acceptLabel="Drop your resume here"
      rejectLabel="PDF files only, up to 30MB"
      description={String(props.description) || "Drag and drop files here, or use the file picker."}
      buttonLabel={String(props.buttonLabel) || "Select files"}
      disabled={Boolean(props.disabled)}
      onDrop={(files) =>
        recordEvent(`onDrop (${files.length} file${files.length === 1 ? "" : "s"})`)
      }
      onReject={(rejections) =>
        recordEvent(`onReject (${rejections.length} file${rejections.length === 1 ? "" : "s"})`)
      }
    />
  ),
  renderJsx: (props) => `<DropzoneButton
  idleLabel=${JSON.stringify(props.idleLabel)}
  acceptLabel="Drop your resume here"
  rejectLabel="PDF files only, up to 30MB"
  description=${JSON.stringify(props.description)}
  buttonLabel=${JSON.stringify(props.buttonLabel)}
  disabled={${Boolean(props.disabled)}}
  onDrop={(files) => {}}
  onReject={(rejections) => {}}
/>`,
  stage: {
    desktopWidth: "min(28rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
    minHeight: "22rem",
  },
};

export default adapter;
