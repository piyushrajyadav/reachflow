import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-2">{icon}</div>
      <h3 className="font-display text-[22px] leading-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
