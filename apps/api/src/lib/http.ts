import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m, "BAD_REQUEST");
export const notFound = (m = "Not found") => new HttpError(404, m, "NOT_FOUND");

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
