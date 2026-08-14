import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight, Braces, FileJson, GitCompareArrows, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { HeroWater } from "@/app/(home)/hero-water";
import { InstallTerminal } from "@/app/(home)/install-terminal";
import { cn } from "@/lib/cn";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-medium tracking-tight text-brand-foreground transition-colors hover:bg-brand-hover";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full border bg-fd-secondary px-5 py-3 font-medium tracking-tight text-fd-secondary-foreground transition-colors hover:bg-fd-accent";

const card = "rounded-2xl border bg-fd-card p-6 text-sm shadow-lg";

const band = "grid grid-cols-1 gap-10 lg:grid-cols-2";

const h2 = "text-3xl font-medium tracking-tight lg:text-4xl";
const h3 = "text-xl font-medium tracking-tight lg:text-2xl";

const textLink =
  "inline-flex items-center gap-1.5 font-medium text-brand transition-opacity hover:opacity-70";

const catalog = `{
  "name": "acme-registry",
  "namespace": "@acme",
  "items": [
    {
      "name": "release-panel",
      "kind": "block",
      "mantine": ">=9 <10",
      "provider": true,
      "npm": ["@mantine/core@^9"],
      "files": [
        {
          "path": "src/release-panel.tsx",
          "as": "component",
          "target": "@ui/release-panel.tsx"
        }
      ]
    }
  ]
}`;

const plannedUpdate = `# Read the plan, keep its digest
manteen update @house/article-card --dry-run --json

# Apply only if nothing moved underneath it
manteen update @house/article-card --expect-plan <sha256> --json`;

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

/**
 * The specifics under each band's copy. Every key is a real field, path, or command — the
 * authoring vocabulary comes from `manteen.registry.schema.json`, the rest from the pages each
 * card links to.
 */
const authoringFields: [string, string][] = [
  ["kind", "component, block, hook, lib, theme, or file"],
  ["mantine", "the consumer compatibility gate"],
  ["provider", "whether MantineProvider is required"],
  ["npm, css", "packages and stylesheets the item needs"],
  ["stylesApi, props", "the surface consumers style and pass"],
];

const compiledOutput: [string, string][] = [
  ["registry.json", "the catalog index clients discover"],
  ["<item>.json", "one installable document per item"],
  ["manteen-kit build", "validates both, and refuses rather than emitting partial output"],
];

const ownershipState: [string, string][] = [
  ["manteen.lock.json", "the receipt recording what Manteen owns"],
  [".manteen/bases/", "pristine upstream source, kept for comparison"],
  ["manteen diff", "local, base, and upstream side by side"],
  ["manteen status", "local health, assessed without registry access"],
];

const sourceMap: [string, string][] = [
  ["Author", "manteen.registry.json"],
  ["Compile", "/r/article-card.json"],
  ["Own", "components/ui/article-card.tsx"],
];

export default function HomePage() {
  return (
    <main className="pt-4 pb-6 md:pb-12">
      <div className="relative mx-auto flex h-[70vh] max-h-[820px] min-h-[560px] w-full max-w-[1400px] overflow-hidden rounded-2xl border bg-fd-card bg-origin-border">
        {/* Painted first so the hero still reads as designed wherever WebGL does not run. */}
        <div className="hero-grid absolute inset-0" />
        <div className="hero-glow absolute inset-0" />
        <HeroWater />
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

      {/* Each band owns its own two-column grid. A shared outer grid would scope a band's
          `row-start` to the page rather than to the band, which silently overlaps neighbours. */}
      <div className="mx-auto mt-12 flex w-full max-w-[1400px] flex-col gap-10 px-6 md:px-12 lg:mt-20">
        <p className="text-2xl leading-snug font-light tracking-tight md:text-3xl xl:text-4xl">
          Manteen is a <span className="font-medium text-brand">Mantine-native</span> registry
          toolchain. Components arrive as{" "}
          <span className="font-medium text-brand">source you edit</span>, not a dependency you wrap
          — and every install, diff, and update is a{" "}
          <span className="font-medium text-brand">plan you read first</span>.
        </p>

        <TryItOut />
        <Authoring />
        <Interop />
        <Ownership />
        <Commands />
        <Closing />
      </div>

      <footer className="mx-auto mt-16 w-full max-w-[1400px] border-t px-6 pt-6 text-xs text-fd-muted-foreground md:px-12">
        <p>Manteen is an independent project and is not affiliated with the Mantine team.</p>
      </footer>
    </main>
  );
}

function TryItOut() {
  return (
    <div>
      <div className="mx-auto w-full max-w-[860px] rounded-2xl border bg-fd-card p-2 shadow-lg">
        <div className="flex flex-row gap-2 max-sm:flex-col">
          <h2 className="content-center rounded-xl border-2 border-brand/40 px-3 py-1 font-mono text-sm font-bold text-brand uppercase max-sm:text-center">
            Try it out
          </h2>
          <ServerCodeBlock
            code="npm install --save-dev manteen"
            lang="bash"
            codeblock={{ className: "flex-1 bg-fd-secondary my-0" }}
          />
        </div>

        {/* The terminal chrome moved into the client component: its header carries the
            rotation indicator, which only that component knows the state of. */}
        <InstallTerminal className="mt-2" />
      </div>
    </div>
  );
}

/** The key/detail rows shared by all three copy cards. */
function DetailList({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-1 mb-6 flex flex-col gap-2.5 border-t pt-5 text-xs">
      {items.map(([key, detail]) => (
        <li key={key} className="flex flex-col gap-x-3 sm:flex-row">
          <code className="shrink-0 font-mono text-fd-foreground sm:w-36">{key}</code>
          <span className="text-fd-muted-foreground">{detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Authoring() {
  return (
    <div className={band}>
      <div className={cn(card, "flex flex-col")}>
        <Braces className="mb-4 text-brand" aria-hidden="true" />
        <h3 className={cn(h3, "mb-4")}>Author for Mantine, not the wire format.</h3>
        <p className="mb-4 text-fd-muted-foreground">
          Describe Mantine compatibility, provider needs, npm packages, and destinations in the
          vocabulary your registry actually uses. Unknown fields are rejected rather than silently
          discarded, and <code className="font-mono text-fd-foreground">manteen-kit</code> owns the
          interchange details.
        </p>
        <DetailList items={authoringFields} />
        <Link href="/docs/registry-authors" className={cn(textLink, "mt-auto")}>
          Read the authoring guide
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <ServerCodeBlock
        lang="json"
        code={catalog}
        codeblock={{ title: "manteen.registry.json", className: "my-0 shadow-lg" }}
      />
    </div>
  );
}

function Interop() {
  const flow: [string, string][] = [
    ["Author catalog", "Mantine vocabulary"],
    ["Static contract", "/r/*.json"],
    ["Consumer project", "editable source"],
  ];

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
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function Ownership() {
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
          <ArrowRight className="size-4" aria-hidden="true" />
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

function Commands() {
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

function Closing() {
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
