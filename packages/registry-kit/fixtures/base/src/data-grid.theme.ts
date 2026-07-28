import { Table, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Table: Table.extend({ defaultProps: { verticalSpacing: "sm" } }),
  },
});
