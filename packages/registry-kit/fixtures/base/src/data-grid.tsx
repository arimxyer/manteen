import { Table } from "@mantine/core";

import { EmptyState } from "@/components/ui/empty-state";
import { useDataGrid } from "@/hooks/use-data-grid";

export function DataGrid({ rows }: { rows: string[] }) {
  const { sorted } = useDataGrid(rows);
  if (!sorted.length) return <EmptyState />;
  return (
    <Table>
      <Table.Tbody>
        {sorted.map((row) => (
          <Table.Tr key={row}>
            <Table.Td>{row}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
