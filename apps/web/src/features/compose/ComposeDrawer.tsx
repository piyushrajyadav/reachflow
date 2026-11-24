import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Clock, Send } from "lucide-react";
import { campaignsApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { useSenders, useStats } from "../../hooks/queries";
import { Drawer } from "../../components/ui/Drawer";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { RecipientPicker } from "./RecipientPicker";
import { estimateFinish } from "../../lib/schedule";
import { formatDateTime, formatDuration, formatNumber, toLocalInput } from "../../lib/format";
import type { ParsedRecipients } from "../../lib/recipients";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

interface Errors {
  subject?: string;
  body?: string;
  recipients?: string;
  startAt?: string;
  delay?: string;
  hourly?: string;
}

const defaultStart = () => toLocalInput(new Date(Date.now() + 5 * 60_000));

export function ComposeDrawer({ open, onClose, onScheduled }: Props) {
  // Remount the form on every open so a fresh Idempotency-Key and clean state are used.
  return open ? <ComposeForm onClose={onClose} onScheduled={onScheduled} /> : null;
}

function ComposeForm({ onClose, onScheduled }: Omit<Props, "open">) {
  const qc = useQueryClient();
  const { data: stats } = useStats();
  const { data: senders } = useSenders();
  const minDelaySec = Math.ceil((stats?.limits.minDelayMs ?? 2000) / 1000);
  const activeSenders = senders?.filter((s) => s.isActive).length ?? 0;

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<ParsedRecipients | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [startAt, setStartAt] = useState(defaultStart);
  const [delaySec, setDelaySec] = useState(minDelaySec);
  const [hourly, setHourly] = useState(stats?.limits.perSenderPerHour ?? 200);
  const [errors, setErrors] = useState<Errors>({});

  const effectiveDelay = Math.max(delaySec, minDelaySec);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!subject.trim()) e.subject = "Add a subject line.";
    if (!body.trim()) e.body = "Write something to send.";
    if (!recipients?.valid.length) e.recipients = "Upload a file with at least one valid address.";
    if (!startAt || Number.isNaN(new Date(startAt).getTime())) e.startAt = "Pick a start time.";
    if (!Number.isFinite(delaySec) || delaySec < minDelaySec) e.delay = `Minimum is ${minDelaySec}s (server throttle).`;
    if (!Number.isInteger(hourly) || hourly < 1) e.hourly = "Enter a whole number of 1 or more.";
    return e;
  };

  const estimate = useMemo(() => {
    if (!recipients?.valid.length || !startAt) return null;
    const start = Math.max(new Date(startAt).getTime(), Date.now());
    if (Number.isNaN(start) || hourly < 1) return null;
    const finish = estimateFinish(recipients.valid.length, Math.max(activeSenders, 1), start, effectiveDelay * 1000, hourly);
    return { start, finish };
  }, [recipients, startAt, effectiveDelay, hourly, activeSenders]);

  const schedule = useMutation({
    mutationFn: () =>
      campaignsApi.create(
        {
          subject: subject.trim(), body: body.trim(), recipients: recipients!.valid,
          startAt: new Date(startAt).toISOString(), delayMs: effectiveDelay * 1000, hourlyLimit: hourly
        },
        idempotencyKey
      ),
    onSuccess: (res) => {
      toast.success(`Scheduled ${formatNumber(res.totalEmails)} emails.`);
      void qc.invalidateQueries();
      onScheduled();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const submit = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length === 0) schedule.mutate();
  };

  const count = recipients?.valid.length ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title="Compose new email"
      description="One message, scheduled for every recipient in your list."
      footer={
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 text-xs text-muted" aria-live="polite">
            {estimate ? (
              <>
                <Clock className="mr-1 inline size-3.5 -translate-y-px" />
                {formatNumber(count)} emails · first {formatDateTime(estimate.start)} · finishes in about {formatDuration(estimate.finish - estimate.start)}
              </>
            ) : (
              "Add recipients to see the schedule."
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<Send className="size-4" />} loading={schedule.isPending} onClick={submit}>
              Schedule
            </Button>
          </div>
        </div>
      }
    >
      <form className="space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Subject" error={errors.subject}>
          {(p) => <Input {...p} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question about your onboarding" />}
        </Field>
        <Field label="Body" error={errors.body}>
          {(p) => <Textarea {...p} value={body} rows={7} onChange={(e) => setBody(e.target.value)} placeholder={"Hi there,\n\n…"} />}
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium">Recipients</span>
          <RecipientPicker
            value={recipients}
            fileName={fileName}
            error={errors.recipients}
            onChange={(v, name) => { setRecipients(v); setFileName(name); setErrors((e) => ({ ...e, recipients: undefined })); }}
          />
        </div>

        <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-4">
          <legend className="px-1 text-[13px] font-medium">Delivery</legend>
          <Field label="Start time" error={errors.startAt} hint="Your local time. Past times start immediately.">
            {(p) => <Input {...p} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delay between emails (seconds)" error={errors.delay} hint={`At least ${minDelaySec}s per sender.`}>
              {(p) => <Input {...p} type="number" min={minDelaySec} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />}
            </Field>
            <Field label="Hourly limit (per sender)" error={errors.hourly} hint="Extra emails roll into the next hour.">
              {(p) => <Input {...p} type="number" min={1} value={hourly} onChange={(e) => setHourly(Number(e.target.value))} />}
            </Field>
          </div>
          <p className="text-xs text-muted">
            Sending from {activeSenders || "…"} {activeSenders === 1 ? "sender" : "senders"}; recipients are shared between them in order.
          </p>
        </fieldset>
      </form>
    </Drawer>
  );
}
