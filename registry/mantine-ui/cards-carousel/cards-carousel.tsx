/**
 * Adapted from Mantine UI's CardsCarousel at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Carousel, type CarouselProps } from "@mantine/carousel";
import {
  type BoxProps,
  Button,
  type ElementProps,
  type Factory,
  factory,
  type GetStylesApi,
  Paper,
  type StylesApiProps,
  Text,
  Title,
  useMantineTheme,
  useProps,
  useStyles,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import classes from "./cards-carousel.module.css";

export type CardsCarouselStylesNames = "root" | "card" | "title" | "category";

export interface CardsCarouselItem {
  id: string;
  image: string;
  title: string;
  category: string;
  href?: string;
}

export interface CardsCarouselProps
  extends BoxProps,
    StylesApiProps<CardsCarouselFactory>,
    ElementProps<"div", "onSelect"> {
  items: readonly CardsCarouselItem[];
  actionLabel?: string;
  onSelect?: (item: CardsCarouselItem) => void;
  /** Overrides the responsive default slide width (100% below `sm`, 50% above). */
  slideSize?: CarouselProps["slideSize"];
  /** Overrides how many slides advance per navigation (default 1 below `sm`, 2 above). */
  slidesToScroll?: number;
}

export type CardsCarouselFactory = Factory<{
  props: CardsCarouselProps;
  ref: HTMLDivElement;
  stylesNames: CardsCarouselStylesNames;
}>;

interface CarouselItemCardProps {
  item: CardsCarouselItem;
  actionLabel: string;
  onSelect?: (item: CardsCarouselItem) => void;
  getStyles: GetStylesApi<CardsCarouselFactory>;
  unstyled: boolean | undefined;
}

function CarouselItemCard({
  item,
  actionLabel,
  onSelect,
  getStyles,
  unstyled,
}: CarouselItemCardProps) {
  const action = item.href ? (
    <Button component="a" href={item.href} variant="white" color="dark">
      {actionLabel}
    </Button>
  ) : onSelect ? (
    <Button variant="white" color="dark" onClick={() => onSelect(item)}>
      {actionLabel}
    </Button>
  ) : null;

  return (
    <Paper
      shadow="md"
      p="xl"
      radius="md"
      unstyled={unstyled}
      {...getStyles("card", {
        style: {
          backgroundImage: `linear-gradient(rgb(0 0 0 / 55%), rgb(0 0 0 / 55%)), url(${item.image})`,
        },
      })}
    >
      <div>
        <Text {...getStyles("category")} size="xs">
          {item.category}
        </Text>
        <Title order={3} {...getStyles("title")}>
          {item.title}
        </Title>
      </div>
      {action}
    </Paper>
  );
}

export const CardsCarousel = factory<CardsCarouselFactory>((_props) => {
  const props = useProps("CardsCarousel", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    items,
    actionLabel = "View",
    onSelect,
    slideSize,
    slidesToScroll,
    ...others
  } = props;

  const getStyles = useStyles<CardsCarouselFactory>({
    name: "CardsCarousel",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
  });

  const theme = useMantineTheme();
  const mobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <Carousel
      ref={ref}
      slideSize={slideSize ?? { base: "100%", sm: "50%" }}
      slideGap={2}
      emblaOptions={{ align: "start", slidesToScroll: slidesToScroll ?? (mobile ? 1 : 2) }}
      nextControlProps={{ "aria-label": "Next slide" }}
      previousControlProps={{ "aria-label": "Previous slide" }}
      unstyled={unstyled}
      {...getStyles("root")}
      {...others}
    >
      {items.map((item) => (
        <Carousel.Slide key={item.id}>
          <CarouselItemCard
            item={item}
            actionLabel={actionLabel}
            onSelect={onSelect}
            getStyles={getStyles}
            unstyled={unstyled}
          />
        </Carousel.Slide>
      ))}
    </Carousel>
  );
});

CardsCarousel.classes = classes;
CardsCarousel.displayName = "CardsCarousel";

export namespace CardsCarousel {
  export type Props = CardsCarouselProps;
  export type StylesNames = CardsCarouselStylesNames;
  export type Factory = CardsCarouselFactory;
}
