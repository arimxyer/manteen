import { DndList, type DndListItem } from "../../../../../registry/mantine-ui/dnd-list/dnd-list";
import type { PlaygroundAdapter } from "./contract";

const DEMO_ITEMS: ReadonlyArray<{ id: string; label: string; description: string }> = [
  { id: "1", label: "Ship onboarding redesign", description: "Due this Friday" },
  { id: "2", label: "Fix billing webhook retries", description: "Blocked on infra" },
  { id: "3", label: "Write Q3 roadmap draft", description: "Needs stakeholder review" },
  { id: "4", label: "Migrate docs to new theme", description: "Nice to have" },
  { id: "5", label: "Audit onboarding analytics", description: "Low priority" },
];

function buildItems(props: {
  itemCount: number;
  showDescriptions: boolean;
  showLeading: boolean;
}): DndListItem[] {
  return DEMO_ITEMS.slice(0, props.itemCount).map((item, index) => ({
    id: item.id,
    label: item.label,
    description: props.showDescriptions ? item.description : undefined,
    leading: props.showLeading ? String(index + 1) : undefined,
  }));
}

// H-3 — DndList owns its post-drag order internally (useListState + @dnd-kit's own reducer);
// it only ever reports that order out through `onChange`, which the generic Playground shell
// wires to a toast (`recordEvent`) and never folds back into the control `props` state that
// `renderJsx(props)` is called with. That shell is outside this directory's ownership, so
// there is no prop channel to carry the live order back to the JSX generator. This module-level
// mirror is the bounded fix available from inside this file: `render`'s onChange writes the
// reordered items here (leading numbers travel WITH the item they were assigned to — do not
// recompute them from index, or the copied code renumbers a drag away and reintroduces the same
// class of mismatch), and `renderJsx` reads them back keyed on the same string DndList remounts
// on, so a control change that resets the live order (new `key`) also invalidates this cache.
// Fixing this generically (e.g. for a future adapter with the same shape) would need the shell
// itself to thread component-owned state into the copy path.
let liveOrderCache: { key: string; items: DndListItem[] } | null = null;

function demoKey(props: { itemCount: number; showDescriptions: boolean; showLeading: boolean }) {
  return `${props.itemCount}-${props.showDescriptions}-${props.showLeading}`;
}

/** Applies a cached live order to a freshly-built item list, if the cache is for this exact
 * control state and still names exactly the same ids (a stale cache from a different item
 * count/toggle combination is ignored, never partially applied). */
function withLiveOrder(items: DndListItem[], key: string): DndListItem[] {
  if (!liveOrderCache || liveOrderCache.key !== key) return items;
  const byId = new Map(liveOrderCache.items.map((item) => [item.id, item]));
  if (byId.size !== items.length || !items.every((item) => byId.has(item.id))) return items;
  return liveOrderCache.items;
}

const adapter: PlaygroundAdapter = {
  item: "dnd-list",
  defaultProps: {
    itemCount: "4",
    showDescriptions: true,
    showLeading: true,
  },
  controls: [
    {
      kind: "select",
      prop: "itemCount",
      label: "Items",
      options: [
        { label: "3 items", value: "3" },
        { label: "4 items", value: "4" },
        { label: "5 items", value: "5" },
      ],
    },
    { kind: "switch", prop: "showDescriptions", label: "Descriptions" },
    { kind: "switch", prop: "showLeading", label: "Numbering" },
  ],
  render: (props, recordEvent) => {
    const itemCount = Number(props.itemCount) || DEMO_ITEMS.length;
    const showDescriptions = Boolean(props.showDescriptions);
    const showLeading = Boolean(props.showLeading);
    const key = demoKey({ itemCount, showDescriptions, showLeading });
    const items = buildItems({ itemCount, showDescriptions, showLeading });

    return (
      <DndList
        // Force a remount when the demo data shape changes: DndList seeds its internal
        // sortable state from `initialItems` once via useListState and never re-syncs it.
        // (This is also exactly the moment `liveOrderCache` above must go stale — see H-3.)
        key={key}
        initialItems={items}
        onChange={(reordered) => {
          liveOrderCache = { key, items: reordered };
          recordEvent(`onChange (${reordered.map((item) => item.id).join(", ")})`);
        }}
      />
    );
  },
  renderJsx: (props) => {
    const itemCount = Number(props.itemCount) || DEMO_ITEMS.length;
    const showDescriptions = Boolean(props.showDescriptions);
    const showLeading = Boolean(props.showLeading);
    const key = demoKey({ itemCount, showDescriptions, showLeading });
    const items = withLiveOrder(buildItems({ itemCount, showDescriptions, showLeading }), key);

    const itemsCode = items
      .map((item) => {
        const fields = [`id: ${JSON.stringify(item.id)}`, `label: ${JSON.stringify(item.label)}`];
        if (item.description) {
          fields.push(`description: ${JSON.stringify(item.description)}`);
        }
        if (item.leading) {
          fields.push(`leading: ${JSON.stringify(item.leading)}`);
        }
        return `    { ${fields.join(", ")} },`;
      })
      .join("\n");

    return `<DndList
  initialItems={[
${itemsCode}
  ]}
  onChange={(items) => {}}
/>`;
  },
  stage: {
    desktopWidth: "min(28rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
    minHeight: "28rem",
  },
};

export default adapter;
