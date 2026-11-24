import { prisma } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { logger } from "../lib/logger";
import { reindexDirty } from "./search.service";

const STALE_PROCESSING_MS = 5 * 60_000;
const QUEUED_GRACE_MS = 60_000;

const delayFor = (scheduledAt: Date) => Math.max(0, scheduledAt.getTime() - Date.now());

/**
 * Outbox step 1: Postgres is written first (status SCHEDULED, enqueuedAt NULL). This pushes
 * those rows into BullMQ as delayed jobs. The job id *is* the email id, so adding the same
 * email twice is a no-op in Redis - enqueueing is idempotent.
 */
export async function enqueuePending(where: { campaignId?: string } = {}, batch = 500): Promise<number> {
  const rows = await prisma.email.findMany({
    where: { status: "SCHEDULED", enqueuedAt: null, ...where },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true },
    take: batch
  });
  if (!rows.length) return 0;
  await emailQueue.addBulk(
    rows.map((r) => ({ name: "send", data: { emailId: r.id }, opts: { jobId: r.id, delay: delayFor(r.scheduledAt) } }))
  );
  await prisma.email.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: "SCHEDULED" },
    data: { status: "QUEUED", enqueuedAt: new Date(), searchDirty: true }
  });
  return rows.length;
}

/**
 * Outbox step 2 (self-healing): finds rows whose BullMQ job has vanished - Redis flushed,
 * crash between the DB write and the enqueue, or a worker that died holding a job - and
 * re-adds them. Safe to run any time and from many instances because job ids are deterministic.
 */
export async function repairMissingJobs(batch = 200): Promise<number> {
  const now = Date.now();
  const candidates = await prisma.email.findMany({
    where: {
      OR: [
        { status: { in: ["QUEUED", "RETRYING", "RATE_LIMITED"] }, updatedAt: { lt: new Date(now - QUEUED_GRACE_MS) } },
        { status: "PROCESSING", processingAt: { lt: new Date(now - STALE_PROCESSING_MS) } }
      ]
    },
    select: { id: true, scheduledAt: true },
    take: batch
  });
  let repaired = 0;
  for (const c of candidates) {
    const job = await emailQueue.getJob(c.id);
    const state = job ? await job.getState() : "missing";
    if (state === "missing" || state === "failed" || state === "completed") {
      if (job) await job.remove().catch(() => undefined);
      await emailQueue.add("send", { emailId: c.id }, { jobId: c.id, delay: delayFor(c.scheduledAt) });
      repaired++;
    }
  }
  if (repaired) logger.warn({ repaired }, "Re-enqueued emails whose queue job was missing");
  return repaired;
}

/**
 * Not a scheduler: delivery times live in BullMQ delayed jobs. This loop only repairs drift
 * between Postgres and Redis/Elasticsearch, and runs once immediately on boot (restart recovery).
 */
export function startReconciler(intervalMs: number) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await enqueuePending();
      await repairMissingJobs();
      await reindexDirty();
    } catch (error) {
      logger.error({ err: (error as Error).message }, "Reconciler tick failed");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
