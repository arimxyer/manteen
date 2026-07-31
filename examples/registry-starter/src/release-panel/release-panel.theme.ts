import { createTheme, Paper } from "@mantine/core";

export const theme = createTheme({
  components: {
    Paper: Paper.extend({
      defaultProps: {
        radius: "md",
        withBorder: true,
      },
    }),
  },
});
