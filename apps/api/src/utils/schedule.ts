const HOUR_MS = 3_600_000;

export interface PlanInput {
  count: number;
  senderCount: number;
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
}

export interface PlannedSlot {
  senderIndex: number;
  scheduledAt: Date;
}

/**
 * Computes the *expected* send time of every recipient.
 *
 * Recipients are dealt round-robin to senders (order preserved inside each sender).
 * Per sender: consecutive emails are at least `delayMs` apart and no more than `hourlyLimit`
 * emails fall in any rolling hour. The worker still enforces real limits at send time with
 * Redis; this plan only gives the dashboard an honest ETA and spreads the BullMQ delays.
 */
export function planSchedule({ count, senderCount, startAt, delayMs, hourlyLimit }: PlanInput): PlannedSlot[] {
  const perSender: number[][] = Array.from({ length: senderCount }, () => []);
  const slots: PlannedSlot[] = [];
  for (let i = 0; i < count; i++) {
    const senderIndex = i % senderCount;
    const times = perSender[senderIndex];
    const k = times.length;
    let t = startAt.getTime() + k * delayMs;
    if (k >= hourlyLimit) t = Math.max(t, times[k - hourlyLimit] + HOUR_MS);
    if (k > 0) t = Math.max(t, times[k - 1] + delayMs);
    times.push(t);
    slots.push({ senderIndex, scheduledAt: new Date(t) });
  }
  return slots;
}
