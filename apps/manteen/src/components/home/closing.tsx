import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { h2, primaryButton, secondaryButton } from "@/components/home/styles";
import { WaterBackdrop } from "@/components/home/water-backdrop";
import { cn } from "@/lib/cn";

export function Closing() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-2xl border bg-fd-card px-6 py-16 text-center shadow-lg">
      {/* Same order as the hero: CSS glow first so the panel reads as designed without WebGL,
          then the water, then a veil the copy sits on.

          The veil washes in from both ends rather than from one side. The hero can favour a
          side because its copy is left-aligned; this copy is centred, so the graded stops run
          top-to-bottom and the middle — where the water is broadest — is the thinnest part.

          The stops differ per theme, because thinning the veil does opposite things to the two.
          Dark copy is light on a dark ground, so letting more water through *raises* the
          backdrop's luminance and eats into contrast from a large surplus — measured at 6.6:1
          behind the paragraph, where 4.5:1 is the floor. Light copy is dark on a near-white
          ground, so the same thinning *lowers* luminance and eats contrast that was never
          spare: at these dark-mode numbers, light mode measured 3.3:1 and failed.

          So dark opens up and light does not. Light gets its water back from the shader
          instead — brighter highlights raise luminance, which makes the caustics more legible
          and improves the contrast at the same time. Two levers, opposite themes, one result.

          Utilities rather than a class in global.css — a hand-written class referenced by a
          string in JSX is the one styling link nothing checks. */}
      <div className="hero-glow absolute inset-0" />
      <WaterBackdrop variant="panel" />
      <div className="absolute inset-0 bg-linear-to-b from-fd-background/82 via-fd-background/52 to-fd-background/82 dark:from-fd-background/68 dark:via-fd-background/38 dark:to-fd-background/68" />
      <div className="relative z-2">
        <h2 className={cn(h2, "mb-4")}>Start with one planned install.</h2>
        <p className="mx-auto mb-8 max-w-xl text-fd-muted-foreground">
          Initialize a supported Mantine application, inspect an item, and preview every write
          before source lands in the project.
        </p>
        <div className="flex flex-row flex-wrap items-center justify-center gap-3">
          <Link href="/docs/getting-started" className={primaryButton}>
            Install your first item
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/docs" className={secondaryButton}>
            Read the docs
          </Link>
        </div>
      </div>
    </div>
  );
}
