import { ExternalLink, Inbox, Search, Send } from "lucide-react";
import type { EmailRow } from "../../types/api";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/EmptyState";
import { EmailStatusBadge } from "../../components/ui/StatusBadge";
import { formatDateTime, formatRelative } from "../../lib/format";

const recipient: Column<EmailRow> = {
  key: "recipient",
  header: "Recipient",
  cell: (e) => <span className="font-medium">{e.recipient}</span>
};

const subject: Column<EmailRow> = {
  key: "subject",
  header: "Subject",
  className: "max-w-[280px]",
  cell: (e) => <span className="block truncate text-ink-2" title={e.subject}>{e.subject}</span>
};

const campaign: Column<EmailRow> = {
  key: "campaign",
  header: "Campaign",
  className: "max-w-[180px]",
  cell: (e) => <span className="block truncate text-muted" title={e.campaign.name}>{e.campaign.name}</span>
};

const scheduledColumns: Column<EmailRow>[] = [
  recipient,
  subject,
  {
    key: "scheduled",
    header: "Scheduled time",
    cell: (e) => (
      <div className="whitespace-nowrap leading-tight">
        <span className="font-mono text-[13px]">{formatDateTime(e.scheduledAt)}</span>
        <span className="block text-xs text-muted">{formatRelative(e.scheduledAt)}</span>
      </div>
    )
  },
  {
    key: "status",
    header: "Status",
    cell: (e) => (
      <div className="space-y-1">
        <EmailStatusBadge status={e.status} />
        {e.status === "RETRYING" && e.errorMessage && (
          <p className="max-w-[200px] truncate text-xs text-muted" title={e.errorMessage}>{e.errorMessage}</p>
        )}
      </div>
    )
  },
  campaign
];

const sentColumns: Column<EmailRow>[] = [
  recipient,
  subject,
  {
    key: "sent",
    header: "Sent time",
    cell: (e) => <span className="whitespace-nowrap font-mono text-[13px]">{formatDateTime(e.sentAt ?? e.failedAt, true)}</span>
  },
  {
    key: "status",
    header: "Status",
    cell: (e) => (
      <div className="space-y-1">
        <EmailStatusBadge status={e.status} />
        {e.status === "FAILED" && e.errorMessage && (
          <p className="max-w-[220px] truncate text-xs text-danger" title={e.errorMessage}>{e.errorMessage}</p>
        )}
      </div>
    )
  },
  {
    key: "preview",
    header: "Inbox",
    cell: (e) =>
      e.previewUrl ? (
        <a href={e.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
          Preview <ExternalLink className="size-3" />
        </a>
      ) : (
        <span className="text-muted">—</span>
      )
  }
];

interface Props {
  view: "scheduled" | "sent";
  rows: EmailRow[] | undefined;
  loading: boolean;
  error: string | null;
  searching: boolean;
  onRetry: () => void;
  onCompose: () => void;
}

export function EmailsTable({ view, rows, loading, error, searching, onRetry, onCompose }: Props) {
  const empty = searching ? (
    <EmptyState icon={<Search className="size-5" />} title="No matches" description="Nothing matches that search. Try a recipient address or a word from the subject." />
  ) : view === "scheduled" ? (
    <EmptyState
      icon={<Inbox className="size-5" />}
      title="Nothing scheduled"
      description="Upload a recipient list and pick a start time. Queued emails show up here until they’re delivered."
      action={<button onClick={onCompose} className="text-[13px] font-medium text-brand hover:underline">Compose a new email →</button>}
    />
  ) : (
    <EmptyState icon={<Send className="size-5" />} title="Nothing sent yet" description="Delivered and failed emails are listed here as soon as the worker processes them." />
  );

  return (
    <DataTable
      columns={view === "scheduled" ? scheduledColumns : sentColumns}
      rows={rows}
      rowKey={(e) => e.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={empty}
    />
  );
}
