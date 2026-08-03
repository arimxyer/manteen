import { ButtonProgress } from "@ui/button-progress";

export function UploadFilesButton() {
  return (
    <ButtonProgress
      idleLabel="Upload files"
      progressLabel="Uploading files"
      completeLabel="Files uploaded"
      durationMs={2500}
      onComplete={() => console.log("upload complete")}
    />
  );
}
