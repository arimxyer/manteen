import { describe, expect, test } from "bun:test";

import { summarizeThemeFragment } from "../src/theme-summary";

describe("theme summary", () => {
  test("sorts literal keys and components while preserving fixed channel order", () => {
    const summary = summarizeThemeFragment(`
      export const theme = createTheme({
        zeta: true,
        components: {
          2: { styles: { root: { color: "gray" } } },
          Zed: {
            vars: { root: { "--zed": "1" } },
          },
          "10": { classNames: { root: "ten" } },
          Alpha: Button.extend({
            vars: { root: { "--alpha": "1" } },
            styles: { root: { color: "red", padding: [1, 2, 3] } },
            defaultProps: { radius: "sm", tabIndex: -1 },
            classNames: { root: "alpha" },
          }),
        },
        alpha: "first",
        9: "numeric",
      });
    `);

    expect(summary).toEqual({
      keys: ["9", "alpha", "components", "zeta"],
      components: {
        items: [
          {
            name: "10",
            channels: [{ name: "classNames", dynamic: false }],
            dynamic: false,
          },
          {
            name: "2",
            channels: [{ name: "styles", dynamic: false }],
            dynamic: false,
          },
          {
            name: "Alpha",
            channels: [
              { name: "defaultProps", dynamic: false },
              { name: "classNames", dynamic: false },
              { name: "styles", dynamic: false },
              { name: "vars", dynamic: false },
            ],
            dynamic: false,
          },
          {
            name: "Zed",
            channels: [{ name: "vars", dynamic: false }],
            dynamic: false,
          },
        ],
        dynamic: false,
      },
      dynamic: false,
    });
  });

  test("marks callbacks, aliases, calls, and non-literal channel contents dynamic", () => {
    const summary = summarizeThemeFragment(`
      createTheme({
        components: {
          Alias: alias,
          Callback: () => ({ styles: { root: {} } }),
          Called: buildComponent(),
          Extended: Button.extend({
            defaultProps: defaults,
            classNames: (theme) => ({ root: theme.root }),
            styles: { root: getStyles(), label: { color: token } },
            vars: { root: { "--value": \`\${runtime}\` } },
          }),
          ComputedChannel: {
            classNames: { [selector]: "computed" },
          },
          SpreadChannel: {
            styles: { root: { color: "red" }, ...styleRest },
          },
        },
      });
    `);

    expect(summary.components.items).toEqual([
      { name: "Alias", channels: [], dynamic: true },
      { name: "Callback", channels: [], dynamic: true },
      { name: "Called", channels: [], dynamic: true },
      {
        name: "ComputedChannel",
        channels: [{ name: "classNames", dynamic: true }],
        dynamic: false,
      },
      {
        name: "Extended",
        channels: [
          { name: "defaultProps", dynamic: true },
          { name: "classNames", dynamic: true },
          { name: "styles", dynamic: true },
          { name: "vars", dynamic: true },
        ],
        dynamic: false,
      },
      {
        name: "SpreadChannel",
        channels: [{ name: "styles", dynamic: true }],
        dynamic: false,
      },
    ]);
    expect(summary.components.dynamic).toBe(false);
    expect(summary.dynamic).toBe(false);
  });

  test("marks spreads and computed names at their owning level", () => {
    const summary = summarizeThemeFragment(`
      createTheme({
        known: true,
        ...themeRest,
        [topKey]: false,
        components: {
          Static: {
            defaultProps: { color: "red" },
            ...componentRest,
            [channel]: {},
          },
          ...componentMapRest,
          [componentName]: { styles: { root: {} } },
        },
      });
    `);

    expect(summary.keys).toEqual(["components", "known"]);
    expect(summary.dynamic).toBe(true);
    expect(summary.components.dynamic).toBe(true);
    expect(summary.components.items).toEqual([
      {
        name: "Static",
        channels: [{ name: "defaultProps", dynamic: false }],
        dynamic: true,
      },
    ]);
  });

  test("keeps a known top-level key when only the components value is aliased", () => {
    expect(summarizeThemeFragment("createTheme({ components, primaryColor: 'blue' })")).toEqual({
      keys: ["components", "primaryColor"],
      components: { items: [], dynamic: true },
      dynamic: false,
    });
  });

  test("returns the conservative empty shape for aliases, malformed source, and ambiguous roots", () => {
    const empty = {
      keys: [],
      components: { items: [], dynamic: true },
      dynamic: true,
    };

    expect(summarizeThemeFragment("createTheme(theme)")).toEqual(empty);
    expect(summarizeThemeFragment("createTheme({ components: {")).toEqual(empty);
    expect(summarizeThemeFragment("createTheme({}); createTheme({ colors: {} });")).toEqual(empty);
    expect(summarizeThemeFragment("Mantine.createTheme({ colors: {} })")).toEqual(empty);
  });

  test("never executes the source while deriving metadata", () => {
    const sentinel = "__manteenThemeSummaryExecuted";
    Reflect.deleteProperty(globalThis, sentinel);

    const summary = summarizeThemeFragment(`
      globalThis.${sentinel} = true;
      createTheme({ components: { Button: Button.extend({ styles: { root: {} } }) } });
    `);

    expect(Reflect.has(globalThis, sentinel)).toBe(false);
    expect(summary.components.items[0]?.name).toBe("Button");
  });
});
