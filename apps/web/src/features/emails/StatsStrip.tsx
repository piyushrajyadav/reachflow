import { useStats } from "../../hooks/queries";
import { Skeleton } from "../../components/ui/Spinner";
import { formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";

export function StatsStrip() {
  const { data, isLoading } = useStats();
  const items = [
    { label: "Scheduled", value: data?.scheduled, note: data?.rateLimited ? `${formatNumber(data.rateLimited)} delayed by limits` : "waiting to send", tone: "" },
    { label: "Sent", value: data?.sent, note: "delivered to SMTP", tone: "text-brand" },
    { label: "Failed", value: data?.failed, note: "after all retries", tone: data?.failed ? "text-danger" : "" },
    { label: "Active campaigns", value: data?.activeCampaigns, note: `${formatNumber(data?.total ?? 0)} emails in total`, tone: "" }
  ];
  return (
    <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-x">
      {items.map((s, i) => (
        <div key={s.label} className={cn("px-5 py-4", i > 1 && "border-t border-line sm:border-t-0", i % 2 === 1 && "border-l border-line sm:border-l-0")}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{s.label}</dt>
          <dd className="mt-1.5">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className={cn("font-display text-[34px] leading-none tabular", s.tone)}>{formatNumber(s.value ?? 0)}</span>
            )}
          </dd>
          <p className="mt-1.5 truncate text-xs text-muted">{s.note}</p>
        </div>
      ))}
    </dl>
  );
}
