import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<T> {
  key: keyof T | null;
  direction: SortDirection;
}

/**
 * Client-side sorting for `<DataTable />`.
 *
 * Swap this out for a server-driven implementation by keeping the same return
 * shape — the table component only cares about `rows`, `sort` and `toggleSort`.
 */
export function useDataTable<T extends Record<string, unknown>>(data: T[]) {
  const [sort, setSort] = useState<SortState<T>>({ key: null, direction: "asc" });

  const rows = useMemo(() => {
    if (!sort.key) return data;

    const key = sort.key;
    return [...data].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      const result =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));

      return sort.direction === "asc" ? result : -result;
    });
  }, [data, sort]);

  function toggleSort(key: keyof T) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return { rows, sort, toggleSort };
}
