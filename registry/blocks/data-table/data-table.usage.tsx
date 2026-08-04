import { Badge } from "@mantine/core";
import { DataTable } from "@/components/ui/data-table";

interface Invoice extends Record<string, unknown> {
  id: string;
  client: string;
  amount: number;
  status: "paid" | "overdue" | "pending";
}

const invoices: Invoice[] = [
  { id: "INV-1042", client: "Bluefin Studio", amount: 1280, status: "paid" },
  { id: "INV-1043", client: "Northwind Labs", amount: 640, status: "pending" },
  { id: "INV-1044", client: "Harbor & Co.", amount: 2150, status: "overdue" },
];

const statusColor: Record<Invoice["status"], string> = {
  paid: "teal",
  pending: "yellow",
  overdue: "red",
};

export function InvoicesTable() {
  return (
    <DataTable<Invoice>
      data={invoices}
      columns={[
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
          render: (row) => <Badge color={statusColor[row.status]}>{row.status}</Badge>,
        },
      ]}
      onRowClick={(row) => console.log("open invoice", row.id)}
      emptyTitle="No invoices yet"
    />
  );
}
