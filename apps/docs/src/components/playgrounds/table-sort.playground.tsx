import {
  TableSort,
  type TableSortRow,
} from "../../../../../registry/mantine-ui/table-sort/table-sort";
import type { PlaygroundAdapter } from "./contract";

const TEAM_DATA: TableSortRow[] = [
  { name: "Robert Wolfkisser", email: "rob_wolf@gmail.com", company: "Canyon Realty" },
  { name: "Jill Jailbreaker", email: "jj@breaker.com", company: "Fishing Corp" },
  { name: "Henry Silkeater", email: "henry@silkeater.io", company: "Wool Charts" },
  { name: "Bill Horsefighter", email: "bhorsefighter@royal.net", company: "Combat Farms" },
  { name: "Jeremy Footviewer", email: "jeremy@foot.dev", company: "Footwork Inc" },
];

const ENGINEERING_DATA: TableSortRow[] = [
  { name: "Mara Chen", email: "mara.chen@northwind.dev", company: "Northwind Labs" },
  { name: "Diego Alvarez", email: "diego@ridgeline.io", company: "Ridgeline Systems" },
  { name: "Priya Natarajan", email: "priya.n@lattice.co", company: "Lattice Robotics" },
];

const EMPTY_DATA: TableSortRow[] = [];

const DATASETS: Record<string, { label: string; data: TableSortRow[] }> = {
  team: { label: "Team directory", data: TEAM_DATA },
  engineering: { label: "Engineering roster", data: ENGINEERING_DATA },
  empty: { label: "No results", data: EMPTY_DATA },
};

function formatRow(row: TableSortRow, indent: string): string {
  return `${indent}{ name: ${JSON.stringify(row.name)}, email: ${JSON.stringify(row.email)}, company: ${JSON.stringify(row.company)} }`;
}

function formatData(data: TableSortRow[]): string {
  if (data.length === 0) return "[]";
  const rows = data.map((row) => formatRow(row, "    ")).join(",\n");
  return `[\n${rows},\n  ]`;
}

const adapter: PlaygroundAdapter = {
  item: "table-sort",
  defaultProps: {
    searchPlaceholder: "Search team members",
    dataset: "team",
    emptyMessage: "No team members found",
    rowClickEnabled: true,
  },
  controls: [
    { kind: "text", prop: "searchPlaceholder", label: "Search placeholder", wide: true },
    {
      kind: "select",
      prop: "dataset",
      label: "Dataset",
      options: [
        { label: "Team directory", value: "team" },
        { label: "Engineering roster", value: "engineering" },
        { label: "No results", value: "empty" },
      ],
    },
    { kind: "text", prop: "emptyMessage", label: "Empty message", wide: true },
    { kind: "switch", prop: "rowClickEnabled", label: "Row click" },
  ],
  render: (props, recordEvent) => {
    const datasetKey =
      typeof props.dataset === "string" && props.dataset in DATASETS ? props.dataset : "team";

    return (
      <TableSort
        data={DATASETS[datasetKey].data}
        searchPlaceholder={String(props.searchPlaceholder) || "Search by any field"}
        emptyMessage={String(props.emptyMessage) || "Nothing found"}
        onRowClick={
          props.rowClickEnabled ? (row) => recordEvent(`onRowClick: ${row.name}`) : undefined
        }
      />
    );
  },
  renderJsx: (props) => {
    const datasetKey =
      typeof props.dataset === "string" && props.dataset in DATASETS ? props.dataset : "team";
    const dataLiteral = formatData(DATASETS[datasetKey].data);
    const onRowClickProp = props.rowClickEnabled
      ? "\n  onRowClick={(row) => console.log(row)}"
      : "";

    return `<TableSort
  data={${dataLiteral}}
  searchPlaceholder=${JSON.stringify(props.searchPlaceholder)}
  emptyMessage=${JSON.stringify(props.emptyMessage)}${onRowClickProp}
/>`;
  },
  stage: {
    desktopWidth: "100%",
  },
};

export default adapter;
