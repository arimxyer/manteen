import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { h2, primaryButton, secondaryButton } from "@/components/home/styles";
import { cn } from "@/lib/cn";

export function Closing() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-2xl border bg-fd-card px-6 py-16 text-center shadow-lg">
      <div className="hero-glow absolute inset-0" />
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
