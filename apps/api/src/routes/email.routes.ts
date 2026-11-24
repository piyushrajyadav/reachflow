import { Router } from "express";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth.middleware";
import { listEmails, listQuerySchema } from "../services/email.service";

export const emailRouter = Router();
emailRouter.use(requireAuth);

emailRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const { items, total, source } = await listEmails(req.user!.id, query);
    res.json({
      success: true,
      data: items,
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), source }
    });
  })
);
