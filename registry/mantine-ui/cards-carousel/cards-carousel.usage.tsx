import { CardsCarousel, type CardsCarouselItem } from "@/components/ui/cards-carousel";

const items: CardsCarouselItem[] = [
  {
    id: "1",
    image:
      "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=1080&q=80",
    title: "Best forests to visit in North America",
    category: "Nature",
    href: "/articles/best-forests",
  },
  {
    id: "2",
    image:
      "https://images.unsplash.com/photo-1508193638397-1c4234db14d8?auto=format&fit=crop&w=1080&q=80",
    title: "Hiking gear you actually need",
    category: "Outdoors",
  },
  {
    id: "3",
    image:
      "https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=1080&q=80",
    title: "Planning a coastal road trip",
    category: "Travel",
    href: "/articles/coastal-road-trip",
  },
];

export function FeaturedDestinations() {
  return (
    <CardsCarousel
      items={items}
      actionLabel="Read more"
      onSelect={(item) => console.log("selected", item.id)}
    />
  );
}
