import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PenLine, Search } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { Tabs } from "../components/ui/Tabs";
import { EmailsTable } from "../features/emails/EmailsTable";
import { StatsStrip } from "../features/emails/StatsStrip";
import { CampaignsTable } from "../features/campaigns/CampaignsTable";
import { ComposeDrawer } from "../features/compose/ComposeDrawer";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useEmails, useStats } from "../hooks/queries";
import { errorMessage } from "../api/client";

type TabKey = "scheduled" | "sent" | "campaigns";
const PAGE_SIZE = 15;

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab = (["scheduled", "sent", "campaigns"].includes(params.get("tab") ?? "") ? params.get("tab") : "scheduled") as TabKey;
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());
  const { data: stats } = useStats();

  const view = tab === "sent" ? "sent" : "scheduled";
  const emails = useEmails({ view, q, page, pageSize: PAGE_SIZE });

  const changeTab = (next: TabKey) => {
    setParams(next === "scheduled" ? {} : { tab: next });
    setPage(1);
    setSearch("");
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] leading-none tracking-tight">Emails</h1>
          <p className="mt-2 text-[13px] text-muted">Everything queued, sent and failed across your campaigns.</p>
        </div>
        <Button variant="primary" icon={<PenLine className="size-4" />} onClick={() => setComposeOpen(true)}>
          Compose new email
        </Button>
      </div>

      <StatsStrip />

      <section className="mt-8 rounded-lg border border-line bg-surface" aria-label="Email activity">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 pt-4">
          <Tabs
            label="Email views"
            active={tab}
            onChange={changeTab}
            tabs={[
              { key: "scheduled", label: "Scheduled", count: stats?.scheduled },
              { key: "sent", label: "Sent", count: stats ? stats.sent + stats.failed : undefined },
              { key: "campaigns", label: "Campaigns" }
            ]}
          />
          {tab !== "campaigns" && (
            <div className="relative mb-2.5 w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                aria-label="Search emails"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search recipient or subject"
                className="h-9 w-full rounded-md border border-line-strong bg-paper/60 pl-9 pr-3 text-sm placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </div>
          )}
        </div>

        {tab === "campaigns" ? (
          <CampaignsTable onCompose={() => setComposeOpen(true)} />
        ) : (
          <>
            <EmailsTable
              view={view}
              rows={emails.data?.data}
              loading={emails.isLoading}
              error={emails.error ? errorMessage(emails.error) : null}
              searching={Boolean(q)}
              onRetry={() => void emails.refetch()}
              onCompose={() => setComposeOpen(true)}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={emails.data?.meta.total ?? 0} onChange={setPage} />
          </>
        )}
      </section>

      <ComposeDrawer open={composeOpen} onClose={() => setComposeOpen(false)} onScheduled={() => changeTab("scheduled")} />
    </>
  );
}
