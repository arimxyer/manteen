import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { h2, textLink } from "@/components/home/styles";
import { cn } from "@/lib/cn";

/**
 * Lifted from `manteen --help`, and the same set `packages/cli/src/agent/manifest.ts`
 * holds — that manifest is what this list must agree with.
 */
const commands: [string, string][] = [
  ["manteen init", "Detect and configure a supported Mantine application."],
  ["manteen add <ref...>", "Resolve, plan, and install registry items and dependencies."],
  ["manteen list [namespace...]", "Discover configured registry items and installed state."],
  ["manteen info <ref>", "Inspect one item's files, requirements, metadata, props, and usage."],
  ["manteen diff [ref...]", "Compare local, pristine-base, and current upstream source."],
  ["manteen update [ref...]", "Merge upstream changes around local source adaptations."],
  ["manteen remove", "Remove exact receipt-owned files proven absent upstream."],
  ["manteen status", "Assess local configuration and receipt health, offline."],
  ["manteen agent", "Read or install the packaged Manteen agent guidance."],
];

export function Commands() {
  return (
    <div>
      <h2 className={cn(h2, "mb-2 text-center")}>One CLI, nine verbs.</h2>
      <p className="mb-8 text-center text-fd-muted-foreground">
        Run them from the application root. The installed binary is always the authority.
      </p>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border bg-fd-border shadow-lg md:grid-cols-2 xl:grid-cols-3">
        {commands.map(([name, purpose]) => (
          <div key={name} className="bg-fd-card p-5">
            <code className="font-mono text-sm font-medium text-brand">{name}</code>
            <p className="mt-2 text-sm text-fd-muted-foreground">{purpose}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center">
        <Link href="/docs/reference/cli" className={textLink}>
          Read the CLI reference
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
