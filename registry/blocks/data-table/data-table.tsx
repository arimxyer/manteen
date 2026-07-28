import type { ReactNode } from "react";
import { Group, Skeleton, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";

import { EmptyState } from "@/components/ui/empty-state";
import { useDataTable } from "@/hooks/use-data-table";

export interface DataTableColumn<T> {
  key: keyof T;
  header: ReactNode;
  sortable?: boolean;
  width?: number | string;
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  /** Number of skeleton rows to show while `loading`. */
  loadingRows?: number;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  getRowKey?: (row: T, index: number) => string | number;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  loadingRows = 5,
  emptyTitle = "No results",
  emptyDescription = "Try adjusting your filters.",
  onRowClick,
  getRowKey = (_row, index) => index,
}: DataTableProps<T>) {
  const { rows, sort, toggleSort } = useDataTable(data);

  if (loading) {
    return (
      <Stack gap="xs">
        {Array.from({ length: loadingRows }, (_, i) => (
          <Skeleton key={i} height={40} radius="sm" />
        ))}
      </Stack>
    );
  }

  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Table.ScrollContainer minWidth={480}>
      <Table highlightOnHover={Boolean(onRowClick)} verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            {columns.map((column) => (
              <Table.Th key={String(column.key)} w={column.width}>
                {column.sortable ? (
                  <UnstyledButton onClick={() => toggleSort(column.key)}>
                    <Group gap={4} wrap="nowrap">
                      <Text size="sm" fw={600}>
                        {column.header}
                      </Text>
                      <SortIcon active={sort.key === column.key} direction={sort.direction} />
                    </Group>
                  </UnstyledButton>
                ) : (
                  <Text size="sm" fw={600}>
                    {column.header}
                  </Text>
                )}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {rows.map((row, index) => (
            <Table.Tr
              key={getRowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((column) => (
                <Table.Td key={String(column.key)}>
                  {column.render ? column.render(row) : String(row[column.key] ?? "—")}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <IconSelector size={14} opacity={0.5} />;
  return direction === "asc" ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
}
