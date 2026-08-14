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

          The veil is even rather than graded — all three stops are deliberately equal, which
          keeps the caustics reading at the same strength across the panel instead of pinching
          toward the middle. The hero can wash in from one side because its copy is left-aligned;
          this copy is centred, so there is no side to favour. The stops stay written out so the
          balance is a knob rather than a rewrite.

          Utilities rather than a class in global.css — a hand-written class referenced by a
          string in JSX is the one styling link nothing checks. */}
      <div className="hero-glow absolute inset-0" />
      <WaterBackdrop variant="panel" />
      <div className="absolute inset-0 bg-linear-to-b from-fd-background/85 via-fd-background/55 to-fd-background/85" />
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
