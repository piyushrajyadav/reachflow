import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { ExternalLink, LogOut, Settings } from "lucide-react";
import { Logo } from "../ui/Logo";
import { Avatar } from "../ui/Avatar";
import { useAuth } from "../../hooks/useAuth";
import { queueDashboardUrl } from "../../api/endpoints";
import { cn } from "../../lib/cn";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", isActive ? "bg-ink/[0.07] text-ink" : "text-ink-2 hover:text-ink");

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-md py-1 pl-1 pr-2 hover:bg-ink/5"
      >
        <Avatar name={user.name} src={user.avatar} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium">{user.name}</span>
          <span className="block max-w-[200px] truncate text-xs text-muted">{user.email}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="animate-fade absolute right-0 z-40 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg shadow-ink/10">
          <div className="border-b border-line px-3 py-2.5 sm:hidden">
            <p className="text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <button
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink-2 hover:bg-paper hover:text-ink"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Primary" className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>Emails</NavLink>
            <NavLink to="/settings" className={navClass}>
              <span className="inline-flex items-center gap-1.5"><Settings className="size-3.5" />Settings</span>
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={queueDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-ink/5 hover:text-ink md:inline-flex"
          >
            Queue monitor <ExternalLink className="size-3.5" />
          </a>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
