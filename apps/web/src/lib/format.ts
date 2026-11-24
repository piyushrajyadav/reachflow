const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dateTimeSeconds = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

export const formatDateTime = (iso: string | number | Date | null | undefined, seconds = false) =>
  iso ? (seconds ? dateTimeSeconds : dateTime).format(new Date(iso)) : "—";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });

export function formatRelative(iso: string | Date, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return "now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export const formatNumber = (n: number) => n.toLocaleString();

export function formatDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 48) return rest ? `${h} h ${rest} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** value for <input type="datetime-local"> in the user's local timezone */
export function toLocalInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
