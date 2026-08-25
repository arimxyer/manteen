import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegistryItem } from "@/lib/compiled-registry";
import { RegistryItemProps, RegistryItemStyling } from "./registry-item-detail";

const baseItem = {
  name: "alpha",
  type: "registry:ui",
  files: [],
} satisfies RegistryItem;

test("props distinguish absent, authored-empty, and mixed component entries", () => {
  const absent = renderToStaticMarkup(<RegistryItemProps item={baseItem} />);
  assert.match(absent, /does not declare meta\.mantine\.props/);

  const empty = renderToStaticMarkup(
    <RegistryItemProps
      item={{ ...baseItem, meta: { mantine: { props: { EmptyComponent: [] } } } }}
    />,
  );
  assert.match(empty, /Authored props are empty/);
  assert.doesNotMatch(empty, /does not declare meta\.mantine\.props/);

  const mixed = renderToStaticMarkup(
    <RegistryItemProps
      item={{
        ...baseItem,
        meta: {
          mantine: {
            props: {
              EmptyComponent: [],
              FilledComponent: [{ name: "label", type: "string" }],
            },
          },
        },
      }}
    />,
  );
  assert.match(mixed, /EmptyComponent/);
  assert.match(mixed, /No props are authored for this component/);
  assert.match(mixed, /FilledComponent/);
  assert.match(mixed, /label/);
  assert.equal((mixed.match(/<table/g) ?? []).length, 1);
});

test("Styles API distinguishes absent and authored-empty records", () => {
  const absent = renderToStaticMarkup(<RegistryItemStyling item={baseItem} />);
  assert.match(absent, /No meta\.mantine\.stylesApi declaration is present/);

  const empty = renderToStaticMarkup(
    <RegistryItemStyling item={{ ...baseItem, meta: { mantine: { stylesApi: {} } } }} />,
  );
  assert.match(empty, /authored but contains no component entries/);
  assert.doesNotMatch(empty, /No meta\.mantine\.stylesApi declaration is present/);
});
