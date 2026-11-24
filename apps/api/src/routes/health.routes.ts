import { Router } from "express";
import { prisma } from "../config/database";
import { redis } from "../config/redis";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping()
  ]);

  const database = checks[0].status === "fulfilled";
  const cache = checks[1].status === "fulfilled";

  res.status(database && cache ? 200 : 503).json({
    success: database && cache,
    service: "ReachFlow API",
    timestamp: new Date().toISOString(),
    dependencies: { database: database ? "up" : "down", redis: cache ? "up" : "down" }
  });
});
