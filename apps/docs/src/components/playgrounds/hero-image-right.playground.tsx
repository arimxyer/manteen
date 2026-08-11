import { HeroImageRight } from "../../../../../registry/mantine-ui/hero-image-right/hero-image-right";
import type { PlaygroundAdapter } from "./contract";

const DESCRIPTION =
  "Build fully functional, accessible interfaces faster — a complete kit of components and hooks that cover you in any situation.";
const IMAGE_EARTH =
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1080&q=80";
const IMAGE_EARTH_CATALOG = IMAGE_EARTH.replace("w=1080&q=80", "w=360&q=55");

const adapter: PlaygroundAdapter = {
  item: "hero-image-right",
  defaultProps: {
    highlightedText: "fully featured",
    titleAfter: "component library for your product",
    backgroundImage: true,
    secondaryButton: true,
  },
  controls: [
    { kind: "text", prop: "highlightedText", label: "Highlighted phrase" },
    { kind: "text", prop: "titleAfter", label: "Title (after highlight)", wide: true },
    { kind: "switch", prop: "backgroundImage", label: "Background photo" },
    { kind: "switch", prop: "secondaryButton", label: "Secondary button" },
  ],
  // HeroImageRight's stacking breakpoint (`.title`/`.control` at max-width: 62em) is a plain
  // CSS module `@media` rule tied to the REAL browser viewport, not a component prop or a
  // container query — same category of gap as header-mega-menu's `visibleFrom`/`hiddenFrom`,
  // which the contract calls out. The difference here is there is no override to reach for:
  // header-mega-menu forces Mantine's own stable `mantine-visible-from-sm` classes, and
  // cards-carousel passes real `slideSize`/`slidesToScroll` props — HeroImageRight exposes
  // neither a prop nor a stable class hook for its breakpoint (its classes are CSS-module
  // hashed, scoped to its own module import), so `context.viewport` is deliberately left
  // unconsumed rather than faked. On a wide reader viewport the shell's mobile toggle will
  // narrow the stage slot without visibly reflowing the title size or button width; it only
  // matches the component's real behavior when the reader's actual browser window is
  // narrower than 992px (62em).
  render: (props, recordEvent, context) => (
    <HeroImageRight
      highlightedText={String(props.highlightedText) || "fully featured"}
      titleAfter={String(props.titleAfter) || "component library for your product"}
      description={DESCRIPTION}
      primaryButtonLabel="Get started"
      onPrimaryButtonClick={() => recordEvent("onPrimaryButtonClick")}
      secondaryButtonLabel={props.secondaryButton ? "View pricing" : undefined}
      onSecondaryButtonClick={
        props.secondaryButton ? () => recordEvent("onSecondaryButtonClick") : undefined
      }
      backgroundImageUrl={
        props.backgroundImage
          ? context.surface === "catalog"
            ? IMAGE_EARTH_CATALOG
            : IMAGE_EARTH
          : undefined
      }
    />
  ),
  renderJsx: (props) => {
    const secondaryProps = props.secondaryButton
      ? `\n      secondaryButtonLabel="View pricing"\n      onSecondaryButtonClick={() => {}}`
      : "";
    const imageProp = props.backgroundImage
      ? `\n      backgroundImageUrl=${JSON.stringify(IMAGE_EARTH)}`
      : "";

    return `import { HeroImageRight } from "@/components/ui/hero-image-right";

export function MarketingHero() {
  return (
    <HeroImageRight
      highlightedText=${JSON.stringify(props.highlightedText)}
      titleAfter=${JSON.stringify(props.titleAfter)}
      description=${JSON.stringify(DESCRIPTION)}
      primaryButtonLabel="Get started"
      onPrimaryButtonClick={() => {}}${secondaryProps}${imageProp}
    />
  );
}`;
  },
  stage: {
    desktopWidth: "100%",
    minHeight: "28rem",
  },
};

export default adapter;
