import { redis } from "./redis";
import { RateLimiter } from "../services/rateLimiter.service";

export const rateLimiter = new RateLimiter(redis);
