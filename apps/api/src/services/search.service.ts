import { Client } from "@elastic/elasticsearch";
import type { Campaign, Email, Sender } from "@prisma/client";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export const EMAILS_INDEX = "reachflow-emails";
const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5_000, maxRetries: 1 });

type IndexableEmail = Email & { campaign: Pick<Campaign, "name" | "userId">; sender: Pick<Sender, "email"> };

const toDocument = (e: IndexableEmail) => ({
  userId: e.campaign.userId,
  campaignId: e.campaignId,
  campaignName: e.campaign.name,
  senderEmail: e.sender.email,
  recipient: e.recipient,
  subject: e.subject,
  body: e.body,
  status: e.status,
  scheduledAt: e.scheduledAt,
  sentAt: e.sentAt,
  createdAt: e.createdAt
});

export async function ensureIndex() {
  const exists = await es.indices.exists({ index: EMAILS_INDEX });
  if (exists) return;
  await es.indices.create({
    index: EMAILS_INDEX,
    mappings: {
      properties: {
        userId: { type: "keyword" },
        campaignId: { type: "keyword" },
        campaignName: { type: "text" },
        senderEmail: { type: "keyword" },
        recipient: { type: "text", fields: { raw: { type: "keyword" } } },
        subject: { type: "text" },
        body: { type: "text" },
        status: { type: "keyword" },
        scheduledAt: { type: "date" },
        sentAt: { type: "date" },
        createdAt: { type: "date" }
      }
    }
  });
  logger.info("Created Elasticsearch index");
}

export async function pingSearch(): Promise<boolean> {
  try {
    return await es.ping();
  } catch {
    return false;
  }
}

/**
 * Index a batch of emails by id. Postgres stays the source of truth: rows are flagged
 * `searchDirty` on every change and only cleared here after Elasticsearch accepted them,
 * so an outage never loses anything - the reconciler retries until the index catches up.
 */
export async function indexEmails(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await prisma.email.findMany({
    where: { id: { in: ids } },
    include: { campaign: { select: { name: true, userId: true } }, sender: { select: { email: true } } }
  });
  if (!rows.length) return 0;
  try {
    const res = await es.bulk({
      refresh: false,
      operations: rows.flatMap((r) => [{ index: { _index: EMAILS_INDEX, _id: r.id } }, toDocument(r)])
    });
    const failed = new Set<string>();
    res.items.forEach((item, i) => {
      if (item.index?.error) failed.add(rows[i].id);
    });
    // Only clear the flag if the row has not changed since we read it.
    await Promise.all(
      rows
        .filter((r) => !failed.has(r.id))
        .map((r) => prisma.email.updateMany({ where: { id: r.id, updatedAt: r.updatedAt }, data: { searchDirty: false } }))
    );
    return rows.length - failed.size;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "Elasticsearch indexing failed; will retry");
    return 0;
  }
}

/** Fire-and-forget helper used on the hot path. Never throws. */
export function indexEmailsSoon(ids: string[]) {
  void indexEmails(ids).catch(() => undefined);
}

export async function reindexDirty(batch = 500): Promise<number> {
  const rows = await prisma.email.findMany({ where: { searchDirty: true }, select: { id: true }, take: batch });
  return indexEmails(rows.map((r) => r.id));
}

export interface SearchParams {
  userId: string;
  q: string;
  statuses?: string[];
  campaignId?: string;
  page: number;
  pageSize: number;
}

/** Returns matching email ids (ordered) + total, or null when Elasticsearch is unavailable. */
export async function searchEmailIds(p: SearchParams): Promise<{ ids: string[]; total: number } | null> {
  try {
    const filter: object[] = [{ term: { userId: p.userId } }];
    if (p.statuses?.length) filter.push({ terms: { status: p.statuses } });
    if (p.campaignId) filter.push({ term: { campaignId: p.campaignId } });
    const res = await es.search({
      index: EMAILS_INDEX,
      from: (p.page - 1) * p.pageSize,
      size: p.pageSize,
      track_total_hits: true,
      query: {
        bool: {
          filter,
          must: [
            {
              multi_match: {
                query: p.q,
                type: "bool_prefix",
                fields: ["recipient^3", "recipient.raw^2", "subject^2", "campaignName", "body"]
              }
            }
          ]
        }
      },
      sort: [{ _score: { order: "desc" as const } }, { scheduledAt: { order: "desc" as const } }]
    });
    const total = typeof res.hits.total === "number" ? res.hits.total : res.hits.total?.value ?? 0;
    return { ids: res.hits.hits.map((h) => String(h._id)), total };
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "Elasticsearch search failed; falling back to Postgres");
    return null;
  }
}
