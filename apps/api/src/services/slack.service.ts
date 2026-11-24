import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { decrypt, encrypt } from "../utils/crypto";
import { HttpError, badRequest } from "../lib/http";
import { logger } from "../lib/logger";

const SLACK_API = "https://slack.com/api";
const DEAD_TOKEN_ERRORS = new Set(["token_revoked", "invalid_auth", "account_inactive", "token_expired", "not_authed"]);

export const slackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);

/** Signed, short-lived `state` binds the OAuth round trip to the signed-in user (CSRF protection). */
export function buildAuthorizeUrl(userId: string): string {
  if (!slackConfigured()) throw new HttpError(503, "Slack OAuth is not configured on the server.");
  const state = jwt.sign({ purpose: "slack-oauth" }, env.JWT_SECRET, { subject: userId, expiresIn: "10m" });
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", env.SLACK_CLIENT_ID!);
  url.searchParams.set("scope", env.SLACK_BOT_SCOPES);
  url.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI!);
  url.searchParams.set("state", state);
  return url.toString();
}

interface OAuthAccess {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
  incoming_webhook?: { url: string; channel?: string; channel_id?: string };
}

export async function completeOAuth(code: string, state: string, sessionUserId: string) {
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(state, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw badRequest("Slack authorisation expired. Please try connecting again.");
  }
  if (claims.purpose !== "slack-oauth" || claims.sub !== sessionUserId) throw badRequest("Slack state mismatch.");

  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!, client_secret: env.SLACK_CLIENT_SECRET!,
      code, redirect_uri: env.SLACK_REDIRECT_URI!
    })
  });
  const data = (await res.json()) as OAuthAccess;
  if (!data.ok || !data.access_token) throw badRequest(`Slack rejected the authorisation (${data.error ?? "unknown"}).`);

  const channelId = data.incoming_webhook?.channel_id ?? null;
  const fields = {
    teamId: data.team?.id ?? null,
    teamName: data.team?.name ?? null,
    accessToken: encrypt(data.access_token),
    webhookUrl: data.incoming_webhook?.url ? encrypt(data.incoming_webhook.url) : null,
    slackUserId: data.authed_user?.id ?? null,
    botUserId: data.bot_user_id ?? null,
    isActive: true
  };
  await prisma.slackAccount.upsert({
    where: { userId: sessionUserId },
    create: { userId: sessionUserId, ...fields, channelId, channelName: data.incoming_webhook?.channel ?? null },
    // Reconnecting keeps a channel the user already picked unless Slack handed us a new one.
    update: { ...fields, ...(channelId ? { channelId, channelName: data.incoming_webhook?.channel ?? null } : {}) }
  });
}

export async function getStatus(userId: string) {
  const acc = await prisma.slackAccount.findUnique({ where: { userId } });
  return {
    configured: slackConfigured(),
    connected: Boolean(acc?.isActive),
    needsReconnect: Boolean(acc && !acc.isActive),
    teamName: acc?.teamName ?? null,
    channelId: acc?.channelId ?? null,
    channelName: acc?.channelName ?? null,
    deliversTo: acc ? (acc.channelId ? "channel" : "dm") : null
  };
}

export async function disconnect(userId: string) {
  const acc = await prisma.slackAccount.findUnique({ where: { userId } });
  if (!acc) return;
  try {
    await fetch(`${SLACK_API}/auth.revoke`, { method: "POST", headers: { Authorization: `Bearer ${decrypt(acc.accessToken)}` } });
  } catch {
    // Revoking is best effort; the local record is what stops notifications.
  }
  await prisma.slackAccount.delete({ where: { userId } });
}

export async function setChannel(userId: string, channelId: string | null) {
  if (channelId && !/^[CGD][A-Z0-9]{6,}$/.test(channelId)) throw badRequest("That does not look like a Slack channel ID (e.g. C0123456789).");
  const res = await prisma.slackAccount.updateMany({ where: { userId }, data: { channelId, channelName: null } });
  if (!res.count) throw badRequest("Connect Slack first.");
}

export type SendOutcome =
  | { sent: true }
  | { sent: false; reason: "not_connected" | "needs_reconnect" | "slack_error"; detail?: string };

/**
 * Posts with chat.postMessage as the connected bot. Never throws: Slack being disconnected,
 * revoked or down must not break email delivery.
 */
export async function sendMessage(userId: string, text: string): Promise<SendOutcome> {
  const acc = await prisma.slackAccount.findUnique({ where: { userId } });
  if (!acc) return { sent: false, reason: "not_connected" };
  if (!acc.isActive) return { sent: false, reason: "needs_reconnect" };
  try {
    const channel = acc.channelId ?? acc.slackUserId;
    if (!channel) return { sent: false, reason: "slack_error", detail: "no_target" };
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${decrypt(acc.accessToken)}` },
      body: JSON.stringify({ channel, text, unfurl_links: false })
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) return { sent: true };
    if (data.error && DEAD_TOKEN_ERRORS.has(data.error)) {
      await prisma.slackAccount.update({ where: { userId }, data: { isActive: false } });
      return { sent: false, reason: "needs_reconnect", detail: data.error };
    }
    logger.warn({ error: data.error }, "Slack rejected message");
    return { sent: false, reason: "slack_error", detail: data.error };
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "Slack request failed");
    return { sent: false, reason: "slack_error", detail: (error as Error).message };
  }
}

export function notifyRateLimit(userId: string, d: { senderEmail: string; scope: string; limit: number; resumeAt: Date; campaignName: string }) {
  const scopeLabel = d.scope === "global" ? "global hourly limit" : d.scope === "campaign" ? "campaign hourly limit" : "hourly sending limit";
  return sendMessage(
    userId,
    `:warning: *ReachFlow rate limit reached*\n` +
      `Sender *${d.senderEmail}* hit its ${scopeLabel} (${d.limit}/hour) while sending _${d.campaignName}_.\n` +
      `Nothing was dropped: remaining emails were rescheduled and resume from ${d.resumeAt.toUTCString()}.`
  );
}

export function sendTest(userId: string) {
  return sendMessage(userId, ":white_check_mark: *ReachFlow* is connected. You will be notified here when a sender hits its hourly limit.");
}
