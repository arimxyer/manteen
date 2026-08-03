import { Badge } from "@mantine/core";
import type { DataTableColumn } from "../../../../../registry/blocks/data-table/data-table";
import { DataTable } from "../../../../../registry/blocks/data-table/data-table";
import type { PlaygroundAdapter } from "./contract";

interface Invoice extends Record<string, unknown> {
  id: string;
  client: string;
  amount: number;
  status: "paid" | "overdue" | "pending";
}

const INVOICES: Invoice[] = [
  { id: "INV-1042", client: "Bluefin Studio", amount: 1280, status: "paid" },
  { id: "INV-1043", client: "Northwind Labs", amount: 640, status: "pending" },
  { id: "INV-1044", client: "Harbor & Co.", amount: 2150, status: "overdue" },
  { id: "INV-1045", client: "Cedar Analytics", amount: 375, status: "paid" },
];

const STATUS_COLOR: Record<Invoice["status"], string> = {
  paid: "teal",
  pending: "yellow",
  overdue: "red",
};

const COLUMNS: DataTableColumn<Invoice>[] = [
  { key: "id", header: "Invoice", sortable: true },
  { key: "client", header: "Client", sortable: true },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    render: (row) => `$${row.amount.toFixed(2)}`,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge color={STATUS_COLOR[row.status]}>{row.status}</Badge>,
  },
];

const adapter: PlaygroundAdapter = {
  item: "data-table",
  defaultProps: {
    loading: false,
    empty: false,
    rowClick: true,
    emptyTitle: "No invoices yet",
  },
  controls: [
    { kind: "switch", prop: "loading", label: "Loading" },
    { kind: "switch", prop: "empty", label: "Empty state" },
    { kind: "switch", prop: "rowClick", label: "Row click" },
    { kind: "text", prop: "emptyTitle", label: "Empty title", compact: true },
  ],
  render: (props, recordEvent) => (
    <DataTable<Invoice>
      data={props.empty ? [] : INVOICES}
      columns={COLUMNS}
      loading={Boolean(props.loading)}
      emptyTitle={String(props.emptyTitle) || "No results"}
      onRowClick={props.rowClick ? (row) => recordEvent(`onRowClick(${row.id})`) : undefined}
    />
  ),
  renderJsx: (props) => {
    const onRowClickProp = props.rowClick ? "\n  onRowClick={(row) => {}}" : "";
    const emptyTitleProp =
      props.emptyTitle && props.emptyTitle !== "No invoices yet"
        ? `\n  emptyTitle=${JSON.stringify(props.emptyTitle)}`
        : "";
    const data = props.empty ? "[]" : "invoices";

    return `<DataTable<Invoice>
  data={${data}}
  columns={[
    { key: "id", header: "Invoice", sortable: true },
    { key: "client", header: "Client", sortable: true },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      render: (row) => \`$\${row.amount.toFixed(2)}\`,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge color={statusColor[row.status]}>{row.status}</Badge>,
    },
  ]}
  loading={${Boolean(props.loading)}}${emptyTitleProp}${onRowClickProp}
/>`;
  },
  stage: {
    desktopWidth: "100%",
    mobileWidth: "min(20rem, 100%)",
  },
};

export default adapter;
