import { describe, expect, test } from "bun:test";

import { mergeThemeSource } from "./merge-theme";

const BASE = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  headings: {
    fontWeight: "600",
  },
  components: {
    Button: Button.extend({
      defaultProps: {
        variant: "filled",
      },
    }),
  },
});
`;

describe("component composition", () => {
  test("adds a component the base theme does not have, and imports it", () => {
    const incoming = `import { Table, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Table: Table.extend({
      defaultProps: { verticalSpacing: "sm" },
    }),
  },
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.added).toContain("components.Table");
    expect(result.importsAdded).toEqual(["Table"]);
    // Slotted into the file's existing (ASCII) order, not appended.
    expect(result.text).toContain('import { Button, Table, createTheme } from "@mantine/core"');
    // The pre-existing entry survives untouched.
    expect(result.text).toContain('variant: "filled"');
  });

  test("writes the new entry with the base file's indentation and comma style", () => {
    const incoming = `import { Table, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Table: Table.extend({
      defaultProps: { verticalSpacing: "sm" },
    }),
  },
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.text).toBe(`import { Button, Table, createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  headings: {
    fontWeight: "600",
  },
  components: {
    Button: Button.extend({
      defaultProps: {
        variant: "filled",
      },
    }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: "sm" },
    }),
  },
});
`);
  });

  test("composes defaultProps on a component both themes touch", () => {
    const incoming = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({
      defaultProps: { radius: "xl", size: "md" },
    }),
  },
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.text).toContain('variant: "filled"');
    expect(result.text).toContain('radius: "xl"');
    expect(result.text).toContain('size: "md"');
    expect(result.added).toEqual([
      "components.Button.defaultProps.radius",
      "components.Button.defaultProps.size",
    ]);
    expect(result.conflicts).toHaveLength(0);
    // Nothing new to import — Button was already there.
    expect(result.importsAdded).toEqual([]);
  });

  test("keeps the local value when both set the same prop, and reports it", () => {
    const incoming = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({
      defaultProps: { variant: "outline" },
    }),
  },
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.text).toContain('variant: "filled"');
    expect(result.text).not.toContain('variant: "outline"');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.path).toBe("components.Button.defaultProps.variant");
    expect(result.conflicts[0]!.base).toBe('"filled"');
    expect(result.conflicts[0]!.incoming).toBe('"outline"');
  });

  test("prefer:incoming applies the incoming value instead", () => {
    const incoming = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({
      defaultProps: { variant: "outline" },
    }),
  },
});
`;

    const result = mergeThemeSource(BASE, incoming, { prefer: "incoming" });

    expect(result.text).toContain('variant: "outline"');
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("top-level theme keys", () => {
  test("adds missing keys and deep-merges nested objects", () => {
    const incoming = `import { createTheme } from "@mantine/core";

export const theme = createTheme({
  focusRing: "auto",
  headings: {
    fontFamily: "Inter",
  },
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.added).toContain("focusRing");
    expect(result.added).toContain("headings.fontFamily");
    expect(result.text).toContain('fontWeight: "600"');
    expect(result.text).toContain('fontFamily: "Inter"');
    expect(result.conflicts).toHaveLength(0);
  });

  test("does not clobber a customized scalar", () => {
    const incoming = `import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "grape",
});
`;

    const result = mergeThemeSource(BASE, incoming);

    expect(result.text).toContain('primaryColor: "indigo"');
    expect(result.conflicts.map((c) => c.path)).toEqual(["primaryColor"]);
  });
});

describe("safety", () => {
  test("is idempotent — a second merge changes nothing", () => {
    const incoming = `import { Table, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Table: Table.extend({
      defaultProps: { verticalSpacing: "sm" },
    }),
  },
});
`;

    const first = mergeThemeSource(BASE, incoming);
    expect(first.changed).toBe(true);

    const second = mergeThemeSource(first.text, incoming);
    expect(second.changed).toBe(false);
    expect(second.added).toEqual([]);
    expect(second.importsAdded).toEqual([]);
    expect(second.text).toBe(first.text);
  });

  test("refuses to merge callback classNames, and says why", () => {
    const base = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({
      classNames: (theme) => ({ root: theme.other.custom }),
    }),
  },
});
`;
    const incoming = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({
      classNames: { root: "incoming-root" },
    }),
  },
});
`;

    const result = mergeThemeSource(base, incoming);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.reason).toContain("callback form cannot be merged");
    expect(result.text).toContain("theme.other.custom");
    expect(result.text).not.toContain("incoming-root");
  });

  test("reports a components entry that is not an .extend() call", () => {
    const base = `import { createTheme } from "@mantine/core";
import { fancyButton } from "./fancy";

export const theme = createTheme({
  components: {
    Button: fancyButton,
  },
});
`;
    const incoming = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Button: Button.extend({ defaultProps: { size: "lg" } }),
  },
});
`;

    const result = mergeThemeSource(base, incoming);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.reason).toContain("not a `Component.extend({...})` call");
    expect(result.text).toContain("Button: fancyButton");
  });

  test("throws a useful error when there is no createTheme call", () => {
    expect(() => mergeThemeSource(`export const theme = {};`, BASE)).toThrow(
      /No `createTheme\(\.\.\.\)` call found in the base theme/,
    );
  });

  test("creates the @mantine/core import when the base file lacks one", () => {
    const base = `import { createTheme } from "@mantine/core";

export const theme = createTheme({ primaryColor: "indigo" });
`;
    const incoming = `import { Card, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Card: Card.extend({ defaultProps: { withBorder: true } }),
  },
});
`;

    const result = mergeThemeSource(base, incoming);

    expect(result.importsAdded).toEqual(["Card"]);
    expect(result.text).toContain("Card");
  });
});

describe("comment and formatting preservation", () => {
  test("keeps comments in untouched regions", () => {
    const base = `import { Button, createTheme } from "@mantine/core";

export const theme = createTheme({
  // House palette — do not change without design sign-off.
  primaryColor: "indigo",
  components: {
    Button: Button.extend({
      defaultProps: {
        variant: "filled", // intentional
      },
    }),
  },
});
`;
    const incoming = `import { Card, createTheme } from "@mantine/core";

export const theme = createTheme({
  components: {
    Card: Card.extend({ defaultProps: { padding: "lg" } }),
  },
});
`;

    const result = mergeThemeSource(base, incoming);

    expect(result.text).toContain("// House palette — do not change without design sign-off.");
    expect(result.text).toContain("// intentional");
  });
});
