import { HeroImageRight } from "@/components/ui/hero-image-right";

export function MarketingHero() {
  return (
    <HeroImageRight
      titleBefore="A"
      highlightedText="fully featured"
      titleAfter="component library for your product"
      description="Build fully functional, accessible interfaces faster — a complete kit of components and hooks that cover you in any situation."
      primaryButtonLabel="Get started"
      onPrimaryButtonClick={() => console.log("get started")}
      secondaryButtonLabel="View pricing"
      secondaryButtonHref="/pricing"
      backgroundImageUrl="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1080&q=80"
    />
  );
}
