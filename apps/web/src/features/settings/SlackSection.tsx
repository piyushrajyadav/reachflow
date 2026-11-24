import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { slackApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { useSlackStatus } from "../../hooks/queries";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Spinner";
import { SettingsSection } from "./SettingsSection";

export function SlackSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useSlackStatus();
  const [params, setParams] = useSearchParams();
  const [channel, setChannel] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["slack"] });

  // Slack redirects back here with ?slack=connected|cancelled|error.
  useEffect(() => {
    const result = params.get("slack");
    if (!result) return;
    if (result === "connected") toast.success("Slack connected. Send a test message to confirm.");
    else if (result === "cancelled") toast("Slack connection cancelled.");
    else toast.error(params.get("reason") ?? "Slack connection failed.");
    void refresh();
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setChannel(data?.channelId ?? ""), [data?.channelId]);

  const test = useMutation({
    mutationFn: slackApi.test,
    onSuccess: () => toast.success("Test message sent to Slack."),
    onError: (e) => toast.error(errorMessage(e))
  });
  const disconnect = useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: () => { toast.success("Slack disconnected."); void refresh(); },
    onError: (e) => toast.error(errorMessage(e))
  });
  const saveChannel = useMutation({
    mutationFn: () => slackApi.setChannel(channel.trim() || null),
    onSuccess: () => { toast.success(channel.trim() ? "Alerts will post to that channel." : "Alerts will arrive as a direct message."); void refresh(); },
    onError: (e) => toast.error(errorMessage(e))
  });

  const connectLink = (label: string) => (
    <a href={slackApi.connectUrl} className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-hover">{label}</a>
  );

  return (
    <SettingsSection
      title="Slack alerts"
      description="Get a Slack message the moment a sender reaches its hourly limit. Pending emails are rescheduled automatically; the alert is just a heads-up."
      action={
        data?.connected ? <Button size="sm" variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</Button>
        : data?.needsReconnect ? connectLink("Reconnect Slack")
        : data?.configured ? connectLink("Connect Slack") : null
      }
    >
      {isLoading ? (
        <Skeleton className="h-10 w-72" />
      ) : error ? (
        <p className="text-[13px] text-danger">{errorMessage(error)}</p>
      ) : !data?.configured ? (
        <p className="text-[13px] text-muted">Slack OAuth isn’t configured on the server (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI).</p>
      ) : data.needsReconnect ? (
        <p className="text-[13px] text-amber">Slack access was revoked or expired. Reconnect to resume alerts.</p>
      ) : data.connected ? (
        <div className="space-y-5">
          <p className="text-[13px]">
            <span className="mr-2 inline-block size-2 rounded-full bg-brand align-middle" />
            Connected to <strong>{data.teamName ?? "your workspace"}</strong>. Alerts go to {data.deliversTo === "channel" ? <>channel <code className="font-mono text-xs">{data.channelId}</code></> : "you as a direct message"}.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); saveChannel.mutate(); }} className="flex flex-wrap items-end gap-3">
            <Field label="Channel ID (optional)" hint="Invite the bot first: /invite @ReachFlow. Leave empty for a DM." className="w-72 max-w-full">
              {(p) => <Input {...p} value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="C0123456789" className="font-mono" />}
            </Field>
            <Button type="submit" loading={saveChannel.isPending} disabled={channel.trim() === (data.channelId ?? "")}>Save</Button>
            <Button type="button" loading={test.isPending} onClick={() => test.mutate()}>Send test message</Button>
          </form>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Not connected. Rate-limit hits are still handled; you just won’t get a Slack message.</p>
      )}
    </SettingsSection>
  );
}
