# Architecture notes

The full write-up lives in the root README. This file records the decisions behind it.

## Request flow

Browser -> Express API -> PostgreSQL transaction (campaign + email rows) -> outbox push -> BullMQ/Redis delayed job -> worker -> Redis rate limiter -> SMTP -> PostgreSQL status update -> Elasticsearch index.

## Decisions

| Decision | Why |
|---|---|
| Postgres is the source of truth; Redis only executes | Redis can be flushed or lost; rows can always be re-enqueued |
| Job id = email id | Re-enqueueing is idempotent; one email, one job |
| Conditional `UPDATE` claim | Database decides the single winner among duplicate or concurrent deliveries |
| One Lua script for all limits | Check-and-increment of three counters plus the spacing cursor must be atomic |
| Defer with `moveToDelayed` + `DelayedError` | Keeps the same job and id; no duplicate jobs, no burned retry attempts |
| Rank-based deferral slots | Deferred jobs spread over future windows in arrival order instead of stampeding at the boundary |
| Quota consumed per attempt | Providers count attempts, retries included |
| Notify Slack once per (sender, scope, window) | `SET NX` dedupes across workers; claimed only when Slack is connected, so connecting later works immediately |
| `searchDirty` flag, cleared after ES accepts | Indexing failures are retried by the reconciler; index is rebuildable |
| Deterministic Message-ID | Lets receivers de-duplicate in the unavoidable ambiguous-SMTP case |

## Known gaps

* Fixed UTC hour windows (burst possible across a boundary).
* Lua verified against `ioredis-mock`; confirm on real Redis via the demo checklist.
* Single queue; a per-sender queue would isolate a slow SMTP account from the others.
