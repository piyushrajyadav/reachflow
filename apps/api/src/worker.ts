// Standalone worker process: `npm run worker --workspace=@reachflow/api` (set RUN_WORKER_IN_API=false for the API).
import { connectDatabase, prisma } from "./config/database";
import { redis } from "./config/redis";
import { logger } from "./lib/logger";
import { createEmailWorker } from "./workers/email.worker";

async function main() {
  await connectDatabase();
  const worker = createEmailWorker();
  logger.info("Email worker started");
  const stop = async () => {
    await worker.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((e) => {
  logger.error({ err: e }, "Worker failed to start");
  process.exit(1);
});
