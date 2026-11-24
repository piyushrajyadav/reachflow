import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Layers } from "lucide-react";
import { campaignsApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { useCampaigns } from "../../hooks/queries";
import type { Campaign } from "../../types/api";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/EmptyState";
import { CampaignStatusBadge } from "../../components/ui/StatusBadge";
import { formatDateTime, formatNumber } from "../../lib/format";

function Progress({ c }: { c: Campaign }) {
  const done = c.sentCount + c.failedCount;
  const pct = c.totalEmails ? Math.round((done / c.totalEmails) * 100) : 0;
  return (
    <div className="w-40">
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="tabular mt-1.5 text-xs text-muted">
        {formatNumber(c.sentCount)} / {formatNumber(c.totalEmails)} sent{c.failedCount ? ` · ${formatNumber(c.failedCount)} failed` : ""}
      </p>
    </div>
  );
}

export function CampaignsTable({ onCompose }: { onCompose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useCampaigns();

  const cancel = useMutation({
    mutationFn: campaignsApi.cancel,
    onSuccess: ({ cancelled }) => {
      toast.success(`Cancelled ${formatNumber(cancelled)} pending emails.`);
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const columns: Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      className: "max-w-[260px]",
      cell: (c) => (
        <div className="leading-tight">
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block truncate text-xs text-muted">{c.subject}</span>
        </div>
      )
    },
    { key: "start", header: "Starts", cell: (c) => <span className="whitespace-nowrap font-mono text-[13px]">{formatDateTime(c.startAt)}</span> },
    { key: "pace", header: "Pacing", cell: (c) => <span className="whitespace-nowrap text-[13px] text-ink-2">{c.delayMs / 1000}s gap · {formatNumber(c.hourlyLimit)}/h</span> },
    { key: "progress", header: "Progress", cell: (c) => <Progress c={c} /> },
    { key: "status", header: "Status", cell: (c) => <CampaignStatusBadge status={c.status} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (c) =>
        c.status === "SCHEDULED" || c.status === "PROCESSING" ? (
          <Button
            size="sm"
            variant="ghost"
            loading={cancel.isPending && cancel.variables === c.id}
            onClick={() => window.confirm(`Cancel “${c.name}”? Emails not yet sent will be dropped.`) && cancel.mutate(c.id)}
          >
            Cancel
          </Button>
        ) : null
    }
  ];

  return (
    <DataTable
      columns={columns}
      rows={data}
      rowKey={(c) => c.id}
      loading={isLoading}
      error={error ? errorMessage(error) : null}
      onRetry={() => void refetch()}
      empty={
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No campaigns yet"
          description="Each time you schedule emails, they’re grouped into a campaign you can track and cancel here."
          action={<Button variant="primary" onClick={onCompose}>Compose a new email</Button>}
        />
      }
    />
  );
}
