import { DropzoneButton } from "@ui/dropzone-button";

export function ResumeUpload() {
  return (
    <DropzoneButton
      onDrop={(files) => console.log("accepted files", files)}
      onReject={(rejections) => console.log("rejected files", rejections)}
      idleLabel="Upload your resume"
      acceptLabel="Drop your resume here"
      rejectLabel="PDF files only, up to 30MB"
      description="Drag and drop a PDF here, or click the button to browse your files."
      buttonLabel="Select file"
    />
  );
}
