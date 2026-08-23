import { ArrowRight, FileJson } from "lucide-react";
import Link from "next/link";
import { DetailList } from "@/components/home/detail-list";
import { InteropPublication } from "@/components/home/interop-publication";
import { band, card, h3, textLink } from "@/components/home/styles";
import { cn } from "@/lib/cn";

const compiledOutput: [string, string][] = [
  ["registry.json", "the catalog index clients discover"],
  ["<item>.json", "one installable document per item"],
  ["manteen-kit build", "validates both, and refuses rather than emitting partial output"],
];

/**
 * The illustration replaced three labelled boxes joined by arrows. They named
 * the stages of the pipeline without ever showing one, so the card asserted its
 * claim in the same voice as the copy beside it — twice the words, no evidence.
 * The selected publication study instead shows the build assembling a complete
 * output set beside the still-published one. Only the published address moves,
 * so the illustration demonstrates the atomic-set guarantee rather than naming
 * three pipeline stages.
 */
export function Interop() {
  return (
    <div className={band}>
      <div className={cn(card, "justify-center max-lg:row-start-2")}>
        <InteropPublication />
      </div>
      <div className={cn(card, "flex flex-col")}>
        <FileJson className="mb-4 text-brand" aria-hidden="true" />
        <h3 className={cn(h3, "mb-4")}>Compile once. Stay interoperable.</h3>
        <p className="mb-4 text-fd-muted-foreground">
          The build emits static documents that follow the registry interchange contract, so generic
          clients can install them. Manteen reads the richer Mantine metadata on top — provider
          setup, theme fragments, package styles, and compatibility gates.
        </p>
        <DetailList items={compiledOutput} />
        <Link href="/docs/concepts/registry-references" className={cn(textLink, "mt-auto")}>
          URLs and namespaces
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
