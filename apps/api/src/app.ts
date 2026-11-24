import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { apiRouter } from "./routes";
import { mountBullBoard } from "./routes/bullboard";
import { enforceSameOrigin } from "./middleware/auth.middleware";
import { errorHandler } from "./middleware/error.middleware";

export const app = express();

app.set("trust proxy", 1);
// Bull Board ships inline scripts, so the CSP is relaxed for that path only.
app.use((req, res, next) => (req.path.startsWith("/admin/") ? next() : helmet()(req, res, next)));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith("/api/health") ?? false } }));

app.use(
  "/api",
  rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests." } })
);
app.use("/api", enforceSameOrigin, apiRouter);
mountBullBoard(app);

app.get("/", (_req, res) => {
  res.json({ service: "ReachFlow API", status: "running" });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});
app.use(errorHandler);
