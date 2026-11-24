import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory stand-ins for Postgres, SMTP, Slack ------------------------------------------
type Row = Record<string, any>;
const db = vi.hoisted(() => ({ emails: new Map<string, Row>(), campaigns: new Map<string, Row>(), senders: new Map<string, Row>(), events: [] as Row[] }));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "lt" in v) return row[k] != null && row[k] < v.lt;
    return row[k] === v;
  });

const apply = (row: Row, data: Row) => {
  for (const [k, v] of Object.entries(data)) {
    row[k] = v && typeof v === "object" && "increment" in v ? (row[k] ?? 0) + v.increment : v;
  }
  row.updatedAt = new Date();
};

vi.mock("../src/config/database", () => ({
  prisma: {
    email: {
      findUnique: async ({ where, include }: Row) => {
        const e = db.emails.get(where.id);
        if (!e) return null;
        return include ? { ...e, campaign: db.campaigns.get(e.campaignId), sender: db.senders.get(e.senderId) } : { ...e };
      },
      updateMany: async ({ where, data }: Row) => {
        const hits = [...db.emails.values()].filter((e) => matches(e, where));
        hits.forEach((e) => apply(e, data));
        return { count: hits.length };
      },
      update: async ({ where, data }: Row) => {
        const e = db.emails.get(where.id)!;
        apply(e, data);
        return e;
      },
      groupBy: async ({ where }: Row) => {
        const counts = new Map<string, number>();
        [...db.emails.values()].filter((e) => e.campaignId === where.campaignId).forEach((e) => counts.set(e.status, (counts.get(e.status) ?? 0) + 1));
        return [...counts].map(([status, _count]) => ({ status, _count }));
      }
    },
    campaign: {
      findUnique: async ({ where }: Row) => db.campaigns.get(where.id) ?? null,
      update: async ({ where, data }: Row) => { apply(db.campaigns.get(where.id)!, data); },
      updateMany: async ({ where, data }: Row) => { apply(db.campaigns.get(where.id)!, data); }
    },
    rateLimitEvent: {
      upsert: async ({ create }: Row) => {
        const ev = { id: String(db.events.length + 1), ...create, notifiedAt: null };
        db.events.push(ev);
        return ev;
      },
      update: async ({ where, data }: Row) => Object.assign(db.events.find((e) => e.id === where.id)!, data)
    }
  }
}));

vi.mock("../src/config/redis", async () => {
  const { default: Mock } = await import("ioredis-mock");
  return { redis: new Mock() };
});
vi.mock("../src/queues/email.queue", () => ({ EMAIL_QUEUE_NAME: "email-delivery", MAX_ATTEMPTS: 5 }));
vi.mock("../src/services/search.service", () => ({ indexEmailsSoon: vi.fn() }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("../src/services/smtp.service", async () => {
  const actual = await vi.importActual<typeof import("../src/services/smtp.service")>("../src/services/smtp.service");
  return { ...actual, sendEmail };
});

const slack = vi.hoisted(() => ({ getStatus: vi.fn(), notifyRateLimit: vi.fn() }));
vi.mock("../src/services/slack.service", () => slack);

import { DelayedError, UnrecoverableError } from "bullmq";
import { redis as redisMock } from "../src/config/redis";
import { processEmail, STALE_LEASE_MS } from "../src/workers/email.worker";

// ---- helpers ---------------------------------------------------------------------------------
const job = (emailId: string, attemptsMade = 0) => ({
  data: { emailId }, opts: { attempts: 5 }, attemptsMade, moveToDelayed: vi.fn().mockResolvedValue(undefined)
}) as any;

function seed(count: number, campaign: Row = {}) {
  db.campaigns.set("c1", { id: "c1", userId: "u1", name: "Launch", delayMs: 0, hourlyLimit: 200, status: "SCHEDULED", sentCount: 0, failedCount: 0, ...campaign });
  db.senders.set("s1", { id: "s1", email: "sender@ethereal.email", isActive: true });
  for (let i = 0; i < count; i++) {
    db.emails.set(`e${i}`, {
      id: `e${i}`, campaignId: "c1", senderId: "s1", recipient: `r${i}@x.com`, subject: "Hi", body: "Body", status: "QUEUED",
      scheduledAt: new Date(), attemptCount: 0, deferredCount: 0, idempotencyKey: `k${i}`, processingAt: null
    });
  }
}

beforeEach(async () => {
  db.emails.clear(); db.campaigns.clear(); db.senders.clear(); db.events.length = 0;
  await redisMock.flushall();
  sendEmail.mockReset().mockResolvedValue({ messageId: "<m@x>", previewUrl: "https://ethereal.email/message/abc" });
  slack.getStatus.mockReset().mockResolvedValue({ connected: true });
  slack.notifyRateLimit.mockReset().mockResolvedValue({ sent: true });
});

describe("email worker", () => {
  it("sends, records the Ethereal preview URL and completes the campaign", async () => {
    seed(1);
    await processEmail(job("e0"));
    expect(db.emails.get("e0")).toMatchObject({ status: "SENT", previewUrl: "https://ethereal.email/message/abc", attemptCount: 1 });
    expect(db.campaigns.get("c1")).toMatchObject({ status: "COMPLETED", sentCount: 1 });
  });

  it("is idempotent: a redelivered job for an already-sent email does not send again", async () => {
    seed(1);
    await processEmail(job("e0"));
    const second = await processEmail(job("e0"));
    expect(second).toMatchObject({ skipped: "SENT" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("is idempotent under concurrency: two workers racing on one email send exactly once", async () => {
    seed(1);
    await Promise.all([processEmail(job("e0")), processEmail(job("e0"))]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("passes the deterministic idempotency key to SMTP", async () => {
    seed(1);
    await processEmail(job("e0"));
    expect(sendEmail.mock.calls[0][1]).toMatchObject({ idempotencyKey: "k0", to: "r0@x.com" });
  });

  it("does not send cancelled emails", async () => {
    seed(1);
    db.emails.get("e0")!.status = "CANCELLED";
    await processEmail(job("e0"));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.emails.get("e0")!.status).toBe("CANCELLED");
  });

  it("takes over a stale PROCESSING lease (crashed worker) but not a fresh one", async () => {
    seed(2);
    db.emails.get("e0")!.status = "PROCESSING";
    db.emails.get("e0")!.processingAt = new Date(Date.now() - STALE_LEASE_MS - 1000);
    db.emails.get("e1")!.status = "PROCESSING";
    db.emails.get("e1")!.processingAt = new Date();
    await processEmail(job("e0"));
    await processEmail(job("e1"));
    expect(db.emails.get("e0")!.status).toBe("SENT");
    expect(db.emails.get("e1")!.status).toBe("PROCESSING");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("hands a job back (does not complete it) while another worker holds a fresh lease", async () => {
    seed(1);
    db.emails.get("e0")!.status = "PROCESSING";
    db.emails.get("e0")!.processingAt = new Date();
    const j = job("e0");
    await expect(processEmail(j, "tok")).rejects.toBeInstanceOf(DelayedError);
    expect(j.moveToDelayed.mock.calls[0][0]).toBeGreaterThan(Date.now() + STALE_LEASE_MS - 5000);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("marks transient SMTP errors RETRYING and rethrows so BullMQ backs off", async () => {
    seed(1);
    sendEmail.mockRejectedValue(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
    await expect(processEmail(job("e0"))).rejects.toThrow("ETIMEDOUT");
    expect(db.emails.get("e0")).toMatchObject({ status: "RETRYING", errorMessage: "connect ETIMEDOUT" });
  });

  it("fails permanently on a 5xx SMTP reply without retrying", async () => {
    seed(1);
    sendEmail.mockRejectedValue(Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 }));
    await expect(processEmail(job("e0"))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(db.emails.get("e0")!.status).toBe("FAILED");
    expect(db.campaigns.get("c1")).toMatchObject({ status: "FAILED", failedCount: 1 });
  });

  it("fails after the final attempt of a transient error", async () => {
    seed(1);
    sendEmail.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    await expect(processEmail(job("e0", 4))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(db.emails.get("e0")!.status).toBe("FAILED");
  });

  it("reschedules over-limit emails into a later hour instead of dropping them", async () => {
    seed(3, { hourlyLimit: 1 });
    await processEmail(job("e0"));
    const j1 = job("e1");
    const j2 = job("e2");
    await expect(processEmail(j1)).rejects.toBeInstanceOf(DelayedError);
    await expect(processEmail(j2)).rejects.toBeInstanceOf(DelayedError);

    const e1 = db.emails.get("e1")!;
    const e2 = db.emails.get("e2")!;
    expect(e1).toMatchObject({ status: "RATE_LIMITED", deferredCount: 1 });
    expect(e1.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    expect(e2.scheduledAt.getTime()).toBeGreaterThanOrEqual(e1.scheduledAt.getTime()); // order preserved
    expect(j1.moveToDelayed).toHaveBeenCalledWith(e1.scheduledAt.getTime(), undefined);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("notifies Slack once per window when the limit is hit", async () => {
    seed(4, { hourlyLimit: 1 });
    await processEmail(job("e0"));
    for (const id of ["e1", "e2", "e3"]) await processEmail(job(id)).catch(() => undefined);
    expect(slack.notifyRateLimit).toHaveBeenCalledTimes(1);
    expect(slack.notifyRateLimit.mock.calls[0]).toMatchObject(["u1", { senderEmail: "sender@ethereal.email", scope: "campaign", limit: 1 }]);
    expect(db.events[0].notifiedAt).toBeInstanceOf(Date);
  });

  it("skips notification (no crash, still defers) when Slack is not connected", async () => {
    seed(2, { hourlyLimit: 1 });
    slack.getStatus.mockResolvedValue({ connected: false });
    await processEmail(job("e0"));
    await expect(processEmail(job("e1"))).rejects.toBeInstanceOf(DelayedError);
    expect(slack.notifyRateLimit).not.toHaveBeenCalled();
    expect(db.emails.get("e1")!.status).toBe("RATE_LIMITED");
  });

  it("starts notifying after Slack is connected later, without a restart", async () => {
    seed(3, { hourlyLimit: 1 });
    slack.getStatus.mockResolvedValue({ connected: false });
    await processEmail(job("e0"));
    await processEmail(job("e1")).catch(() => undefined);
    expect(slack.notifyRateLimit).not.toHaveBeenCalled();
    slack.getStatus.mockResolvedValue({ connected: true });
    await processEmail(job("e2")).catch(() => undefined);
    expect(slack.notifyRateLimit).toHaveBeenCalledTimes(1);
  });
});
