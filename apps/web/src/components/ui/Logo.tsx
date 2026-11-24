import { cn } from "../../lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0e6b52" />
        <path d="M8 11h10M8 16h16M8 21h7" stroke="#f6f5f1" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="23" cy="21" r="2.4" fill="#f6f5f1" />
      </svg>
      <span className="font-display text-[22px] leading-none tracking-tight">ReachFlow</span>
    </span>
  );
}
