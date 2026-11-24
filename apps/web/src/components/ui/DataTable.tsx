import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";
import { Skeleton } from "./Spinner";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: ReactNode;
  skeletonRows?: number;
}

/** Generic table with loading skeleton, error and empty states, so each feature only describes its columns. */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, skeletonRows = 6 }: Props<T>) {
  if (error && !rows?.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <AlertTriangle className="size-6 text-danger" />
        <div>
          <p className="font-medium">Couldn’t load this list</p>
          <p className="mt-1 text-[13px] text-muted">{error}</p>
        </div>
        {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
      </div>
    );
  }
  if (!loading && rows && rows.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading}>
          {loading && !rows
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  {columns.map((c, j) => (
                    <td key={c.key} className="px-5 py-4"><Skeleton className={j === 0 ? "w-44" : j === columns.length - 1 ? "w-20" : "w-32"} /></td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)} className="border-b border-line/70 last:border-0 hover:bg-paper/60">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-5 py-3.5 align-middle", c.className)}>{c.cell(row)}</td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
