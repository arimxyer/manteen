/**
 * Adapted from Mantine UI's ArticleCard at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { ActionIcon, Avatar, Badge, Card, Group, Image, Text } from "@mantine/core";
import { IconBookmarkFilled, IconHeartFilled, IconShare2 } from "@tabler/icons-react";

import classes from "./article-card.module.css";

export interface ArticleCardProps {
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

export function ArticleCard({
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
}: ArticleCardProps) {
  const hasActions = Boolean(onLike || onBookmark || onShare);

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Card.Section component="a" href={href}>
        <Image src={image} height={180} alt={title} className={classes.image} />
      </Card.Section>

      {rating && (
        <Badge
          className={classes.rating}
          variant="gradient"
          gradient={{ from: "indigo.8", to: "violet.8", deg: 145 }}
        >
          {rating}
        </Badge>
      )}

      <Text className={classes.title} component="a" href={href}>
        {title}
      </Text>

      <Text fz="sm" lineClamp={4} opacity={0.9}>
        {description}
      </Text>

      <Group justify="space-between" className={classes.footer}>
        <Group gap="xs">
          <Avatar src={authorAvatar} size={24} alt="" />
          <Text fz="sm">{authorName}</Text>
        </Group>

        {hasActions && (
          <Group gap={8}>
            {onLike && (
              <ActionIcon
                variant="subtle"
                className={classes.action}
                aria-label="Like"
                onClick={onLike}
              >
                <IconHeartFilled size={16} color="var(--mantine-color-red-6)" />
              </ActionIcon>
            )}
            {onBookmark && (
              <ActionIcon
                variant="subtle"
                className={classes.action}
                aria-label="Bookmark"
                onClick={onBookmark}
              >
                <IconBookmarkFilled size={16} color="var(--mantine-color-yellow-7)" />
              </ActionIcon>
            )}
            {onShare && (
              <ActionIcon
                variant="subtle"
                className={classes.action}
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
}
