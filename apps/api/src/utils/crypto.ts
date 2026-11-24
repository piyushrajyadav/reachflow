import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";

const key = () => Buffer.from(env.ENCRYPTION_KEY, "hex");

/** AES-256-GCM. Output format: iv.tag.ciphertext (all base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
