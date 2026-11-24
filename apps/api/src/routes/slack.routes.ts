import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { asyncHandler, badRequest } from "../lib/http";
import { logger } from "../lib/logger";
import { readSession, requireAuth } from "../middleware/auth.middleware";
import * as slack from "../services/slack.service";

export const slackRouter = Router();

const back = (query: string) => `${env.FRONTEND_URL}/settings?${query}`;

// Browser navigation (not XHR): the session cookie rides along, we redirect to Slack's consent screen.
slackRouter.get("/connect", requireAuth, (req, res) => {
  res.redirect(slack.buildAuthorizeUrl(req.user!.id));
});

slackRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const user = readSession(req);
    if (!user) return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent("Sign in to connect Slack.")}`);
    if (error || !code || !state) return res.redirect(back("slack=cancelled"));
    try {
      await slack.completeOAuth(code, state, user.id);
      res.redirect(back("slack=connected"));
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "Slack OAuth failed");
      res.redirect(back(`slack=error&reason=${encodeURIComponent((e as Error).message)}`));
    }
  })
);

slackRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await slack.getStatus(req.user!.id) });
  })
);

slackRouter.post(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    await slack.disconnect(req.user!.id);
    res.json({ success: true });
  })
);

slackRouter.put(
  "/channel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { channelId } = z.object({ channelId: z.string().trim().nullable() }).parse(req.body);
    await slack.setChannel(req.user!.id, channelId || null);
    res.json({ success: true });
  })
);

slackRouter.post(
  "/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const outcome = await slack.sendTest(req.user!.id);
    if (!outcome.sent) {
      const hint: Record<string, string> = {
        not_connected: "Connect Slack first.",
        needs_reconnect: "Slack access was revoked. Reconnect Slack.",
        not_in_channel: "Invite the ReachFlow bot to that channel (/invite @ReachFlow).",
        channel_not_found: "Slack could not find that channel. Check the channel ID."
      };
      throw badRequest(hint[outcome.detail ?? outcome.reason] ?? hint[outcome.reason] ?? `Slack error: ${outcome.detail ?? "unknown"}`);
    }
    res.json({ success: true });
  })
);
