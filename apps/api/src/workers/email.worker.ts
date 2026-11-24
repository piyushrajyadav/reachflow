import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import type { EmailStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { rateLimiter } from "../config/limiter";
import { EMAIL_QUEUE_NAME, MAX_ATTEMPTS, type EmailJobData } from "../queues/email.queue";
import { isPermanentSmtpError, sendEmail } from "../services/smtp.service";
import { indexEmailsSoon } from "../services/search.service";
import * as slack from "../services/slack.service";
import { CLAIMABLE } from "../utils/emailState";
import { logger } from "../lib/logger";

/** A PROCESSING row older than this is assumed to belong to a crashed worker and may be taken over. */
export const STALE_LEASE_MS = 2 * 60_000;
const MAX_INLINE_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function refreshCampaignStatus(campaignId: string) {
  const groups = await prisma.email.groupBy({ by: ["status"], where: { campaignId }, _count: true });
  const n = (s: EmailStatus) => groups.find((g) => g.status === s)?._count ?? 0;
  const total = groups.reduce((a, g) => a + g._count, 0);
  const sent = n("SENT");
  const failed = n("FAILED");
  const open = total - sent - failed - n("CANCELLED");
  const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (!current || current.status === "CANCELLED") {
    await prisma.campaign.updateMany({ where: { id: campaignId }, data: { sentCount: sent, failedCount: failed } });
    return;
  }
  const status = open > 0 ? "PROCESSING" : failed === 0 ? "COMPLETED" : sent === 0 ? "FAILED" : "PARTIALLY_FAILED";
  await prisma.campaign.update({ where: { id: campaignId }, data: { sentCount: sent, failedCount: failed, status } });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(200 * i);
    }
  }
}

async function recordRateLimitHit(args: {
  userId: string; senderId: string; senderEmail: string; campaignId: string; campaignName: string;
  scope: "global" | "sender" | "campaign"; limit: number; windowStart: number; resumeAt: number;
}) {
  // Only claim the once-per-window notification if Slack can actually receive it, so connecting
  // Slack mid-window starts working on the very next hit without a redeploy.
  const status = await slack.getStatus(args.userId);
  if (!status.connected) return;
  const scopeKey = args.scope === "campaign" ? `campaign:${args.campaignId}` : args.scope;
  if (!(await rateLimiter.claimNotification(args.senderId, scopeKey, args.windowStart))) return;
  const windowStart = new Date(args.windowStart);
  const event = await prisma.rateLimitEvent.upsert({
    where: { senderId_scope_windowStart: { senderId: args.senderId, scope: scopeKey, windowStart } },
    create: { userId: args.userId, senderId: args.senderId, scope: scopeKey, windowStart, limit: args.limit },
    update: {}
  });
  const outcome = await slack.notifyRateLimit(args.userId, {
    senderEmail: args.senderEmail, scope: args.scope, limit: args.limit,
    resumeAt: new Date(args.resumeAt), campaignName: args.campaignName
  });
  if (outcome.sent) await prisma.rateLimitEvent.update({ where: { id: event.id }, data: { notifiedAt: new Date() } });
  logger.info({ senderId: args.senderId, scope: scopeKey, slack: outcome }, "Rate limit reached");
}

export async function processEmail(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;
  const email = await prisma.email.findUnique({ where: { id: emailId }, include: { campaign: true, sender: true } });
  if (!email) return { skipped: "missing" };

  // 1. Claim. One conditional UPDATE decides the winner, so duplicate/concurrent deliveries of the
  //    same job can never both proceed. Terminal and CANCELLED rows are not claimable.
  const claim = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: { in: CLAIMABLE } },
        { status: "PROCESSING", processingAt: { lt: new Date(Date.now() - STALE_LEASE_MS) } }
      ]
    },
    data: { status: "PROCESSING", processingAt: new Date(), searchDirty: true }
  });
  if (!claim.count) {
    // Another worker holds a fresh lease (or crashed mid-send): do NOT complete the job, or the email
    // would be stranded. Hand it back until the lease can be taken over; if it finished meanwhile the
    // next run sees a terminal status and skips.
    if (email.status === "PROCESSING" && token) {
      const retryAt = (email.processingAt?.getTime() ?? Date.now()) + STALE_LEASE_MS + 1_000;
      logger.info({ emailId, retryAt }, "Email is leased by another worker; re-checking after lease expiry");
      await job.moveToDelayed(Math.max(retryAt, Date.now() + 1_000), token);
      throw new DelayedError();
    }
    logger.info({ emailId, status: email.status }, "Skipping job: email already handled");
    return { skipped: email.status };
  }

  const fail = async (message: string) => {
    await withRetry(() =>
      prisma.email.update({
        where: { id: emailId },
        data: { status: "FAILED", failedAt: new Date(), errorMessage: message.slice(0, 1000), processingAt: null, searchDirty: true }
      })
    );
    await refreshCampaignStatus(email.campaignId);
    indexEmailsSoon([emailId]);
  };

  if (!email.sender.isActive) {
    await fail("Sender was disabled before this email could be sent.");
    throw new UnrecoverableError("sender disabled");
  }

  // 2. Reserve quota + a send slot atomically in Redis.
  const gapMs = Math.max(email.campaign.delayMs, env.MIN_DELAY_BETWEEN_EMAILS_MS);
  const now = Date.now();
  const r = await rateLimiter.reserve({
    senderId: email.senderId, campaignId: email.campaignId, now, gapMs,
    limitGlobal: env.MAX_EMAILS_PER_HOUR_GLOBAL,
    limitSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    limitCampaign: email.campaign.hourlyLimit,
    maxInlineWaitMs: MAX_INLINE_WAIT_MS
  });

  if (r.status !== "granted") {
    const limited = r.status === "rate_limited";
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: limited ? "RATE_LIMITED" : "QUEUED", scheduledAt: new Date(r.retryAt),
        processingAt: null, deferredCount: { increment: 1 }, searchDirty: true
      }
    });
    if (limited) {
      await recordRateLimitHit({
        userId: email.campaign.userId, senderId: email.senderId, senderEmail: email.sender.email,
        campaignId: email.campaignId, campaignName: email.campaign.name,
        scope: r.scope, limit: r.limit, windowStart: r.windowStart, resumeAt: r.retryAt
      }).catch((e) => logger.warn({ err: (e as Error).message }, "Rate-limit notification failed"));
    }
    indexEmailsSoon([emailId]);
    // Same job, new delay: no duplicate job is created and the job id stays stable.
    await job.moveToDelayed(r.retryAt, token);
    throw new DelayedError();
  }

  // 3. Honour the reserved slot (minimum delay between sends).
  const wait = r.slotAt - Date.now();
  if (wait > 0) {
    await sleep(wait);
    const fresh = await prisma.email.findUnique({ where: { id: emailId }, select: { status: true } });
    if (fresh?.status === "CANCELLED") return { skipped: "CANCELLED" };
  }

  // 4. Send.
  await prisma.email.update({ where: { id: emailId }, data: { attemptCount: { increment: 1 } } });
  try {
    const result = await sendEmail(email.sender, {
      to: email.recipient, subject: email.subject, body: email.body, idempotencyKey: email.idempotencyKey
    });
    await withRetry(() =>
      prisma.email.update({
        where: { id: emailId },
        data: {
          status: "SENT", sentAt: new Date(), providerId: result.messageId, previewUrl: result.previewUrl,
          errorMessage: null, processingAt: null, searchDirty: true
        }
      })
    );
    await refreshCampaignStatus(email.campaignId);
    indexEmailsSoon([emailId]);
    return { sent: true, messageId: result.messageId };
  } catch (error) {
    const message = (error as Error).message ?? "Unknown SMTP error";
    const attempts = job.opts.attempts ?? MAX_ATTEMPTS;
    if (isPermanentSmtpError(error) || job.attemptsMade + 1 >= attempts) {
      await fail(message);
      throw new UnrecoverableError(message);
    }
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "RETRYING", errorMessage: message.slice(0, 1000), processingAt: null, searchDirty: true }
    });
    indexEmailsSoon([emailId]);
    throw error; // BullMQ re-runs it after the exponential backoff
  }
}

export function createEmailWorker() {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, (job, token) => processEmail(job, token), {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000
  });
  worker.on("completed", (job) => logger.info({ jobId: job.id }, "Email job completed"));
  worker.on("failed", (job, error) => logger.warn({ jobId: job?.id, err: error.message }, "Email job failed"));
  worker.on("error", (error) => logger.error({ err: error.message }, "Worker error"));
  return worker;
}
