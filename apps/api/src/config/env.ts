import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";

// npm workspaces run scripts with cwd = apps/api, so look for the monorepo root .env too.
for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  ELASTICSEARCH_URL: z.string().url().default("http://localhost:9200"),

  // Throughput controls
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  MAX_EMAILS_PER_HOUR_GLOBAL: z.coerce.number().int().positive().default(1000),
  RUN_WORKER_IN_API: bool(true),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("reachflow_token"),
  COOKIE_SECURE: bool(false),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  SLACK_BOT_SCOPES: z.string().default("chat:write"),

  SMTP_HOST: z.string().default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Comma separated list of emails allowed to open Bull Board. Empty = any signed-in user.
  BULL_BOARD_ADMINS: z.string().default(""),

  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
