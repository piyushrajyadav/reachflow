import { createHash } from "node:crypto";

export function createEmailIdempotencyKey(campaignId: string, recipient: string) {
  return createHash("sha256")
    .update(`${campaignId}:${recipient.trim().toLowerCase()}`)
    .digest("hex");
}
