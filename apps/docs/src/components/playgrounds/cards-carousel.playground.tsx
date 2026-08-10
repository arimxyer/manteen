import "@mantine/carousel/styles.css";

import {
  CardsCarousel,
  type CardsCarouselItem,
} from "../../../../../registry/mantine-ui/cards-carousel/cards-carousel";
import type { PlaygroundAdapter } from "./contract";

const IMAGE_FORESTS =
  "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=1080&q=80";
const IMAGE_HIKING =
  "https://images.unsplash.com/photo-1508193638397-1c4234db14d8?auto=format&fit=crop&w=1080&q=80";
const IMAGE_COASTAL =
  "https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=1080&q=80";

const adapter: PlaygroundAdapter = {
  item: "cards-carousel",
  defaultProps: {
    title: "Best forests to visit in North America",
    category: "Nature",
    actionLabel: "View",
    onSelectEnabled: true,
  },
  controls: [
    { kind: "text", prop: "title", label: "First card title", wide: true },
    { kind: "text", prop: "category", label: "First card category", compact: true },
    { kind: "text", prop: "actionLabel", label: "Action label", compact: true },
    { kind: "switch", prop: "onSelectEnabled", label: "onSelect" },
  ],
  render: (props, recordEvent, context) => {
    // Deliberately NO href on any demo item: href-items render permanent link buttons the
    // onSelect toggle cannot remove, so mixing the two made the toggle strip only one of
    // three buttons. All-callback items keep the buttons uniform and the toggle honest;
    // the href variant stays documented in the props table and the copied JSX comment.
    const items: CardsCarouselItem[] = [
      {
        id: "1",
        image: IMAGE_FORESTS,
        title: String(props.title) || "Untitled",
        category: String(props.category) || "Uncategorized",
      },
      {
        id: "2",
        image: IMAGE_HIKING,
        title: "Hiking gear you actually need",
        category: "Outdoors",
      },
      {
        id: "3",
        image: IMAGE_COASTAL,
        title: "Planning a coastal road trip",
        category: "Travel",
      },
    ];

    // The component's own responsive defaults watch the real viewport, which the shell's
    // mobile toggle cannot change (it only narrows the slot) — so the simulated mobile view
    // passes explicit one-card-per-view sizing through the component's public overrides.
    const mobile = context.viewport === "mobile";

    return (
      <CardsCarousel
        items={items}
        actionLabel={String(props.actionLabel) || "View"}
        slideSize={mobile ? "100%" : undefined}
        slidesToScroll={mobile ? 1 : undefined}
        onSelect={
          props.onSelectEnabled ? (item) => recordEvent(`onSelect: ${item.title}`) : undefined
        }
      />
    );
  },
  renderJsx: (props) => {
    const onSelectProp = props.onSelectEnabled
      ? '\n      onSelect={(item) => console.log("selected", item.id)}'
      : "";

    return `import { CardsCarousel, type CardsCarouselItem } from "@/components/ui/cards-carousel";

// Give an item \`href\` to render its action as a link instead of the onSelect button.
const items: CardsCarouselItem[] = [
  {
    id: "1",
    image: ${JSON.stringify(IMAGE_FORESTS)},
    title: ${JSON.stringify(props.title)},
    category: ${JSON.stringify(props.category)},
  },
  {
    id: "2",
    image: ${JSON.stringify(IMAGE_HIKING)},
    title: "Hiking gear you actually need",
    category: "Outdoors",
  },
  {
    id: "3",
    image: ${JSON.stringify(IMAGE_COASTAL)},
    title: "Planning a coastal road trip",
    category: "Travel",
  },
];

export function FeaturedDestinations() {
  return (
    <CardsCarousel
      items={items}
      actionLabel=${JSON.stringify(props.actionLabel)}${onSelectProp}
    />
  );
}`;
  },
  stage: {
    desktopWidth: "100%",
  },
};

export default adapter;
