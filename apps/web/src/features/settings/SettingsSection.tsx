import type { ReactNode } from "react";

interface Props {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ title, description, action, children }: Props) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
        <div>
          <h2 className="font-display text-[24px] leading-tight">{title}</h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted">{description}</p>
        </div>
        {action}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
