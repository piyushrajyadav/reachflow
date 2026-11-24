import type { NextFunction, Request, Response } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "../config/env";
import { emailQueue } from "../queues/email.queue";
import { readSession } from "../middleware/auth.middleware";

export const BULL_BOARD_PATH = "/admin/queues";

const admins = env.BULL_BOARD_ADMINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Queue internals expose every user's job data, so the board needs a valid session (and optionally an allow-list). */
function guard(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) {
    res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent("Sign in to open the queue dashboard.")}`);
    return;
  }
  if (admins.length && !admins.includes(user.email.toLowerCase())) {
    res.status(403).send("Not allowed.");
    return;
  }
  next();
}

export function mountBullBoard(app: import("express").Express) {
  const adapter = new ExpressAdapter();
  adapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: adapter });
  app.use(BULL_BOARD_PATH, guard, adapter.getRouter());
}
