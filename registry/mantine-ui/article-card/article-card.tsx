/**
 * Adapted from Mantine UI's ArticleCard at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import {
  ActionIcon,
  Avatar,
  Badge,
  type BoxProps,
  Card,
  type ElementProps,
  type Factory,
  factory,
  Group,
  Image,
  type StylesApiProps,
  Text,
  useProps,
  useStyles,
} from "@mantine/core";
import { IconBookmarkFilled, IconHeartFilled, IconShare2 } from "@tabler/icons-react";

import classes from "./article-card.module.css";

export type ArticleCardStylesNames = "root" | "image" | "rating" | "title" | "footer" | "action";

export interface ArticleCardProps
  extends BoxProps,
    StylesApiProps<ArticleCardFactory>,
    ElementProps<"div", "title"> {
  image: string;
  title: string;
  description: string;
  authorName: string;
  authorAvatar?: string;
  rating?: string;
  href: string;
  onLike?: () => void;
  onBookmark?: () => void;
  onShare?: () => void;
}

export type ArticleCardFactory = Factory<{
  props: ArticleCardProps;
  ref: HTMLDivElement;
  stylesNames: ArticleCardStylesNames;
}>;

export const ArticleCard = factory<ArticleCardFactory>((_props) => {
  const props = useProps("ArticleCard", null, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    ref,
    image,
    title,
    description,
    authorName,
    authorAvatar,
    rating,
    href,
    onLike,
    onBookmark,
    onShare,
    ...others
  } = props;
  const getStyles = useStyles<ArticleCardFactory>({
    name: "ArticleCard",
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
  const hasActions = Boolean(onLike || onBookmark || onShare);

  return (
    <Card ref={ref} withBorder radius="md" unstyled={unstyled} {...getStyles("root")} {...others}>
      <Card.Section component="a" href={href}>
        <Image src={image} height={180} alt={title} {...getStyles("image")} />
      </Card.Section>

      {rating && (
        <Badge
          {...getStyles("rating")}
          variant="gradient"
          gradient={{ from: "indigo.8", to: "violet.8", deg: 145 }}
        >
          {rating}
        </Badge>
      )}

      <Text {...getStyles("title")} component="a" href={href}>
        {title}
      </Text>

      <Text fz="sm" lineClamp={4} opacity={0.9}>
        {description}
      </Text>

      <Group justify="space-between" {...getStyles("footer")}>
        <Group gap="xs">
          <Avatar src={authorAvatar} size={24} alt="" />
          <Text fz="sm">{authorName}</Text>
        </Group>

        {hasActions && (
          <Group gap={8}>
            {onLike && (
              <ActionIcon
                variant="subtle"
                {...getStyles("action")}
                aria-label="Like"
                onClick={onLike}
              >
                <IconHeartFilled size={16} color="var(--mantine-color-red-6)" />
              </ActionIcon>
            )}
            {onBookmark && (
              <ActionIcon
                variant="subtle"
                {...getStyles("action")}
                aria-label="Bookmark"
                onClick={onBookmark}
              >
                <IconBookmarkFilled size={16} color="var(--mantine-color-yellow-7)" />
              </ActionIcon>
            )}
            {onShare && (
              <ActionIcon
                variant="subtle"
                {...getStyles("action")}
                aria-label="Share"
                onClick={onShare}
              >
                <IconShare2 size={16} color="var(--mantine-color-cyan-6)" />
              </ActionIcon>
            )}
          </Group>
        )}
      </Group>
    </Card>
  );
});

ArticleCard.classes = classes;
ArticleCard.displayName = "ArticleCard";

export namespace ArticleCard {
  export type Props = ArticleCardProps;
  export type StylesNames = ArticleCardStylesNames;
  export type Factory = ArticleCardFactory;
}
