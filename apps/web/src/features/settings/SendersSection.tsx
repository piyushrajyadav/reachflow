import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Sparkles } from "lucide-react";
import { sendersApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { useSenders } from "../../hooks/queries";
import type { Sender } from "../../types/api";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Spinner";
import { cn } from "../../lib/cn";
import { SettingsSection } from "./SettingsSection";

function SenderRow({ sender }: { sender: Sender }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => sendersApi.setActive(sender.id, !sender.isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["senders"] }),
    onError: (e) => toast.error(errorMessage(e))
  });
  const pct = Math.min(100, Math.round((sender.sentThisHour / sender.hourlyLimit) * 100));
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className={cn("truncate font-medium", !sender.isActive && "text-muted line-through")}>{sender.email}</p>
        <p className="mt-0.5 font-mono text-xs text-muted">{sender.smtpHost}:{sender.smtpPort}</p>
      </div>
      <div className="flex items-center gap-5">
        <div className="w-36" title="Emails sent this UTC hour">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div className={cn("h-full transition-[width]", pct >= 100 ? "bg-amber" : "bg-brand")} style={{ width: `${pct}%` }} />
          </div>
          <p className="tabular mt-1.5 text-xs text-muted">{sender.sentThisHour} / {sender.hourlyLimit} this hour</p>
        </div>
        <Button size="sm" variant="ghost" loading={toggle.isPending} onClick={() => toggle.mutate()}>
          {sender.isActive ? "Disable" : "Enable"}
        </Button>
      </div>
    </li>
  );
}

function SmtpForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", smtpHost: "smtp.ethereal.email", smtpPort: 587, smtpUser: "", smtpPassword: "" });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "smtpPort" ? Number(e.target.value) : e.target.value }));

  const add = useMutation({
    mutationFn: () => sendersApi.addSmtp(form),
    onSuccess: () => {
      toast.success("Sender added and verified.");
      void qc.invalidateQueries({ queryKey: ["senders"] });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };
  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 rounded-lg border border-line bg-paper/60 p-4 sm:grid-cols-2">
      <Field label="From address">{(p) => <Input {...p} type="email" required value={form.email} onChange={set("email")} />}</Field>
      <Field label="SMTP username">{(p) => <Input {...p} required autoComplete="off" value={form.smtpUser} onChange={set("smtpUser")} />}</Field>
      <Field label="SMTP host">{(p) => <Input {...p} required value={form.smtpHost} onChange={set("smtpHost")} />}</Field>
      <Field label="Port">{(p) => <Input {...p} type="number" required value={form.smtpPort} onChange={set("smtpPort")} />}</Field>
      <Field label="SMTP password" className="sm:col-span-2">{(p) => <Input {...p} type="password" required autoComplete="new-password" value={form.smtpPassword} onChange={set("smtpPassword")} />}</Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={add.isPending}>Verify and add</Button>
      </div>
    </form>
  );
}

export function SendersSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useSenders();
  const [adding, setAdding] = useState(false);

  const ethereal = useMutation({
    mutationFn: sendersApi.addEthereal,
    onSuccess: (s) => {
      toast.success(`Created ${s.email}`);
      void qc.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  return (
    <SettingsSection
      title="Senders"
      description="Emails are shared across active senders, and each sender has its own hourly limit. Messages go to Ethereal’s fake inbox, so nothing reaches real recipients."
      action={
        <div className="flex gap-2">
          <Button size="sm" icon={<Sparkles className="size-3.5" />} loading={ethereal.isPending} onClick={() => ethereal.mutate()}>New Ethereal inbox</Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding((a) => !a)}>Custom SMTP</Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : error ? (
        <p className="text-[13px] text-danger">{errorMessage(error)}</p>
      ) : data?.length ? (
        <ul className="divide-y divide-line">{data.map((s) => <SenderRow key={s.id} sender={s} />)}</ul>
      ) : (
        <p className="text-[13px] text-muted">No senders yet. Create an Ethereal inbox to start sending.</p>
      )}
      {adding && <SmtpForm onDone={() => setAdding(false)} />}
    </SettingsSection>
  );
}
