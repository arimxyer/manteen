import { Carousel } from "@mantine/carousel";
import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconRocket } from "@tabler/icons-react";

import { useReleaseCarousel } from "@/hooks/use-release-carousel";

import classes from "./release-panel.module.css";

export interface ReleaseHighlight {
  id: string;
  title: string;
  description: string;
  category?: string;
}

export interface ReleasePanelProps {
  version: string;
  highlights: ReleaseHighlight[];
  initialSlide?: number;
}

export function ReleasePanel({ version, highlights, initialSlide = 0 }: ReleasePanelProps) {
  const carousel = useReleaseCarousel(initialSlide);

  return (
    <Paper className={classes.root} aria-label={`Release ${version} highlights`}>
      <Group className={classes.header} justify="space-between" align="flex-start">
        <Group gap="sm">
          <ThemeIcon size="lg" radius="md" variant="light">
            <IconRocket aria-hidden="true" size={20} />
          </ThemeIcon>
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Now available
            </Text>
            <Title order={2} size="h3">
              Release {version}
            </Title>
          </div>
        </Group>
        <Badge variant="light">
          {highlights.length === 0 ? 0 : carousel.activeSlide + 1} / {highlights.length}
        </Badge>
      </Group>

      {highlights.length > 0 ? (
        <Carousel
          initialSlide={initialSlide}
          onSlideChange={carousel.onSlideChange}
          slideGap="md"
          withControls={highlights.length > 1}
          withIndicators={highlights.length > 1}
        >
          {highlights.map((highlight) => (
            <Carousel.Slide key={highlight.id}>
              <Stack className={classes.slide} gap="xs">
                {highlight.category && <Badge variant="outline">{highlight.category}</Badge>}
                <Title order={3} size="h4">
                  {highlight.title}
                </Title>
                <Text c="dimmed">{highlight.description}</Text>
              </Stack>
            </Carousel.Slide>
          ))}
        </Carousel>
      ) : (
        <Text className={classes.slide} c="dimmed">
          No release highlights are available yet.
        </Text>
      )}
    </Paper>
  );
}
