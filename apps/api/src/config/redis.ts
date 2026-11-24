import IORedis from "ioredis";
import { env } from "./env";

export const redis = new IORedis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});
