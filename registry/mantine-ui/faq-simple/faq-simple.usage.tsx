import { FaqSimple, type FaqSimpleItem } from "@ui/faq-simple";

const items: FaqSimpleItem[] = [
  {
    question: "How can I reset my password?",
    answer:
      'Open Settings > Security and select "Reset password." We\'ll send a reset link to your account email; it expires after 30 minutes.',
  },
  {
    question: "Can I create more than one account?",
    answer:
      "Each workspace supports multiple accounts under one billing plan. Invite teammates from Settings > Members.",
  },
  {
    question: "How do I subscribe to the monthly newsletter?",
    answer:
      "Enable it from Settings > Notifications > Newsletter. You can unsubscribe from the same page at any time.",
  },
  {
    question: "Do you store credit card information securely?",
    answer:
      "Card details are handled entirely by our PCI-compliant payment processor; we never see or store raw card numbers.",
  },
  {
    question: "What payment systems do you work with?",
    answer:
      "We accept all major credit cards, plus ACH transfer and wire payment for annual plans.",
  },
];

export function SupportFaq() {
  return <FaqSimple title="Frequently Asked Questions" items={items} />;
}
