import { prisma } from "../config/database";
import { env } from "../config/env";
import { encrypt } from "../utils/crypto";
import { badRequest, notFound } from "../lib/http";
import { createEtherealAccount, forgetTransport, verifySmtp } from "./smtp.service";

export const publicSender = (s: {
  id: string; email: string; displayName: string | null; smtpHost: string; smtpPort: number; isActive: boolean; createdAt: Date;
}) => ({
  id: s.id, email: s.email, displayName: s.displayName, smtpHost: s.smtpHost,
  smtpPort: s.smtpPort, isActive: s.isActive, createdAt: s.createdAt
});

/** First login: provision the sender configured in .env so the product works out of the box. */
export async function ensureDefaultSender(userId: string, displayName: string) {
  if (!env.SMTP_USER || !env.SMTP_PASS) return;
  const existing = await prisma.sender.count({ where: { userId } });
  if (existing > 0) return;
  await prisma.sender.create({
    data: {
      userId, email: env.SMTP_USER, displayName,
      smtpHost: env.SMTP_HOST, smtpPort: env.SMTP_PORT,
      smtpUser: env.SMTP_USER, smtpPassword: encrypt(env.SMTP_PASS)
    }
  });
}

export async function listSenders(userId: string) {
  const rows = await prisma.sender.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return rows.map(publicSender);
}

export async function addSmtpSender(
  userId: string,
  input: { email: string; displayName?: string; smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string }
) {
  try {
    await verifySmtp(input.smtpHost, input.smtpPort, input.smtpUser, input.smtpPassword);
  } catch (e) {
    throw badRequest(`SMTP login failed: ${(e as Error).message}`);
  }
  const row = await prisma.sender.create({
    data: { userId, ...input, smtpPassword: encrypt(input.smtpPassword) }
  });
  return publicSender(row);
}

/** Creates a brand-new throwaway Ethereal inbox and registers it as a sender. */
export async function addEtherealSender(userId: string, displayName?: string) {
  const acc = await createEtherealAccount();
  const row = await prisma.sender.create({
    data: {
      userId, email: acc.user, displayName: displayName ?? null,
      smtpHost: acc.host, smtpPort: acc.port, smtpUser: acc.user, smtpPassword: encrypt(acc.pass)
    }
  });
  return publicSender(row);
}

export async function setSenderActive(userId: string, senderId: string, isActive: boolean) {
  const res = await prisma.sender.updateMany({ where: { id: senderId, userId }, data: { isActive } });
  if (!res.count) throw notFound("Sender not found");
  if (!isActive) forgetTransport(senderId);
}
