import type { Worker } from "bullmq";
import { app } from "./app";
import { env } from "./config/env";
import { connectDatabase, prisma } from "./config/database";
import { redis } from "./config/redis";
import { emailQueue } from "./queues/email.queue";
import { logger } from "./lib/logger";
import { startReconciler } from "./services/outbox.service";
import { ensureIndex } from "./services/search.service";
import { createEmailWorker } from "./workers/email.worker";

async function bootstrap() {
  await connectDatabase();
  await redis.ping();
  await ensureIndex().catch((e) => logger.warn({ err: (e as Error).message }, "Elasticsearch unavailable at boot; search will retry"));

  // Restart recovery: the first reconciler tick re-attaches any row whose job is missing.
  const stopReconciler = startReconciler(env.RECONCILE_INTERVAL_MS);
  const worker: Worker | null = env.RUN_WORKER_IN_API ? createEmailWorker() : null;

  const server = app.listen(env.PORT, () => {
    logger.info(`ReachFlow API on http://localhost:${env.PORT} (worker ${worker ? "embedded" : "external"}, concurrency ${env.WORKER_CONCURRENCY})`);
    logger.info(`Bull Board: http://localhost:${env.PORT}/admin/queues`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received; shutting down`);
    stopReconciler();
    server.close();
    // Lets in-flight jobs finish; unfinished delayed jobs stay safely in Redis.
    await worker?.close();
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "API startup failed");
  process.exit(1);
});
