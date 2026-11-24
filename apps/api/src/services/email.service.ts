import { Prisma, type EmailStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { badRequest, notFound } from "../lib/http";
import { createEmailIdempotencyKey } from "../utils/idempotency";
import { normalizeRecipients } from "../utils/recipients";
import { planSchedule } from "../utils/schedule";
import { PENDING_STATUSES } from "../utils/emailState";
import { emailQueue } from "../queues/email.queue";
import { enqueuePending } from "./outbox.service";
import { indexEmailsSoon, searchEmailIds } from "./search.service";

export const MAX_RECIPIENTS = 10_000;

export const createCampaignSchema = z.object({
  name: z.string().trim().max(120).optional(),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Email body is required").max(20_000),
  recipients: z.array(z.string()).min(1, "Add at least one recipient").max(MAX_RECIPIENTS, `Maximum ${MAX_RECIPIENTS} recipients per campaign`),
  startAt: z.coerce.date(),
  delayMs: z.coerce.number().int().min(0).max(3_600_000),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
  senderIds: z.array(z.string().uuid()).optional()
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/**
 * Persists a campaign and one Email row per recipient in a single transaction, then hands the
 * rows to BullMQ. `requestKey` (the Idempotency-Key header) makes double-clicks and client
 * retries return the original campaign instead of creating a second one.
 */
export async function createCampaign(userId: string, input: CreateCampaignInput, requestKey?: string) {
  if (requestKey) {
    const existing = await prisma.campaign.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    if (existing) return { campaign: existing, created: false, skipped: { invalid: 0, duplicates: 0 } };
  }

  const report = normalizeRecipients(input.recipients);
  if (!report.valid.length) throw badRequest("None of the recipients are valid email addresses.");

  const senders = await prisma.sender.findMany({
    where: { userId, isActive: true, ...(input.senderIds?.length ? { id: { in: input.senderIds } } : {}) },
    orderBy: { createdAt: "asc" }
  });
  if (!senders.length) throw badRequest("Add at least one active sender before scheduling.");

  // Past start times are allowed (send as soon as possible) but clamp to now so ETAs stay honest.
  const startAt = new Date(Math.max(input.startAt.getTime(), Date.now()));
  const delayMs = Math.max(input.delayMs, env.MIN_DELAY_BETWEEN_EMAILS_MS);
  const plan = planSchedule({
    count: report.valid.length, senderCount: senders.length, startAt, delayMs, hourlyLimit: input.hourlyLimit
  });

  const campaign = await prisma.$transaction(
    async (tx) => {
      const c = await tx.campaign.create({
        data: {
          userId, requestKey: requestKey ?? null,
          name: input.name || input.subject.slice(0, 60),
          subject: input.subject, body: input.body, status: "SCHEDULED",
          startAt, delayMs, hourlyLimit: input.hourlyLimit, totalEmails: report.valid.length
        }
      });
      await tx.email.createMany({
        data: report.valid.map((recipient, i) => ({
          campaignId: c.id, senderId: senders[plan[i].senderIndex].id, recipient,
          subject: input.subject, body: input.body, scheduledAt: plan[i].scheduledAt,
          idempotencyKey: createEmailIdempotencyKey(c.id, recipient)
        }))
      });
      return c;
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  // Best effort: if this fails the reconciler enqueues the rows within seconds.
  try {
    let n = 0;
    do n = await enqueuePending({ campaignId: campaign.id }); while (n === 500);
  } catch {
    /* recovered by reconciler */
  }
  const ids = await prisma.email.findMany({ where: { campaignId: campaign.id }, select: { id: true }, take: 2000 });
  indexEmailsSoon(ids.map((i) => i.id));

  return { campaign, created: true, skipped: { invalid: report.invalid.length, duplicates: report.duplicates } };
}

export async function cancelCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) throw notFound("Campaign not found");
  const pending = await prisma.email.findMany({
    where: { campaignId, status: { in: ["SCHEDULED", "QUEUED", "RETRYING", "RATE_LIMITED"] } },
    select: { id: true }
  });
  // Status flips first: a worker that already picked a job up refuses to claim a CANCELLED row.
  await prisma.email.updateMany({
    where: { id: { in: pending.map((p) => p.id) }, status: { in: ["SCHEDULED", "QUEUED", "RETRYING", "RATE_LIMITED"] } },
    data: { status: "CANCELLED", searchDirty: true }
  });
  await Promise.all(pending.map((p) => emailQueue.remove(p.id).catch(() => undefined)));
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } });
  return { cancelled: pending.length };
}

export const listQuerySchema = z.object({
  view: z.enum(["scheduled", "sent", "all"]).default("all"),
  status: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  campaignId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const VIEW_STATUSES: Record<string, EmailStatus[] | undefined> = {
  scheduled: PENDING_STATUSES,
  sent: ["SENT", "FAILED"],
  all: undefined
};

const emailSelect = {
  id: true, recipient: true, subject: true, status: true, scheduledAt: true, sentAt: true,
  failedAt: true, errorMessage: true, attemptCount: true, previewUrl: true, campaignId: true,
  campaign: { select: { name: true } }, sender: { select: { email: true } }
} satisfies Prisma.EmailSelect;

export async function listEmails(userId: string, query: z.infer<typeof listQuerySchema>) {
  let statuses = VIEW_STATUSES[query.view];
  if (query.status) {
    const wanted = query.status.split(",").map((s) => s.trim().toUpperCase()) as EmailStatus[];
    statuses = statuses ? wanted.filter((s) => statuses!.includes(s)) : wanted;
  }

  const orderBy: Prisma.EmailOrderByWithRelationInput =
    query.view === "sent" ? { sentAt: { sort: "desc", nulls: "last" } } : { scheduledAt: "asc" };

  if (query.q) {
    const hits = await searchEmailIds({
      userId, q: query.q, statuses, campaignId: query.campaignId, page: query.page, pageSize: query.pageSize
    });
    if (hits) {
      const rows = await prisma.email.findMany({ where: { id: { in: hits.ids }, campaign: { userId } }, select: emailSelect });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return { items: hits.ids.map((id) => byId.get(id)).filter(Boolean), total: hits.total, source: "elasticsearch" as const };
    }
  }

  const where: Prisma.EmailWhereInput = {
    campaign: { userId },
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    ...(query.q
      ? { OR: [
          { recipient: { contains: query.q, mode: "insensitive" } },
          { subject: { contains: query.q, mode: "insensitive" } }
        ] }
      : {})
  };
  const [items, total] = await Promise.all([
    prisma.email.findMany({ where, orderBy, select: emailSelect, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.email.count({ where })
  ]);
  return { items, total, source: "postgres" as const };
}

export async function listCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 100,
    select: {
      id: true, name: true, subject: true, status: true, startAt: true, delayMs: true, hourlyLimit: true,
      totalEmails: true, sentCount: true, failedCount: true, createdAt: true
    }
  });
}
