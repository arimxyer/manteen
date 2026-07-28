import { Skeleton, Table, createTheme } from "@mantine/core";

/**
 * Theme fragment for the `data-table` item.
 *
 * Declared as `themeFragment` in manteen.registry.json. The Mantine client
 * merges it into the project's existing theme via tools/merge-theme, so two
 * items can both contribute `theme.components` entries without clobbering.
 */
export const theme = createTheme({
  components: {
    Table: Table.extend({
      defaultProps: {
        verticalSpacing: "sm",
        highlightOnHover: true,
      },
    }),
    Skeleton: Skeleton.extend({
      defaultProps: {
        radius: "sm",
      },
    }),
  },
});
