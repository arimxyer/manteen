import { describe, expect, test } from "bun:test";

import { type InfoReport, renderInfo, renderInfoJson } from "../src/commands/info";
import { toItemDetail } from "../src/inventory/available";
import { createItemValidator } from "../src/plan/validate-item";

const context = {
  id: "@house/card",
  expectedName: "card",
  redactedUrl: "https://example.test/r/card.json",
} as const;

function wire(display: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "card",
    type: "registry:ui",
    files: [{ path: "card.tsx", type: "registry:ui", content: "export const Card = 1;\n" }],
    ...display,
  };
}

const PROPS = {
  Card: [
    {
      name: "title",
      type: "string",
      required: true,
      description: "Visible heading.",
    },
  ],
};

const USAGE = {
  path: "examples/card.usage.tsx",
  content: 'export function Example() {\n  return <Card title="COPY_ME" />;\n}\n',
};

const THEME_SUMMARY = {
  keys: ["primaryColor", "components", "colors"],
  components: {
    items: [
      {
        name: "Zed",
        channels: [
          { name: "vars", dynamic: false },
          { name: "defaultProps", dynamic: true },
        ],
        dynamic: true,
      },
      {
        name: "Alpha",
        channels: [{ name: "styles", dynamic: false }],
        dynamic: false,
      },
    ],
    dynamic: true,
  },
  dynamic: false,
};

describe("optional display metadata", () => {
  test("retains docs, props and usage without putting usage in installable files", () => {
    const result = createItemValidator()(
      wire({
        docs: "Use this card in a dashboard.",
        meta: { mantine: { props: PROPS, usage: USAGE } },
      }),
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostics).toEqual([]);
    expect(result.item.docs).toBe("Use this card in a dashboard.");
    expect(result.item.meta.props).toEqual(PROPS);
    expect(result.item.meta.usage).toEqual(USAGE);
    expect(result.item.files.map((file) => file.path)).toEqual(["card.tsx"]);
  });

  test("drops malformed display fields with visible warnings and keeps installable bytes", () => {
    const result = createItemValidator()(
      wire({
        docs: ["not markdown"],
        meta: {
          mantine: {
            props: { Card: [{ name: "title", type: 42 }] },
            usage: { path: "example.tsx", content: 42 },
            themeSummary: { keys: "not-an-array", components: {}, dynamic: "sometimes" },
          },
        },
      }),
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.docs).toBeUndefined();
    expect(result.item.meta.props).toBeUndefined();
    expect(result.item.meta.usage).toBeUndefined();
    expect(result.item.meta.themeSummary).toBeUndefined();
    expect(result.item.files[0]?.content).toBe("export const Card = 1;\n");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "meta-degraded",
      "meta-degraded",
      "meta-degraded",
      "meta-degraded",
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain(
      "docs was dropped",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain(
      "meta.mantine.themeSummary",
    );
  });

  test("drops a theme summary when its source fragment is absent or malformed", () => {
    for (const themeFragment of [undefined, { path: "theme.ts", content: 42 }]) {
      const result = createItemValidator()(
        wire({
          meta: {
            mantine: {
              ...(themeFragment === undefined ? {} : { themeFragment }),
              themeSummary: THEME_SUMMARY,
            },
          },
        }),
        context,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.item.meta.themeSummary).toBeUndefined();
      expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain(
        "themeSummary without a usable meta.mantine.themeFragment",
      );
    }
  });

  test("info JSON is complete while text expands props and usage only on request", () => {
    const validated = createItemValidator()(
      wire({
        docs: "Use this card in a dashboard.",
        meta: {
          mantine: {
            props: PROPS,
            usage: USAGE,
            themeFragment: {
              path: "src/card.theme.ts",
              content: "export const theme = createTheme({ components: {} });\n",
            },
            themeSummary: THEME_SUMMARY,
          },
        },
      }),
      context,
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const detail = toItemDetail(validated.item, context.redactedUrl);
    const report: InfoReport = {
      id: context.id,
      registry: "@house",
      root: "/project",
      available: null,
      installed: null,
      detail,
      files: detail.files.map((file) => ({
        ...file,
        destination: `/project/src/${file.path}`,
        receiptPath: `src/${file.path}`,
        refused: null,
        folded: false,
        local: null,
      })),
      diagnostics: [],
      notes: [],
      ok: true,
    };

    const json = JSON.parse(renderInfoJson(report)) as Record<string, unknown>;
    const jsonDetail = json.detail as {
      docs: string;
      meta: {
        props: unknown;
        usage: { content: string };
        themeFragment: { path: string; bytes: number; content?: never };
        themeSummary: typeof THEME_SUMMARY;
      };
    };
    expect(jsonDetail.docs).toBe("Use this card in a dashboard.");
    expect(jsonDetail.meta.props).toEqual(PROPS);
    expect(jsonDetail.meta.usage.content).toContain("COPY_ME");
    expect(jsonDetail.meta.themeFragment.path).toBe("src/card.theme.ts");
    expect(jsonDetail.meta.themeFragment).not.toHaveProperty("content");
    expect(jsonDetail.meta.themeSummary.keys).toEqual(["colors", "components", "primaryColor"]);
    expect(jsonDetail.meta.themeSummary.components.items.map((item) => item.name)).toEqual([
      "Alpha",
      "Zed",
    ]);
    expect(
      jsonDetail.meta.themeSummary.components.items[1]?.channels.map((item) => item.name),
    ).toEqual(["defaultProps", "vars"]);

    const compact = renderInfo(report);
    expect(compact).toContain("use --props to expand");
    expect(compact).toContain("use --usage to expand");
    expect(compact).not.toContain("COPY_ME");
    expect(compact).toContain("summary    keys colors, components, primaryColor; dynamic no");
    expect(compact).toContain("components 2; map dynamic yes");
    expect(compact).toContain("Alpha: styles (static); config dynamic no");
    expect(compact).toContain("Zed: defaultProps (dynamic), vars (static); config dynamic yes");

    const expanded = renderInfo(report, { props: true, usage: true });
    expect(expanded).toContain("title: string");
    expect(expanded).toContain("COPY_ME");
  });
});
