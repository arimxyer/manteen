import { createTheme, Table } from "@mantine/core";

export const theme = createTheme({
  components: {
    Table: Table.extend({ defaultProps: { verticalSpacing: "sm" } }),
  },
});
