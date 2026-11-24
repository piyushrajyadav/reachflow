import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { formatNumber } from "../../lib/format";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  if (total <= pageSize) return total ? <p className="px-5 py-3 text-xs text-muted tabular">{formatNumber(total)} total</p> : null;
  const totalPages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3">
      <p className="text-xs text-muted tabular">{formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="size-4" />} />
        <span className="text-xs text-muted tabular">{page} / {totalPages}</span>
        <Button size="sm" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)} icon={<ChevronRight className="size-4" />} />
      </div>
    </div>
  );
}
