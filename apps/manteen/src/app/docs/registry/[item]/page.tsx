import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistryItemDetail } from "@/components/registry-item-detail";
import { readCompiledRegistry } from "@/lib/compiled-registry";

export const dynamicParams = false;

export async function generateStaticParams() {
  const registry = await readCompiledRegistry();
  return registry.items.map((item) => ({ item: item.name }));
}

export default async function Page(props: PageProps<"/docs/registry/[item]">) {
  const { item: itemName } = await props.params;
  const registry = await readCompiledRegistry();
  const item = registry.getItem(itemName);
  if (!item) notFound();
  const title = item.title ?? item.name;
  const description = item.description ?? "No authored description is present for this item.";

  return (
    <DocsPage toc={[]} full>
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription>{description}</DocsDescription>
      <DocsBody className="max-w-none">
        <RegistryItemDetail item={item} registry={registry} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(
  props: PageProps<"/docs/registry/[item]">,
): Promise<Metadata> {
  const { item: itemName } = await props.params;
  const registry = await readCompiledRegistry();
  const item = registry.getItem(itemName);
  if (!item) notFound();
  const title = item.title ?? item.name;

  return {
    title: `${title} registry item`,
    description: item.description ?? "Compiled Manteen registry item.",
  };
}
