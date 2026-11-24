import type { CampaignStatus, EmailStatus } from "../../types/api";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "amber" | "info" | "ok" | "danger";

const tones: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-ink/[0.06] text-ink-2", dot: "bg-muted" },
  amber: { pill: "bg-amber-soft text-amber", dot: "bg-amber" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  ok: { pill: "bg-brand-soft text-brand", dot: "bg-brand" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" }
};

const emailMap: Record<EmailStatus, [string, Tone]> = {
  SCHEDULED: ["Scheduled", "neutral"],
  QUEUED: ["Queued", "neutral"],
  PROCESSING: ["Sending", "info"],
  RETRYING: ["Retrying", "amber"],
  RATE_LIMITED: ["Delayed · limit", "amber"],
  SENT: ["Sent", "ok"],
  FAILED: ["Failed", "danger"],
  CANCELLED: ["Cancelled", "neutral"]
};

const campaignMap: Record<CampaignStatus, [string, Tone]> = {
  DRAFT: ["Draft", "neutral"],
  SCHEDULED: ["Scheduled", "neutral"],
  PROCESSING: ["Sending", "info"],
  COMPLETED: ["Completed", "ok"],
  PARTIALLY_FAILED: ["Partly failed", "amber"],
  FAILED: ["Failed", "danger"],
  CANCELLED: ["Cancelled", "neutral"]
};

function Badge({ label, tone, pulse }: { label: string; tone: Tone; pulse?: boolean }) {
  const t = tones[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", t.pill)}>
      <span className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-pulse")} />
      {label}
    </span>
  );
}

export const EmailStatusBadge = ({ status }: { status: EmailStatus }) => {
  const [label, tone] = emailMap[status];
  return <Badge label={label} tone={tone} pulse={status === "PROCESSING"} />;
};

export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => {
  const [label, tone] = campaignMap[status];
  return <Badge label={label} tone={tone} pulse={status === "PROCESSING"} />;
};
