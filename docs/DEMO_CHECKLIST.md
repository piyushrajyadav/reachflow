# Demo checklist (under 5 minutes)

Prep: `docker compose up -d`, `npm run db:migrate`, `npm run dev`. Have an Ethereal inbox open in another tab and Slack connected (Settings > Send test message to confirm).

1. **Login.** Continue with Google. Point out the name, email and avatar in the header, and Log out / back in.
2. **Compose.** Upload `leads.csv` (include a bad address and a duplicate). Show "N recipients detected" and the skipped counts. Subject and body, start in 1 minute, delay 2 s, **hourly limit 3**. Schedule.
3. **Scheduled tab.** Rows are `Queued` with times 2 s apart. Open `/admin/queues` and show the delayed jobs.
4. **Rate limit.** When the first three are sent, the rest flip to `Delayed · limit` with times in the next hour. The Slack message arrives. Say: nothing was dropped, same jobs, rescheduled.
5. **Sent tab.** Delivered rows appear on their own (5 s refresh). Click *Preview* to open the message in Ethereal.
6. **Search.** Type part of a recipient address (served by Elasticsearch).
7. **Restart.** Schedule a campaign for 2 minutes out. `Ctrl+C` the API, show the jobs still in Redis (Bull Board after restart, or `docker exec reachflow-redis redis-cli zcard bull:email-delivery:delayed`). Start it again. The emails send at the right time, with no duplicates (check the Sent tab count against recipients).
8. **Load (bonus).** Upload 1,000 addresses with limit 50: show the first 50 spaced out and the rest planned across later hours.

Talking points: effectively-once vs exactly-once, Lua atomic reservation, outbox reconciler, Elasticsearch is rebuildable from Postgres.
