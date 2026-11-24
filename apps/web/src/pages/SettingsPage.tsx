import { SendersSection } from "../features/settings/SendersSection";
import { SlackSection } from "../features/settings/SlackSection";
import { SystemSection } from "../features/settings/SystemSection";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-[40px] leading-none tracking-tight">Settings</h1>
      <p className="mb-8 mt-2 text-[13px] text-muted">Where emails come from, who gets alerted, and what the server enforces.</p>
      <div className="space-y-6">
        <SendersSection />
        <SlackSection />
        <SystemSection />
      </div>
    </div>
  );
}
