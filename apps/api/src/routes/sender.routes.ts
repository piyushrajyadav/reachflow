import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth.middleware";
import { addEtherealSender, addSmtpSender, listSenders, setSenderActive } from "../services/sender.service";
import { rateLimiter } from "../config/limiter";
import { env } from "../config/env";

export const senderRouter = Router();
senderRouter.use(requireAuth);

senderRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const senders = await listSenders(req.user!.id);
    const withUsage = await Promise.all(
      senders.map(async (s) => ({ ...s, sentThisHour: await rateLimiter.senderUsage(s.id), hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER }))
    );
    res.json({ success: true, data: withUsage });
  })
);

const smtpSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().max(80).optional(),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().min(1)
});

senderRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const sender = await addSmtpSender(req.user!.id, smtpSchema.parse(req.body));
    res.status(201).json({ success: true, data: sender });
  })
);

senderRouter.post(
  "/ethereal",
  asyncHandler(async (req, res) => {
    const { displayName } = z.object({ displayName: z.string().trim().max(80).optional() }).parse(req.body ?? {});
    const sender = await addEtherealSender(req.user!.id, displayName);
    res.status(201).json({ success: true, data: sender });
  })
);

senderRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await setSenderActive(req.user!.id, String(req.params.id), isActive);
    res.json({ success: true });
  })
);
