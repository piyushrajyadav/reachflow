import type { Redis } from "ioredis";

export const WINDOW_MS = 3_600_000;
const PREFIX = "rf:rl";

/**
 * Atomic "reserve one send" script. Everything happens in one Redis round trip so concurrent
 * workers (or API instances) can never over-spend a quota.
 *
 * KEYS 1-3  hourly counters   (global, sender, campaign+sender) for the *current* window
 * KEYS 4-6  deferral counters (same scopes) - rank of jobs pushed to later windows
 * KEYS 7    spacing cursor    (earliest time the sender may send next)
 * ARGV      now, windowMs, gapMs, limitGlobal, limitSender, limitCampaign, maxInlineWaitMs
 *
 * Returns {code, at, scope, used}
 *   code 1 = granted      at = reserved send slot (>= now; caller sleeps until then)
 *   code 2 = quota hit    at = time this job should run again (rank-based, in a later window)
 *   code 3 = too crowded  at = time to retry (spacing queue is longer than maxInlineWait)
 *   scope  = 1 global | 2 sender | 3 campaign
 */
const RESERVE_LUA = `
-- + 0.0 keeps arithmetic in floating point (epoch ms overflow 32-bit integers in Lua 5.3 runtimes)
local now = tonumber(ARGV[1]) + 0.0
local win = tonumber(ARGV[2]) + 0.0
local gap = tonumber(ARGV[3]) + 0.0
local maxWait = tonumber(ARGV[7])
local limits = { tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6]) }
local used = {}
for i = 1, 3 do
  used[i] = tonumber(redis.call('GET', KEYS[i]) or '0')
end
for i = 1, 3 do
  if used[i] >= limits[i] then
    local rank = redis.call('INCR', KEYS[3 + i]) - 1
    redis.call('PEXPIRE', KEYS[3 + i], win * 2)
    local ahead = math.floor(rank / limits[i]) + 1
    local at = (math.floor(now / win) + ahead) * win + (rank % limits[i]) * gap
    return { 2, string.format('%.0f', at), i, used[i] }
  end
end
local nextAllowed = tonumber(redis.call('GET', KEYS[7]) or '0')
local slot = now
if nextAllowed > now then slot = nextAllowed end
if slot - now > maxWait then
  return { 3, string.format('%.0f', slot), 0, 0 }
end
redis.call('SET', KEYS[7], tostring(slot + gap), 'PX', (slot + gap - now) + 60000)
for i = 1, 3 do
  redis.call('INCR', KEYS[i])
  redis.call('PEXPIRE', KEYS[i], win * 2)
end
return { 1, string.format('%.0f', slot), 0, used[2] + 1 }
`;

export type Scope = "global" | "sender" | "campaign";
const SCOPES: Scope[] = ["global", "sender", "campaign"];

export interface ReserveInput {
  senderId: string;
  campaignId: string;
  now: number;
  gapMs: number;
  limitGlobal: number;
  limitSender: number;
  limitCampaign: number;
  maxInlineWaitMs?: number;
}

export type ReserveResult =
  | { status: "granted"; slotAt: number }
  | { status: "rate_limited"; retryAt: number; scope: Scope; limit: number; windowStart: number }
  | { status: "crowded"; retryAt: number };

export const windowStartOf = (t: number) => Math.floor(t / WINDOW_MS) * WINDOW_MS;

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  private keys(i: ReserveInput) {
    const w = Math.floor(i.now / WINDOW_MS);
    const q = (s: string) => `${PREFIX}:q:${s}:${w}`;
    const d = (s: string) => `${PREFIX}:d:${s}:${w}`;
    return [
      q("global"), q(`sender:${i.senderId}`), q(`campaign:${i.campaignId}:${i.senderId}`),
      d("global"), d(`sender:${i.senderId}`), d(`campaign:${i.campaignId}:${i.senderId}`),
      `${PREFIX}:next:${i.senderId}`
    ];
  }

  async reserve(i: ReserveInput): Promise<ReserveResult> {
    const raw = (await this.redis.eval(
      RESERVE_LUA,
      7,
      ...this.keys(i),
      String(i.now), String(WINDOW_MS), String(i.gapMs),
      String(i.limitGlobal), String(i.limitSender), String(i.limitCampaign),
      String(i.maxInlineWaitMs ?? 30_000)
    )) as Array<number | string>;
    const [code, at, scopeIdx] = raw.map(Number);
    if (code === 1) return { status: "granted", slotAt: at };
    if (code === 3) return { status: "crowded", retryAt: at };
    const scope = SCOPES[scopeIdx - 1];
    const limit = [i.limitGlobal, i.limitSender, i.limitCampaign][scopeIdx - 1];
    return { status: "rate_limited", retryAt: at, scope, limit, windowStart: windowStartOf(i.now) };
  }

  /** Current-window usage for a sender (dashboard). */
  async senderUsage(senderId: string, now = Date.now()): Promise<number> {
    const w = Math.floor(now / WINDOW_MS);
    return Number((await this.redis.get(`${PREFIX}:q:sender:${senderId}:${w}`)) ?? 0);
  }

  /** True only for the first caller per (sender, scope, window): used to notify Slack once. */
  async claimNotification(senderId: string, scope: string, windowStart: number): Promise<boolean> {
    const res = await this.redis.set(`${PREFIX}:n:${senderId}:${scope}:${windowStart}`, "1", "PX", WINDOW_MS * 2, "NX");
    return res === "OK";
  }
}
