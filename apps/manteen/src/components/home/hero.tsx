import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { primaryButton, secondaryButton } from "@/components/home/styles";
import { WaterBackdrop } from "@/components/home/water-backdrop";
import { cn } from "@/lib/cn";

/**
 * The one journey the whole page describes, in the three artefacts it produces.
 *
 * The item named here is the item every card below names. It was `article-card`
 * while the cards said `release-panel`, which made the promise in this comment
 * false: a reader following the three stages down the page met a second example
 * at the first card and had no way to know it was meant to be the same one.
 */
const sourceMap: [string, string][] = [
  ["Author", "manteen.registry.json"],
  ["Compile", "/r/release-panel.json"],
  ["Own", "components/ui/release-panel.tsx"],
];

export function Hero() {
  return (
    <div className="relative mx-auto flex h-[70vh] max-h-[820px] min-h-[560px] w-full max-w-[1400px] overflow-hidden rounded-2xl border bg-fd-card bg-origin-border">
      {/* Painted first so the hero still reads as designed wherever WebGL does not run. */}
      <div className="hero-grid absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
      <WaterBackdrop variant="hero" />
      <div className="hero-scrim absolute inset-0" />

      <div className="relative z-2 flex size-full flex-col px-4 py-8 max-md:items-center max-md:text-center md:p-12">
        <p className="w-fit rounded-full border border-brand/40 px-3 py-1.5 text-xs font-medium text-brand">
          the Mantine-native component registry.
        </p>
        <h1 className="my-8 text-4xl leading-[1.05] font-medium tracking-tight xl:mb-10 xl:text-6xl">
          Install components
          <br />
          as source you <span className="text-brand">own</span>.
        </h1>
        <p className="mb-8 max-w-lg text-fd-muted-foreground md:text-lg">
          Author a catalog in Mantine's own vocabulary, compile it to the registry interchange
          format other clients already read, and install it as editable source.
        </p>
        <div className="flex w-fit flex-row flex-wrap items-center gap-3">
          <Link href="/docs/getting-started" className={cn(primaryButton, "max-sm:text-sm")}>
            Get started
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/docs/registry-authors" className={cn(secondaryButton, "max-sm:text-sm")}>
            Build a registry
          </Link>
        </div>

        <ul className="mt-auto flex flex-col gap-3 pt-10 font-mono text-xs sm:flex-row sm:gap-8">
          {sourceMap.map(([step, path]) => (
            <li key={step} className="flex flex-row items-center gap-2">
              <span className="text-brand">{step}</span>
              <span className="text-fd-muted-foreground">{path}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
