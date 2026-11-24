import { Router, type Response } from "express";
import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/database";
import { env, isProd } from "../config/env";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { requireAuth, signSession } from "../middleware/auth.middleware";
import { ensureDefaultSender } from "../services/sender.service";

export const authRouter = Router();

const google = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
const STATE_COOKIE = "rf_oauth_state";

const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: env.COOKIE_SECURE || isProd, path: "/" };

function loginRedirect(res: Response, reason: string) {
  res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
}

authRouter.get("/google", (_req, res) => {
  const state = randomBytes(24).toString("hex");
  res.cookie(STATE_COOKIE, state, { ...cookieBase, maxAge: 10 * 60_000 });
  res.redirect(
    google.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state
    })
  );
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const expected = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieBase);
    if (error) return loginRedirect(res, "Google sign-in was cancelled.");
    if (!code || !state || !expected || state !== expected) return loginRedirect(res, "Sign-in session expired. Please try again.");

    try {
      const { tokens } = await google.getToken(code);
      if (!tokens.id_token) throw new Error("Google did not return an ID token");
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified) throw new Error("Google account has no verified email");

      const user = await prisma.user.upsert({
        where: { googleId: p.sub },
        create: { googleId: p.sub, email: p.email, name: p.name ?? p.email, avatar: p.picture ?? null },
        update: { email: p.email, name: p.name ?? p.email, avatar: p.picture ?? null }
      });
      await ensureDefaultSender(user.id, user.name);

      res.cookie(env.COOKIE_NAME, signSession(user), { ...cookieBase, maxAge: 7 * 24 * 60 * 60_000 });
      res.redirect(`${env.FRONTEND_URL}/`);
    } catch (e) {
      logger.error({ err: (e as Error).message }, "Google sign-in failed");
      loginRedirect(res, "Google sign-in failed. Please try again.");
    }
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, avatar: true }
    });
    if (!user) {
      res.clearCookie(env.COOKIE_NAME, cookieBase);
      res.status(401).json({ success: false, message: "Session is no longer valid." });
      return;
    }
    res.json({ success: true, data: user });
  })
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, cookieBase);
  res.json({ success: true });
});
