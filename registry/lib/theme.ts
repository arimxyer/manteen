import { Button, Card, createTheme, Modal, Paper } from "@mantine/core";

/**
 * House Mantine theme.
 *
 * This is the "opinions" layer — it belongs in the registry because every app
 * that consumes it is expected to edit it. Mantine itself stays a normal npm
 * dependency underneath.
 */
export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  headings: {
    fontWeight: "600",
  },
  components: {
    Button: Button.extend({
      defaultProps: {
        variant: "filled",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        radius: "md",
        padding: "lg",
      },
    }),
    Paper: Paper.extend({
      defaultProps: {
        radius: "md",
      },
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.55, blur: 3 },
      },
    }),
  },
});
