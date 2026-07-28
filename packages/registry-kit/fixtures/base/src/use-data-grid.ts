import { useMemo } from "react";

export function useDataGrid(rows: string[]) {
  const sorted = useMemo(() => [...rows].sort(), [rows]);
  return { sorted };
}
