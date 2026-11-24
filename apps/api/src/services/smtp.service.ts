import nodemailer, { type Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";
import { decrypt } from "../utils/crypto";

const transports = new Map<string, Transporter>();

function transportFor(sender: Sender): Transporter {
  let t = transports.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: decrypt(sender.smtpPassword) },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 15_000,
      socketTimeout: 30_000
    });
    transports.set(sender.id, t);
  }
  return t;
}

export function forgetTransport(senderId: string) {
  transports.get(senderId)?.close();
  transports.delete(senderId);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  /** Deterministic: the same logical email always carries the same Message-ID, so receivers can de-dupe. */
  idempotencyKey: string;
}

export interface DeliveryResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(sender: Sender, mail: OutgoingEmail): Promise<DeliveryResult> {
  const info = await transportFor(sender).sendMail({
    from: sender.displayName ? { name: sender.displayName, address: sender.email } : sender.email,
    to: mail.to,
    subject: mail.subject,
    text: mail.body,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.55;white-space:pre-wrap">${escapeHtml(mail.body)}</div>`,
    messageId: `<${mail.idempotencyKey}@reachflow.local>`
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: preview || null };
}

export async function verifySmtp(host: string, port: number, user: string, pass: string) {
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10_000 });
  try {
    await t.verify();
  } finally {
    t.close();
  }
}

export async function createEtherealAccount() {
  const acc = await nodemailer.createTestAccount();
  return { host: acc.smtp.host, port: acc.smtp.port, user: acc.user, pass: acc.pass };
}

/**
 * SMTP 5xx replies and bad-address errors will never succeed on retry. Everything else
 * (4xx, timeouts, resets, DNS) is treated as transient.
 */
export function isPermanentSmtpError(error: unknown): boolean {
  const e = error as { responseCode?: number; code?: string };
  if (typeof e.responseCode === "number") return e.responseCode >= 500 && e.responseCode < 600;
  return e.code === "EENVELOPE" || e.code === "EAUTH";
}
