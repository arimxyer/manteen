import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Rise } from "@/components/home/rise";
import { arrowIcon, primaryButton, secondaryButton } from "@/components/home/styles";
import { WaterBackdrop } from "@/components/home/water-backdrop";
import { cn } from "@/lib/cn";

/** The one journey the whole page describes, in the three artefacts it produces. */
const sourceMap: [string, string][] = [
  ["Author", "manteen.registry.json"],
  ["Compile", "/r/article-card.json"],
  ["Own", "components/ui/article-card.tsx"],
];

export function Hero() {
  return (
    <div className="relative mx-auto flex h-[70vh] max-h-[820px] min-h-[560px] w-full max-w-[1400px] overflow-hidden rounded-2xl border bg-fd-card bg-origin-border">
      {/* Painted first so the hero still reads as designed wherever WebGL does not run. */}
      <div className="hero-grid absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
      <WaterBackdrop variant="hero" />
      <div className="hero-scrim absolute inset-0" />

      {/* The entrance is staggered in the order the copy is meant to be read, and it is
          short: 80ms between steps, so the whole hero has settled well inside half a
          second. Each `Rise` carries the spacing that used to sit on the element it
          wraps — see the note on the component. */}
      <div className="relative z-2 flex size-full flex-col px-4 py-8 max-md:items-center max-md:text-center md:p-12">
        <Rise className="w-fit">
          <p className="rounded-full border border-brand/40 px-3 py-1.5 text-xs font-medium text-brand">
            the Mantine-native component registry.
          </p>
        </Rise>
        <Rise className="my-8 xl:mb-10" delay={80}>
          <h1 className="text-4xl leading-[1.05] font-medium tracking-tight xl:text-6xl">
            Install components
            <br />
            as source you <span className="text-brand">own</span>.
          </h1>
        </Rise>
        <Rise className="mb-8 max-w-lg" delay={160}>
          <p className="text-fd-muted-foreground md:text-lg">
            Author a catalog in Mantine's own vocabulary, compile it to the registry interchange
            format other clients already read, and install it as editable source.
          </p>
        </Rise>
        <Rise className="w-fit" delay={240}>
          <div className="flex flex-row flex-wrap items-center gap-3">
            <Link href="/docs/getting-started" className={cn(primaryButton, "max-sm:text-sm")}>
              Get started
              <ArrowRight className={arrowIcon} aria-hidden="true" />
            </Link>
            <Link href="/docs/registry-authors" className={cn(secondaryButton, "max-sm:text-sm")}>
              Build a registry
            </Link>
          </div>
        </Rise>

        <Rise className="mt-auto pt-10" delay={320}>
          <ul className="flex flex-col gap-3 font-mono text-xs sm:flex-row sm:gap-8">
            {sourceMap.map(([step, path]) => (
              <li key={step} className="flex flex-row items-center gap-2">
                <span className="text-brand">{step}</span>
                <span className="text-fd-muted-foreground">{path}</span>
              </li>
            ))}
          </ul>
        </Rise>
      </div>
    </div>
  );
}
