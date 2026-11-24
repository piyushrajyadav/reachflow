# ReachFlow

A production-style email scheduler: accepts campaigns through an API and dashboard, schedules every email as a persistent **BullMQ delayed job**, sends through Ethereal SMTP from multiple senders, enforces **concurrency, minimum delay and hourly limits across workers using atomic Redis logic**, indexes everything in **Elasticsearch**, and pings **Slack** the moment a sender hits its limit.

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, TanStack Query |
| Backend | Node, Express, TypeScript, Zod, pino |
| Queue | BullMQ on Redis (delayed jobs, no cron) |
| Database | PostgreSQL 16 via Prisma |
| Search | Elasticsearch 8 |
| Email | Nodemailer to Ethereal SMTP |
| Auth | Google OAuth 2.0, HTTP-only JWT cookie |
| Alerts | Slack OAuth v2 + `chat.postMessage` |
| Monitoring | Bull Board at `/admin/queues` (auth protected) |

## Run it (Windows PowerShell or any shell)

Requirements: Node 20+, Docker Desktop.

```powershell
npm install
Copy-Item .env.example .env        # then fill it in, see "Environment" below
docker compose up -d               # Postgres, Redis, Elasticsearch
npm run db:generate
npm run db:migrate                 # applies the committed migrations
npm run dev                        # API (+ embedded worker) on :5000, web on :5173
```

Open http://localhost:5173 and sign in with Google.

| URL | What |
|---|---|
| http://localhost:5173 | Dashboard |
| http://localhost:5000/api/health | Health check |
| http://localhost:5000/admin/queues | Bull Board (needs a signed-in session) |
| http://localhost:9200 | Elasticsearch |

Run the worker as its own process instead (shows that jobs survive the API dying):

```powershell
# .env: RUN_WORKER_IN_API=false
npm run dev:api
npm run worker
```

Tests: `npm test` (unit tests plus worker logic against an in-memory Prisma fake and a Lua-capable Redis mock).

### Environment

Copy `.env.example`. The values that need your own accounts:

* **Google OAuth** — Google Cloud Console > Credentials > OAuth client (Web). Authorised redirect URI: `http://localhost:5000/api/auth/google/callback`.
* **Slack** — api.slack.com/apps > your app > OAuth & Permissions. Redirect URL `http://localhost:5000/api/slack/callback`; bot scope `chat:write`.
* **Ethereal** — create a free inbox at https://ethereal.email/create and put its user/pass in `SMTP_USER` / `SMTP_PASS`. That account becomes each new user's first sender. More senders: Settings > *New Ethereal inbox* (calls Ethereal's API and creates a fresh account in one click) or *Custom SMTP*.
* `JWT_SECRET`, `ENCRYPTION_KEY` — random strings, generation commands are in `.env.example`.

Sent emails are not delivered to real inboxes. Open the **Preview** link in the *Sent* tab to see the message in Ethereal.

## How it works

```
Browser ─▶ Express API ──▶ PostgreSQL   (campaign + one row per email, status SCHEDULED)
                │
                └─ outbox ─▶ Redis / BullMQ   (delayed job, jobId = email id)
                                   │
                              Worker(s)  ── claim row ─▶ reserve quota (Lua) ─▶ SMTP ─▶ mark SENT
                                   │                        │
                                   │                        └─ over limit: move job to a later window,
                                   │                           notify Slack once per window
                                   └─▶ Elasticsearch (index every status change)
```

### Scheduling (no cron)

`POST /api/campaigns` validates the payload, de-duplicates and validates addresses, then in **one transaction** writes the campaign and one `Email` row per recipient. Recipients are dealt round-robin to the user's active senders; each email gets a planned `scheduledAt` (`start + n × delay`, pushed into later hours when the sender's hourly limit would be exceeded).

The rows are then added to BullMQ as **delayed jobs** with `delay = scheduledAt − now` and `jobId = email.id`. Nothing polls for "what is due": Redis wakes each job at its time. A `setInterval` reconciler exists only to repair drift (see below), not to schedule.

### Persistence and restarts

* PostgreSQL is the source of truth; Redis (append-only file enabled in `docker-compose.yml`) holds the delayed jobs, so **stopping the API or worker loses nothing**. On start the worker simply resumes processing whatever is due.
* The enqueue is an **outbox**: rows are written first with `enqueuedAt = NULL`, then pushed to Redis. If the process dies in between, or Redis is wiped, the reconciler (runs once at boot, then every `RECONCILE_INTERVAL_MS`) finds rows with no matching job and re-adds them. Because the job id is the email id, re-adding is a no-op when the job already exists.
* A worker that dies mid-send leaves the row `PROCESSING`. After a 2 minute lease it can be claimed again, and BullMQ's stalled-job recovery redelivers the job.

### Idempotency: not sending twice

1. `Email.idempotencyKey = sha256(campaignId:recipient)` is unique in the database.
2. The BullMQ job id is the email id, so one email can never have two jobs.
3. Before sending, the worker **claims** the row with a single conditional `UPDATE ... WHERE status IN (claimable) OR stale lease`. Of any number of concurrent or duplicate deliveries, exactly one gets `count = 1`; the rest skip. Terminal rows (`SENT`, `FAILED`, `CANCELLED`) are never claimable.
4. `POST /campaigns` honours an `Idempotency-Key` header (the UI sends one per compose session), so a double click or client retry returns the original campaign.
5. Every message carries a deterministic `Message-ID` derived from the idempotency key.

Honest limit: no system can promise *exactly-once* over SMTP. If the SMTP server accepts a message and the connection drops before we record `SENT`, a retry could send it again. The design is **effectively-once**: the window is as small as possible (DB write is retried), and the stable `Message-ID` lets receivers de-duplicate.

### Rate limiting and concurrency

| Control | Where | Default |
|---|---|---|
| Worker concurrency | `WORKER_CONCURRENCY` (BullMQ `concurrency`) | 5 |
| Minimum delay between sends | `max(campaign delay, MIN_DELAY_BETWEEN_EMAILS_MS)` per sender | **2 s** |
| Hourly limit per sender | `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 |
| Hourly limit, all senders | `MAX_EMAILS_PER_HOUR_GLOBAL` | 1000 |
| Hourly limit per campaign and sender | set in the compose form | 200 |

All limits are enforced in **one Lua script** executed atomically in Redis (`apps/api/src/services/rateLimiter.service.ts`), so any number of workers or API instances share the same counters:

* **Hourly quota.** Counters are keyed by `scope + sender + UTC hour window` (`rf:rl:q:sender:<id>:<hour>`) and expire after two windows. The script checks all three scopes and only increments when all have room, so one job never half-consumes quota.
* **Minimum delay.** A per-sender "next allowed time" cursor. Each reservation takes the next slot and moves the cursor forward by the gap, so concurrent jobs get distinct, evenly spaced slots. The worker sleeps until its slot (never more than 30 s; beyond that the job is re-delayed instead of hogging a worker slot).
* **When the limit is hit nothing is dropped or failed.** The script returns the time the job should run again. Each deferred job gets a rank (`INCR`) and is placed at `next window start + rank-within-window × gap`, spilling into the following window once that window's quota would be full. Ranks are handed out in arrival order, so original order is preserved as far as concurrent execution allows. The worker then calls `job.moveToDelayed(...)`: the **same job** goes back to the delayed set (no duplicate job), and the row becomes `RATE_LIMITED` with its new `scheduledAt`, which the dashboard shows.
* **Under load (1000+ emails at the same moment):** at most `WORKER_CONCURRENCY` jobs run; each makes one atomic Redis call; up to the limit they are spaced `gap` apart, the rest get future slots across the next hours. Redis does O(1) work per job and the database sees only status updates.

Quota semantics: a reservation counts as an attempt, so a retry after an SMTP failure consumes quota again (providers count attempts). Windows are fixed UTC clock hours, which allows a burst across an hour boundary; a sliding window would be stricter but costs a sorted set per sender.

### Slack notifications

*Settings > Connect Slack* runs the real OAuth v2 flow (`state` is a signed, 10-minute JWT bound to your user id). The bot token is stored **AES-256-GCM encrypted**. When a sender's limit is hit, the first deferral in each (sender, scope, hour window) posts a `chat.postMessage` (de-duplicated across workers with `SET NX`, and recorded in `RateLimitEvent`). By default it DMs you; optionally set a channel ID after inviting the bot.

* Not connected: the hit is handled normally and no message is attempted. No crash.
* Connect later: the next hit notifies, no redeploy, because the connection is looked up in the database on each hit.
* Token revoked: the account is marked inactive and the UI shows *Reconnect*.

Demo tip: set the compose form's **hourly limit to 2** with 5+ recipients to trigger it in seconds. Use *Send test message* in Settings to verify delivery first.

### Elasticsearch

Every status change sets `Email.searchDirty = true` and indexes the row (`reachflow-emails`). The flag is cleared only after Elasticsearch accepts the document, and the reconciler re-indexes anything still dirty, so an Elasticsearch outage never loses data and the index can always be rebuilt from Postgres. The dashboard search box queries Elasticsearch (prefix matching on recipient, subject, campaign, body, scoped to the signed-in user) and falls back to a Postgres `ILIKE` if Elasticsearch is down.

### Email lifecycle

```
SCHEDULED ─▶ QUEUED ─▶ PROCESSING ─▶ SENT
                ▲          ├─▶ RETRYING ──▶ (back to PROCESSING after backoff)
                │          ├─▶ RATE_LIMITED ─▶ (back to PROCESSING in its new window)
                └──────────┤        (crowded spacing queue returns to QUEUED)
                           └─▶ FAILED          any non-terminal ─▶ CANCELLED
```

Transient errors (timeouts, 4xx) retry up to 5 times with exponential backoff; permanent ones (5xx replies, bad addresses) fail immediately. The table is encoded in `utils/emailState.ts` and tested.

### Security

Google ID tokens are verified server-side; the session is an HTTP-only, SameSite=Lax JWT cookie; mutating requests are Origin-checked (CSRF); every query is scoped by the user id from the token; SMTP passwords and Slack tokens are encrypted at rest; Bull Board requires a session (and optionally `BULL_BOARD_ADMINS`); `helmet`, request rate limiting, and Zod validation on every input.

## Features by requirement

**Backend** — scheduler (BullMQ delayed jobs), persistence (Postgres + Redis AOF + outbox reconciler), idempotency (unique keys, deterministic job ids, atomic claim, request idempotency key), worker concurrency, minimum delay, hourly limits (per sender, per campaign, global; Redis-atomic; deferral not failure), multiple Ethereal senders, Elasticsearch search, Bull Board, Slack OAuth and alerts.

**Frontend** — Google login and logout, header with name/email/avatar, Scheduled / Sent / Campaigns tabs with live refresh, compose drawer (subject, body, CSV/TXT upload with detected-count, start time, delay, hourly limit, live finish-time estimate), search, pagination, loading skeletons, empty and error states, toasts, Settings for senders, Slack and system status.

## Project layout

```
apps/api/src
  config/       env (zod), prisma, redis, limiter instance
  routes/       auth, campaigns, emails, senders, slack, stats, bull board
  services/     email (campaigns), outbox, rateLimiter, smtp, sender, search, slack
  workers/      email.worker.ts (claim, reserve, defer, send, classify errors)
  queues/       BullMQ queue definition
  utils/        recipients, schedule planner, state machine, crypto, idempotency
apps/api/test   limiter (Lua), worker behaviour, utilities
apps/web/src
  api/          axios client + typed endpoints
  components/   ui/ (Button, Field, Drawer, DataTable, Tabs, ...) and layout/
  features/     emails, campaigns, compose, settings
  pages/        Login, Dashboard, Settings
```

## Assumptions, shortcuts and trade-offs

* **Lua is tested against `ioredis-mock`**, which cannot prove behaviour on a real Redis. Run the stack against Docker Redis for the real end-to-end check (see `docs/DEMO_CHECKLIST.md`).
* Hourly windows are fixed UTC hours, not sliding (see above).
* The reconciler uses `setInterval` for *repair only*. Delivery times are always BullMQ delays.
* The first-login sender comes from `SMTP_USER`/`SMTP_PASS`. A production system would have users bring their own SMTP credentials (supported via Custom SMTP).
* Campaign recipients are capped at 10,000 per request to keep the transaction bounded.
* Slack delivery goes to a DM (or a channel ID the user pastes); a channel picker would need extra Slack scopes.
* No end-to-end browser tests; the logic that matters (quota, idempotency, retries, state machine) is covered by unit and worker tests.
