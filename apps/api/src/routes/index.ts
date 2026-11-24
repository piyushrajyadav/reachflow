import { Router } from "express";
import { authRouter } from "./auth.routes";
import { campaignRouter } from "./campaign.routes";
import { emailRouter } from "./email.routes";
import { healthRouter } from "./health.routes";
import { senderRouter } from "./sender.routes";
import { slackRouter } from "./slack.routes";
import { statsRouter } from "./stats.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/senders", senderRouter);
apiRouter.use("/campaigns", campaignRouter);
apiRouter.use("/emails", emailRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/slack", slackRouter);
