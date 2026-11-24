import { Navigate, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../hooks/useAuth";
import { authApi } from "../api/endpoints";
import { FullPageSpinner } from "../components/layout/AppShell";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.88 0-5.31-1.94-6.18-4.55H2.16v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.82 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.16a11 11 0 0 0 0 9.86l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.36c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.16 7.07l3.66 2.84C6.69 7.3 9.12 5.36 12 5.36Z" />
    </svg>
  );
}

/** A tiny, honest picture of the product: jobs waiting on a timeline, throttled to a rhythm. */
function Timeline() {
  const jobs = [
    { x: 8, label: "09:00", state: "done" },
    { x: 24, label: "09:00:02", state: "done" },
    { x: 40, label: "09:00:04", state: "done" },
    { x: 56, label: "09:00:06", state: "active" },
    { x: 72, label: "10:00", state: "wait" },
    { x: 88, label: "10:00:02", state: "wait" }
  ];
  return (
    <figure aria-hidden="true" className="mt-12 max-w-md">
      <svg viewBox="0 0 100 26" className="w-full overflow-visible">
        <line x1="4" y1="10" x2="96" y2="10" stroke="#cfcabb" strokeWidth="0.4" />
        <line x1="64" y1="3" x2="64" y2="17" stroke="#b36a00" strokeWidth="0.3" strokeDasharray="1 1" />
        {jobs.map((j) => (
          <g key={j.x}>
            <circle
              cx={j.x} cy="10" r={j.state === "active" ? 2.4 : 1.7}
              fill={j.state === "done" ? "#0e6b52" : j.state === "active" ? "#f6f5f1" : "#f6f5f1"}
              stroke={j.state === "wait" ? "#7d818a" : "#0e6b52"} strokeWidth="0.6"
            />
            <text x={j.x} y="19" textAnchor="middle" fontSize="2.6" fill="#7d818a" fontFamily="IBM Plex Mono, monospace">{j.label}</text>
          </g>
        ))}
        <text x="64" y="2" textAnchor="middle" fontSize="2.4" fill="#9a5b00" fontFamily="IBM Plex Mono, monospace">hourly limit</text>
      </svg>
      <figcaption className="mt-3 text-xs text-muted">Sends are spaced, capped per hour, and pick up exactly where they left off after a restart.</figcaption>
    </figure>
  );
}

export function LoginPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const error = params.get("error");

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="flex flex-col justify-between px-8 py-10 sm:px-14 lg:px-20">
        <Logo />
        <div className="py-16">
          <h1 className="max-w-lg font-display text-[52px] leading-[1.02] tracking-tight sm:text-[64px]">
            Send on schedule.<br />Stay under the limit.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-2">
            Upload a list, choose when to start and how fast to go. ReachFlow queues every email, throttles per sender, and tells you in Slack the moment a limit is hit.
          </p>
          <Timeline />
        </div>
        <p className="text-xs text-muted">Built on BullMQ, Redis, PostgreSQL and Elasticsearch.</p>
      </section>

      <section className="flex items-center justify-center border-line bg-surface px-8 py-16 lg:border-l">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-[32px] leading-tight">Sign in</h2>
          <p className="mt-1.5 text-[13px] text-muted">Use your Google account to open your workspace.</p>

          {error && (
            <div role="alert" className="mt-6 flex gap-2.5 rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
              <AlertCircle className="mt-px size-4 shrink-0" /> {error}
            </div>
          )}

          <a
            href={authApi.loginUrl}
            className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-md border border-line-strong bg-surface text-sm font-medium transition-colors hover:bg-paper"
          >
            <GoogleMark /> Continue with Google
          </a>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            We only read your name, email address and profile photo.
          </p>
        </div>
      </section>
    </div>
  );
}
