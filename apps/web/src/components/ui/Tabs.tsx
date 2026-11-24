import { cn } from "../../lib/cn";

interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
  label: string;
}

export function Tabs<K extends string>({ tabs, active, onChange, label }: Props<K>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6">
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors",
              selected ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("tabular rounded px-1.5 py-px text-xs", selected ? "bg-ink text-paper" : "bg-ink/[0.07] text-ink-2")}>
                {t.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
