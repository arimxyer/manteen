/**
 * Adapted from Mantine UI's HeroImageRight at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Button, Container, Group, Text, Title } from "@mantine/core";

import classes from "./hero-image-right.module.css";

export interface HeroImageRightProps {
  /** Text rendered before the highlighted word/phrase. */
  titleBefore?: string;
  /** Highlighted word/phrase in the headline, rendered with a gradient. */
  highlightedText?: string;
  /** Text rendered after the highlighted word/phrase. */
  titleAfter?: string;
  description?: string;
  primaryButtonLabel?: string;
  primaryButtonHref?: string;
  onPrimaryButtonClick?: () => void;
  /** Optional secondary CTA; omitted entirely unless a label is supplied. */
  secondaryButtonLabel?: string;
  secondaryButtonHref?: string;
  onSecondaryButtonClick?: () => void;
  /**
   * URL of the photo shown behind the gradient overlay on the right side of
   * the hero. Upstream hardcodes an Unsplash photo here; this port ships
   * with none so the hero renders as a plain gradient panel until a
   * consumer opts into a third-party (or self-hosted) image host.
   */
  backgroundImageUrl?: string;
}

export function HeroImageRight({
  titleBefore = "A",
  highlightedText = "fully featured",
  titleAfter = "React components library",
  description = "Build fully functional accessible web applications with ease – Mantine includes more than 100 customizable components and hooks to cover you in any situation",
  primaryButtonLabel = "Get started",
  primaryButtonHref,
  onPrimaryButtonClick,
  secondaryButtonLabel,
  secondaryButtonHref,
  onSecondaryButtonClick,
  backgroundImageUrl,
}: HeroImageRightProps) {
  return (
    <div
      className={classes.root}
      style={
        backgroundImageUrl
          ? {
              backgroundImage: `linear-gradient(250deg, rgba(130, 201, 30, 0) 0%, #062343 70%), url(${backgroundImageUrl})`,
            }
          : undefined
      }
    >
      <Container size="lg">
        <div className={classes.inner}>
          <div className={classes.content}>
            <Title className={classes.title}>
              {titleBefore}{" "}
              <Text
                component="span"
                inherit
                variant="gradient"
                gradient={{ from: "pink", to: "yellow" }}
              >
                {highlightedText}
              </Text>{" "}
              {titleAfter}
            </Title>

            <Text className={classes.description} mt={30}>
              {description}
            </Text>

            <Group mt={40}>
              {primaryButtonHref ? (
                <Button
                  component="a"
                  href={primaryButtonHref}
                  variant="gradient"
                  gradient={{ from: "pink", to: "yellow" }}
                  size="xl"
                  className={classes.control}
                >
                  {primaryButtonLabel}
                </Button>
              ) : (
                <Button
                  onClick={onPrimaryButtonClick}
                  variant="gradient"
                  gradient={{ from: "pink", to: "yellow" }}
                  size="xl"
                  className={classes.control}
                >
                  {primaryButtonLabel}
                </Button>
              )}

              {secondaryButtonLabel &&
                (secondaryButtonHref ? (
                  <Button
                    component="a"
                    href={secondaryButtonHref}
                    variant="default"
                    size="xl"
                    className={classes.control}
                  >
                    {secondaryButtonLabel}
                  </Button>
                ) : (
                  <Button
                    onClick={onSecondaryButtonClick}
                    variant="default"
                    size="xl"
                    className={classes.control}
                  >
                    {secondaryButtonLabel}
                  </Button>
                ))}
            </Group>
          </div>
        </div>
      </Container>
    </div>
  );
}
