import { h2 } from "@/components/home/styles";
import { OwnershipStoryPreview } from "@/components/preview/ownership-story-preview";
import { cn } from "@/lib/cn";

/**
 * Review-only. Not linked from anywhere, and meant to be deleted once the
 * ownership illustration is settled.
 *
 * A `div` rather than a `main`: `HomeLayout` already renders the page's `<main>`
 * and a second one would leave two main landmarks.
 */
export default function OwnershipStoryPreviewPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-12">
      <h1 className={cn(h2, "mb-2")}>Ownership illustration</h1>
      <p className="mb-8 max-w-2xl text-fd-muted-foreground">
        Drive the proposed storyboard from one control, at a speed you pick, against what the
        ownership card renders today. Nothing here is linked from the site.
      </p>
      <OwnershipStoryPreview />
    </div>
  );
}
