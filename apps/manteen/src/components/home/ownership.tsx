import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight, GitCompareArrows, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DetailList } from "@/components/home/detail-list";
import { arrowIcon, band, card, h3, textLink } from "@/components/home/styles";
import { cn } from "@/lib/cn";

const plannedUpdate = `# Read the plan, keep its digest
manteen update @house/article-card --dry-run --json

# Apply only if nothing moved underneath it
manteen update @house/article-card --expect-plan <sha256> --json`;

const ownershipState: [string, string][] = [
  ["manteen.lock.json", "the receipt recording what Manteen owns"],
  [".manteen/bases/", "pristine upstream source, kept for comparison"],
  ["manteen diff", "local, base, and upstream side by side"],
  ["manteen status", "local health, assessed without registry access"],
];

export function Ownership() {
  return (
    <div className={band}>
      <div className={cn(card, "flex flex-col")}>
        <GitCompareArrows className="mb-4 text-brand" aria-hidden="true" />
        <h3 className={cn(h3, "mb-4")}>Change the source. Keep the history.</h3>
        <p className="mb-4 text-fd-muted-foreground">
          A receipt and a pristine base travel with the install, so local adaptations stay
          distinguishable from upstream.{" "}
          <code className="font-mono text-fd-foreground">update</code> merges around your edits
          instead of over them, and every mutating command will show you the plan first.
        </p>
        <DetailList items={ownershipState} />
        <Link href="/docs/concepts/source-ownership" className={cn(textLink, "mt-auto")}>
          Follow the ownership model
          <ArrowRight className={arrowIcon} aria-hidden="true" />
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        <ServerCodeBlock
          lang="bash"
          code={plannedUpdate}
          codeblock={{ title: "Review, then apply", className: "my-0 shadow-lg" }}
        />
        <div className={cn(card, "flex flex-row items-start gap-3")}>
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-fd-muted-foreground">
            There is no universal force switch. Overwrite, discard-local, and skip-verification are
            separate, narrowly scoped decisions — a stale plan digest is a zero-write refusal.
          </p>
        </div>
      </div>
    </div>
  );
}
