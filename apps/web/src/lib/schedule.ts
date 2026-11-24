const HOUR_MS = 3_600_000;

/** Same pacing rules as the API planner: min gap per sender, never more than `hourlyLimit` per rolling hour. */
export function estimateFinish(count: number, senderCount: number, startAt: number, delayMs: number, hourlyLimit: number): number {
  const perSender = Math.ceil(count / Math.max(1, senderCount));
  const times: number[] = [];
  for (let k = 0; k < perSender; k++) {
    let t = startAt + k * delayMs;
    if (k >= hourlyLimit) t = Math.max(t, times[k - hourlyLimit] + HOUR_MS);
    if (k > 0) t = Math.max(t, times[k - 1] + delayMs);
    times.push(t);
  }
  return times[times.length - 1] ?? startAt;
}
