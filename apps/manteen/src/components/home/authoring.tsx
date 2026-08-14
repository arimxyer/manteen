import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight, Braces } from "lucide-react";
import Link from "next/link";
import { DetailList } from "@/components/home/detail-list";
import { band, card, h3, textLink } from "@/components/home/styles";
import { cn } from "@/lib/cn";

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

/** Every key is a real field; the `kind` values come from `manteen.registry.schema.json`. */
const authoringFields: [string, string][] = [
  ["kind", "component, block, hook, lib, theme, or file"],
  ["mantine", "the consumer compatibility gate"],
  ["provider", "whether MantineProvider is required"],
  ["npm, css", "packages and stylesheets the item needs"],
  ["stylesApi, props", "the surface consumers style and pass"],
];

export function Authoring() {
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
