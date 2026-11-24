import type { EmailStatus } from "@prisma/client";

/**
 * Email lifecycle.
 *
 *  SCHEDULED -> QUEUED -> PROCESSING -> SENT
 *                 ^           |-> RETRYING ----> PROCESSING
 *                 |           |-> RATE_LIMITED -> PROCESSING
 *                 |           |-> FAILED
 *  any non-terminal -> CANCELLED
 *
 * PROCESSING -> PROCESSING is allowed only for stale-lease takeover (worker crashed mid-send).
 */
export const TRANSITIONS: Record<EmailStatus, EmailStatus[]> = {
  SCHEDULED: ["QUEUED", "PROCESSING", "CANCELLED"],
  QUEUED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SENT", "FAILED", "RETRYING", "RATE_LIMITED", "QUEUED", "PROCESSING", "CANCELLED"],
  RETRYING: ["PROCESSING", "FAILED", "CANCELLED"],
  RATE_LIMITED: ["PROCESSING", "CANCELLED"],
  SENT: [],
  FAILED: [],
  CANCELLED: []
};

export const TERMINAL: EmailStatus[] = ["SENT", "FAILED", "CANCELLED"];
/** Statuses shown on the "Scheduled" tab. */
export const PENDING_STATUSES: EmailStatus[] = ["SCHEDULED", "QUEUED", "PROCESSING", "RETRYING", "RATE_LIMITED"];
/** Statuses a worker may claim for sending. */
export const CLAIMABLE: EmailStatus[] = ["SCHEDULED", "QUEUED", "RETRYING", "RATE_LIMITED"];

export function canTransition(from: EmailStatus, to: EmailStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EmailStatus, to: EmailStatus) {
  if (!canTransition(from, to)) throw new Error(`Illegal email transition ${from} -> ${to}`);
}

/** Statuses from which `to` may be reached; used as the WHERE guard in conditional updates. */
export function sourcesFor(to: EmailStatus): EmailStatus[] {
  return (Object.keys(TRANSITIONS) as EmailStatus[]).filter((s) => TRANSITIONS[s].includes(to));
}
