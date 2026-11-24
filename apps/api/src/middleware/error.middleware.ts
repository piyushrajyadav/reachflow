import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "../lib/http";
import { logger } from "../lib/logger";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: error.issues[0]?.message ?? "Invalid request.",
      errors: error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message, code: error.code });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ success: false, message: "That record already exists." });
    return;
  }
  logger.error({ err: error, path: req.path }, "Unhandled request error");
  res.status(500).json({ success: false, message: "An unexpected server error occurred." });
}
