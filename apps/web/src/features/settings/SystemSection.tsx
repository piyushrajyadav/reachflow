import { useHealth, useStats } from "../../hooks/queries";
import { queueDashboardUrl } from "../../api/endpoints";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { SettingsSection } from "./SettingsSection";

function Dot({ ok, pending }: { ok?: boolean; pending: boolean }) {
  return <span className={cn("inline-block size-2 rounded-full", pending ? "bg-line-strong" : ok ? "bg-brand" : "bg-danger")} />;
}

export function SystemSection() {
  const { data: health, isLoading } = useHealth();
  const { data: stats } = useStats();
  const services: [string, boolean | undefined][] = [
    ["PostgreSQL", health?.database],
    ["Redis", health?.redis],
    ["Elasticsearch", health?.elasticsearch],
    ["Queue worker", health ? health.workers > 0 : undefined]
  ];
  const limits: [string, string][] = stats
    ? [
        ["Worker concurrency", `${stats.limits.workerConcurrency} jobs at once`],
        ["Minimum delay between sends", `${stats.limits.minDelayMs / 1000}s per sender`],
        ["Hourly limit per sender", formatNumber(stats.limits.perSenderPerHour)],
        ["Hourly limit, all senders", formatNumber(stats.limits.globalPerHour)]
      ]
    : [];
  return (
    <SettingsSection
      title="System"
      description="Live status of the services behind the queue, and the limits the server enforces."
      action={<a href={queueDashboardUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-brand hover:underline">Open Bull Board →</a>}
    >
      <div className="grid gap-8 sm:grid-cols-2">
        <ul className="space-y-3">
          {services.map(([name, ok]) => (
            <li key={name} className="flex items-center justify-between text-[13px]">
              <span className="text-ink-2">{name}</span>
              <span className="inline-flex items-center gap-2">
                <Dot ok={ok} pending={isLoading || ok === undefined} />
                {isLoading || ok === undefined ? "Checking…" : ok ? "Running" : "Unavailable"}
              </span>
            </li>
          ))}
        </ul>
        <dl className="space-y-3">
          {limits.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-[13px]">
              <dt className="text-ink-2">{k}</dt>
              <dd className="tabular font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SettingsSection>
  );
}
