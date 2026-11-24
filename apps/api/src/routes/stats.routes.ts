import { Router } from "express";
import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth.middleware";
import { emailQueue } from "../queues/email.queue";
import { pingSearch } from "../services/search.service";
import { PENDING_STATUSES } from "../utils/emailState";

export const statsRouter = Router();
statsRouter.use(requireAuth);

statsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const where = { campaign: { userId } };
    const [groups, activeCampaigns, queue] = await Promise.all([
      prisma.email.groupBy({ by: ["status"], where, _count: true }),
      prisma.campaign.count({ where: { userId, status: { in: ["SCHEDULED", "PROCESSING"] } } }),
      emailQueue.getJobCounts("waiting", "delayed", "active", "failed")
    ]);
    const count = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
    res.json({
      success: true,
      data: {
        total: groups.reduce((a, g) => a + g._count, 0),
        scheduled: PENDING_STATUSES.reduce((a, s) => a + count(s), 0),
        rateLimited: count("RATE_LIMITED"),
        sent: count("SENT"),
        failed: count("FAILED"),
        activeCampaigns,
        queue,
        limits: {
          workerConcurrency: env.WORKER_CONCURRENCY,
          minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
          perSenderPerHour: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
          globalPerHour: env.MAX_EMAILS_PER_HOUR_GLOBAL
        }
      }
    });
  })
);

statsRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const [db, cache, search] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
      redis.ping().then(() => true, () => false),
      pingSearch()
    ]);
    const workers = cache ? (await emailQueue.getWorkers().catch(() => [])).length : 0;
    res.json({ success: true, data: { database: db, redis: cache, elasticsearch: search, workers } });
  })
);
