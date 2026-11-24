import { describe, expect, it, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { RateLimiter, WINDOW_MS } from "../src/services/rateLimiter.service";

const HOUR = WINDOW_MS;
// A fixed instant at the very start of an hour window keeps the maths easy to read.
const T0 = Math.floor(Date.UTC(2030, 0, 1, 10, 0, 0) / HOUR) * HOUR;

const base = { senderId: "s1", campaignId: "c1", gapMs: 2000, limitGlobal: 1000, limitSender: 200, limitCampaign: 200 };

describe("RateLimiter.reserve", () => {
  let rl: RateLimiter;
  beforeEach(async () => {
    const redis = new RedisMock();
    await redis.flushall();
    rl = new RateLimiter(redis as never);
  });

  it("grants the first send immediately and spaces the next ones by the minimum delay", async () => {
    const a = await rl.reserve({ ...base, now: T0 });
    const b = await rl.reserve({ ...base, now: T0 });
    const c = await rl.reserve({ ...base, now: T0 });
    expect(a).toEqual({ status: "granted", slotAt: T0 });
    expect(b).toEqual({ status: "granted", slotAt: T0 + 2000 });
    expect(c).toEqual({ status: "granted", slotAt: T0 + 4000 });
  });

  it("never grants more than the hourly limit, even for concurrent callers", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => rl.reserve({ ...base, limitSender: 10, limitCampaign: 10, gapMs: 0, now: T0 }))
    );
    expect(results.filter((r) => r.status === "granted")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rate_limited")).toHaveLength(15);
  });

  it("defers over-limit jobs into later windows, in arrival order, without losing any", async () => {
    const input = { ...base, limitSender: 10, limitCampaign: 10, gapMs: 0, now: T0 + 5 * 60_000 };
    for (let i = 0; i < 10; i++) await rl.reserve(input);
    const deferred = [];
    for (let i = 0; i < 15; i++) deferred.push(await rl.reserve(input));
    const times = deferred.map((d) => (d.status === "rate_limited" ? d.retryAt : -1));
    expect(times.every((t) => t >= T0 + HOUR)).toBe(true);
    // ranks 0-9 -> next hour, ranks 10-14 -> the hour after (limit is 10 per hour)
    expect(times.slice(0, 10).every((t) => t < T0 + 2 * HOUR)).toBe(true);
    expect(times.slice(10).every((t) => t >= T0 + 2 * HOUR)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("reports which scope was hit", async () => {
    const r1 = await rl.reserve({ ...base, limitGlobal: 1, gapMs: 0, now: T0 });
    const r2 = await rl.reserve({ ...base, limitGlobal: 1, gapMs: 0, now: T0 });
    expect(r1.status).toBe("granted");
    expect(r2).toMatchObject({ status: "rate_limited", scope: "global", limit: 1 });
  });

  it("starts a fresh quota in the next window", async () => {
    const tight = { ...base, limitSender: 1, limitCampaign: 1, gapMs: 0 };
    await rl.reserve({ ...tight, now: T0 });
    expect((await rl.reserve({ ...tight, now: T0 + 1000 })).status).toBe("rate_limited");
    expect((await rl.reserve({ ...tight, now: T0 + HOUR + 1 })).status).toBe("granted");
  });

  it("keeps senders independent", async () => {
    const tight = { ...base, limitSender: 1, limitCampaign: 1, gapMs: 0, now: T0 };
    await rl.reserve({ ...tight, senderId: "a" });
    expect((await rl.reserve({ ...tight, senderId: "b" })).status).toBe("granted");
  });

  it("asks the caller to retry later instead of reserving when the spacing queue is too long", async () => {
    const input = { ...base, gapMs: 10_000, maxInlineWaitMs: 15_000, now: T0 };
    await rl.reserve(input); // slot T0
    await rl.reserve(input); // slot T0 + 10s
    await rl.reserve(input); // slot T0 + 20s is beyond the 15s inline wait
    const r = await rl.reserve(input);
    expect(r.status).toBe("crowded");
  });

  it("hands the Slack notification claim to exactly one caller per window", async () => {
    const claims = await Promise.all([1, 2, 3].map(() => rl.claimNotification("s1", "sender", T0)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
