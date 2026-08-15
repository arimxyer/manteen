import { ArrowRight, FileJson } from "lucide-react";
import Link from "next/link";
import { DetailList } from "@/components/home/detail-list";
import { arrowIcon, band, card, h3, textLink } from "@/components/home/styles";
import { cn } from "@/lib/cn";

const flow: [string, string][] = [
  ["Author catalog", "Mantine vocabulary"],
  ["Static contract", "/r/*.json"],
  ["Consumer project", "editable source"],
];

const compiledOutput: [string, string][] = [
  ["registry.json", "the catalog index clients discover"],
  ["<item>.json", "one installable document per item"],
  ["manteen-kit build", "validates both, and refuses rather than emitting partial output"],
];

export function Interop() {
  return (
    <div className={band}>
      <div className={cn(card, "flex flex-col justify-center gap-3 max-lg:row-start-2")}>
        {flow.map(([label, detail], index) => (
          <div key={label} className="contents">
            <div className="rounded-xl border bg-fd-background/40 px-4 py-3">
              <p className="font-medium">{label}</p>
              <code className="font-mono text-xs text-fd-muted-foreground">{detail}</code>
            </div>
            {index < flow.length - 1 ? (
              <ArrowRight className="mx-auto size-4 rotate-90 text-brand" aria-hidden="true" />
            ) : null}
          </div>
        ))}
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
          <ArrowRight className={arrowIcon} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
