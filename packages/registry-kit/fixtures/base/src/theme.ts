import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  components: {
    Button: Button.extend({ defaultProps: { variant: "filled" } }),
  },
});
