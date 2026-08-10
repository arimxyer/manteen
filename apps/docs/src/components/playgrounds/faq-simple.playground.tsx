import {
  FaqSimple,
  type FaqSimpleItem,
  type FaqSimpleProps,
} from "../../../../../registry/mantine-ui/faq-simple/faq-simple";
import type { PlaygroundAdapter } from "./contract";

// Kept short (1-2 sentences each) per the porter's preview hint: FaqSimple doesn't clamp
// answer height, so a long paragraph would make the open panel tall in a small stage.
const ITEMS: FaqSimpleItem[] = [
  {
    question: "How do I reset my password?",
    answer:
      'Open Settings → Security and select "Reset password." We\'ll email a link that expires in 30 minutes.',
  },
  {
    question: "Can I invite teammates?",
    answer:
      "Yes — invite unlimited teammates from Settings → Members; they join your existing billing plan.",
  },
  {
    question: "Do you store card details?",
    answer:
      "No — payments run through our PCI-compliant processor, so we never see or store raw card numbers.",
  },
];

const adapter: PlaygroundAdapter = {
  item: "faq-simple",
  defaultProps: {
    title: "Frequently Asked Questions",
    variant: "separated",
    chevronLeft: false,
    // Per the porter's preview hint: a collapsed all-closed accordion reads as flat grey
    // stripes and hides that this is even an accordion, so the demo starts with one open.
    openFirst: true,
  },
  controls: [
    { kind: "text", prop: "title", label: "Title", wide: true },
    {
      kind: "select",
      prop: "variant",
      label: "Variant",
      options: [
        { label: "Separated", value: "separated" },
        { label: "Default", value: "default" },
        { label: "Contained", value: "contained" },
        { label: "Filled", value: "filled" },
      ],
    },
    { kind: "switch", prop: "chevronLeft", label: "Chevron left" },
    { kind: "switch", prop: "openFirst", label: "Open first" },
  ],
  render: (props) => (
    // `defaultValue` only applies on mount (Accordion manages open state itself), so the
    // "Open first" switch needs a key change to force a remount when it flips — otherwise
    // toggling it after mount would silently do nothing to the live render.
    <FaqSimple
      key={props.openFirst ? "open" : "closed"}
      title={String(props.title) || "Frequently Asked Questions"}
      items={ITEMS}
      variant={String(props.variant) as FaqSimpleProps["variant"]}
      chevronPosition={props.chevronLeft ? "left" : undefined}
      defaultValue={props.openFirst ? "faq-0" : undefined}
    />
  ),
  renderJsx: (props) => {
    // Mirror the live render's fallback: an emptied title control still shows the
    // component's own default in the preview, so Copy JSX must not hand back title="".
    const title = String(props.title) || "Frequently Asked Questions";
    const chevronProp = props.chevronLeft ? '\n      chevronPosition="left"' : "";
    const defaultValueProp = props.openFirst ? '\n      defaultValue="faq-0"' : "";

    return `import { FaqSimple, type FaqSimpleItem } from "@/components/ui/faq-simple";

const items: FaqSimpleItem[] = [
  {
    question: "How do I reset my password?",
    answer:
      'Open Settings → Security and select "Reset password." We\\'ll email a link that expires in 30 minutes.',
  },
  {
    question: "Can I invite teammates?",
    answer:
      "Yes — invite unlimited teammates from Settings → Members; they join your existing billing plan.",
  },
  {
    question: "Do you store card details?",
    answer:
      "No — payments run through our PCI-compliant processor, so we never see or store raw card numbers.",
  },
];

export function SupportFaq() {
  return (
    <FaqSimple
      title=${JSON.stringify(title)}
      items={items}
      variant=${JSON.stringify(props.variant)}${chevronProp}${defaultValueProp}
    />
  );
}`;
  },
  stage: {
    // Component wraps in Container size="sm": verified via node_modules/@mantine/core
    // styles.css (--container-size-sm: 45rem, i.e. 720px, not the "sm" *breakpoint* of
    // 36em/576px — those are different scales and easy to conflate). Not full-bleed, so
    // sizing the stage to that outer edge keeps the preview honest about how narrow it reads.
    desktopWidth: "min(45rem, 100%)",
    minHeight: "28rem",
  },
};

export default adapter;
