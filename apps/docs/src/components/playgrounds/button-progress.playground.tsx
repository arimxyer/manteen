import { ButtonProgress } from "../../../../../registry/mantine-ui/button-progress/button-progress";
import type { PlaygroundAdapter } from "./contract";

const DURATION_OPTIONS = [
  { label: "Fast (800ms)", value: "800" },
  { label: "Normal (2000ms)", value: "2000" },
  { label: "Slow (4000ms)", value: "4000" },
] as const;

const COLOR_OPTIONS = [
  { label: "Blue", value: "blue" },
  { label: "Grape", value: "grape" },
  { label: "Orange", value: "orange" },
] as const;

const adapter: PlaygroundAdapter = {
  item: "button-progress",
  defaultProps: {
    idleLabel: "Upload files",
    completeLabel: "Files uploaded",
    durationMs: "2000",
    color: "blue",
  },
  controls: [
    { kind: "text", prop: "idleLabel", label: "Idle label", wide: true },
    { kind: "text", prop: "completeLabel", label: "Complete label", wide: true },
    { kind: "select", prop: "durationMs", label: "Duration", options: DURATION_OPTIONS },
    { kind: "select", prop: "color", label: "Color", options: COLOR_OPTIONS },
  ],
  render: (props, recordEvent) => (
    <ButtonProgress
      idleLabel={String(props.idleLabel) || "Upload files"}
      progressLabel="Uploading files"
      completeLabel={String(props.completeLabel) || "Files uploaded"}
      durationMs={Number(props.durationMs)}
      color={String(props.color)}
      onComplete={() => recordEvent("onComplete")}
    />
  ),
  renderJsx: (props) => `<ButtonProgress
  idleLabel=${JSON.stringify(props.idleLabel)}
  progressLabel="Uploading files"
  completeLabel=${JSON.stringify(props.completeLabel)}
  durationMs={${Number(props.durationMs)}}
  color=${JSON.stringify(props.color)}
  onComplete={() => {}}
/>`,
  stage: {
    desktopWidth: "min(20rem, 100%)",
    mobileWidth: "min(16rem, 100%)",
  },
};

export default adapter;
