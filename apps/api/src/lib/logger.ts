import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.cookie", "req.headers.authorization", "*.accessToken", "*.smtpPassword"]
});
