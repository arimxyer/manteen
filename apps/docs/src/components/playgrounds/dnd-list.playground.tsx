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
    const items = buildItems({
      itemCount,
      showDescriptions: Boolean(props.showDescriptions),
      showLeading: Boolean(props.showLeading),
    });

    return (
      <DndList
        // Force a remount when the demo data shape changes: DndList seeds its internal
        // sortable state from `initialItems` once via useListState and never re-syncs it.
        key={`${itemCount}-${props.showDescriptions}-${props.showLeading}`}
        initialItems={items}
        onChange={(reordered) =>
          recordEvent(`onChange (${reordered.map((item) => item.id).join(", ")})`)
        }
      />
    );
  },
  renderJsx: (props) => {
    const itemCount = Number(props.itemCount) || DEMO_ITEMS.length;
    const items = buildItems({
      itemCount,
      showDescriptions: Boolean(props.showDescriptions),
      showLeading: Boolean(props.showLeading),
    });

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
