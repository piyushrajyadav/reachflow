import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface SessionClaims {
  sub: string;
  email: string;
}

export function signSession(user: { id: string; email: string }): string {
  return jwt.sign({ email: user.email }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function readSession(req: Request): { id: string; email: string } | null {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as unknown as SessionClaims;
    return { id: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

/** Verifies the signed HTTP-only cookie. The user id always comes from the token, never from the body. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Please sign in to continue." });
    return;
  }
  req.user = user;
  next();
}

/**
 * CSRF defence for cookie auth: SameSite=Lax cookies plus a strict Origin check on mutating requests.
 * Browsers always send Origin on cross-site POST/PUT/DELETE, so a forged form post is rejected.
 */
export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && origin !== env.FRONTEND_URL) {
    res.status(403).json({ success: false, message: "Cross-origin request blocked." });
    return;
  }
  next();
}
