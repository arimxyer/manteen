/**
 * Adapted from Mantine UI's FaqSimple at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Accordion, type AccordionProps, Container, Title, type TitleOrder } from "@mantine/core";
import type { ReactNode } from "react";

import classes from "./faq-simple.module.css";

export interface FaqSimpleItem {
  question: string;
  answer: ReactNode;
  /** Accordion item value; derived from the item's index when omitted. */
  value?: string;
}

export interface FaqSimpleProps {
  title?: ReactNode;
  /**
   * Heading level for `title`. Upstream leaves this at Mantine's `Title`
   * default (1); a dropped-in section defaulting to another page-level `h1`
   * is a heading-hierarchy bug, so this port defaults to 2 instead and
   * exposes the level as a real choice.
   */
  titleOrder?: TitleOrder;
  items: FaqSimpleItem[];
  /** Accordion item border/background treatment. Upstream always used "separated". */
  variant?: AccordionProps["variant"];
  /** Which side the expand chevron renders on. */
  chevronPosition?: AccordionProps["chevronPosition"];
  /**
   * Heading level (2-6) each `Accordion.Control` renders inside. Upstream
   * leaves Accordion's `order` unset, so its controls are bare buttons with
   * no place in the page's heading outline; Mantine's own docs recommend
   * setting it to meet WAI-ARIA accessibility requirements. Defaults one
   * level below `titleOrder`.
   */
  controlOrder?: AccordionProps["order"];
  /** Value of the item that starts expanded; nothing is expanded by default. */
  defaultValue?: string;
}

export function FaqSimple({
  title = "Frequently Asked Questions",
  titleOrder = 2,
  items,
  variant = "separated",
  chevronPosition,
  controlOrder,
  defaultValue,
}: FaqSimpleProps) {
  const resolvedControlOrder =
    controlOrder ?? (Math.min(Math.max(titleOrder + 1, 2), 6) as AccordionProps["order"]);

  return (
    <Container size="sm" className={classes.wrapper}>
      <Title ta="center" order={titleOrder} className={classes.title}>
        {title}
      </Title>

      <Accordion
        variant={variant}
        chevronPosition={chevronPosition}
        order={resolvedControlOrder}
        defaultValue={defaultValue}
      >
        {items.map((item, index) => (
          <Accordion.Item
            className={classes.item}
            value={item.value ?? `faq-${index}`}
            key={item.value ?? `faq-${index}`}
          >
            <Accordion.Control>{item.question}</Accordion.Control>
            <Accordion.Panel>{item.answer}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  );
}
