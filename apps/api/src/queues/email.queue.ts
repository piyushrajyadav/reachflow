import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-delivery";
export const MAX_ATTEMPTS = 5;

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 }
  }
});
