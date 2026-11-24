import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** Right-hand slide-over with focus trapping, Escape to close and scroll lock. */
export function Drawer({ open, title, description, onClose, footer, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea, select');
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-fade absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="animate-drawer relative flex h-full w-full max-w-[560px] flex-col bg-paper shadow-[-12px_0_40px_-12px_rgba(23,25,31,0.25)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-5">
          <div>
            <h2 id="drawer-title" className="font-display text-[26px] leading-tight">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <footer className="border-t border-line bg-surface px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
