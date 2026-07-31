/**
 * Adapted from Mantine UI's TableSort at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import { Center, Group, ScrollArea, Table, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSearch, IconSelector } from "@tabler/icons-react";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import classes from "./table-sort.module.css";

export interface TableSortRow {
  name: string;
  email: string;
  company: string;
}

export interface TableSortProps {
  data: TableSortRow[];
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  onRowClick?: (row: TableSortRow) => void;
}

interface SortableHeaderProps {
  children: ReactNode;
  reversed: boolean;
  sorted: boolean;
  onSort: () => void;
}

function SortableHeader({ children, reversed, sorted, onSort }: SortableHeaderProps) {
  const Icon = sorted ? (reversed ? IconChevronUp : IconChevronDown) : IconSelector;

  return (
    <Table.Th
      className={classes.th}
      aria-sort={sorted ? (reversed ? "descending" : "ascending") : "none"}
    >
      <UnstyledButton onClick={onSort} className={classes.control}>
        <Group justify="space-between">
          <Text fw={500} fz="sm">
            {children}
          </Text>
          <Center className={classes.icon}>
            <Icon size={16} stroke={1.5} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

function filterData(data: TableSortRow[], search: string): TableSortRow[] {
  const query = search.toLowerCase().trim();
  if (!query) return data;

  return data.filter((row) =>
    [row.name, row.email, row.company].some((value) => value.toLowerCase().includes(query)),
  );
}

function sortData(
  data: TableSortRow[],
  sortBy: keyof TableSortRow | null,
  reversed: boolean,
  search: string,
): TableSortRow[] {
  const filtered = filterData(data, search);
  if (!sortBy) return filtered;

  return [...filtered].sort((left, right) => {
    const result = left[sortBy].localeCompare(right[sortBy]);
    return reversed ? -result : result;
  });
}

export function TableSort({
  data,
  searchPlaceholder = "Search by any field",
  emptyMessage = "Nothing found",
  onRowClick,
}: TableSortProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<keyof TableSortRow | null>(null);
  const [reversed, setReversed] = useState(false);
  const sortedData = useMemo(
    () => sortData(data, sortBy, reversed, search),
    [data, reversed, search, sortBy],
  );

  const setSorting = (field: keyof TableSortRow) => {
    const nextReversed = field === sortBy ? !reversed : false;
    setReversed(nextReversed);
    setSortBy(field);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
  };

  const rows = sortedData.map((row) => (
    <Table.Tr
      key={`${row.email}\u0000${row.name}`}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      className={onRowClick ? classes.clickableRow : undefined}
    >
      <Table.Td>{row.name}</Table.Td>
      <Table.Td>{row.email}</Table.Td>
      <Table.Td>{row.company}</Table.Td>
    </Table.Tr>
  ));

  return (
    <ScrollArea>
      <TextInput
        placeholder={searchPlaceholder}
        mb="md"
        leftSection={<IconSearch size={16} stroke={1.5} />}
        value={search}
        onChange={handleSearchChange}
      />
      <Table horizontalSpacing="md" verticalSpacing="xs" miw={700} layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <SortableHeader
              sorted={sortBy === "name"}
              reversed={reversed}
              onSort={() => setSorting("name")}
            >
              Name
            </SortableHeader>
            <SortableHeader
              sorted={sortBy === "email"}
              reversed={reversed}
              onSort={() => setSorting("email")}
            >
              Email
            </SortableHeader>
            <SortableHeader
              sorted={sortBy === "company"}
              reversed={reversed}
              onSort={() => setSorting("company")}
            >
              Company
            </SortableHeader>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text fw={500} ta="center">
                  {emptyMessage}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
