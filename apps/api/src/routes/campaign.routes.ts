import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { asyncHandler, notFound } from "../lib/http";
import { requireAuth } from "../middleware/auth.middleware";
import { cancelCampaign, createCampaign, createCampaignSchema, listCampaigns } from "../services/email.service";

export const campaignRouter = Router();
campaignRouter.use(requireAuth);

campaignRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createCampaignSchema.parse(req.body);
    const key = req.get("idempotency-key")?.slice(0, 100);
    const { campaign, created, skipped } = await createCampaign(req.user!.id, input, key);
    res.status(created ? 201 : 200).json({
      success: true,
      data: {
        id: campaign.id, status: campaign.status, totalEmails: campaign.totalEmails,
        startAt: campaign.startAt, duplicateRequest: !created, skipped
      }
    });
  })
);

campaignRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listCampaigns(req.user!.id) });
  })
);

campaignRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const c = await prisma.campaign.findFirst({ where: { id, userId: req.user!.id }, omit: { body: false } });
    if (!c) throw notFound("Campaign not found");
    res.json({ success: true, data: c });
  })
);

campaignRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ success: true, data: await cancelCampaign(req.user!.id, id) });
  })
);
