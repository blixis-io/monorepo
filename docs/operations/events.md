# Events operations

How to run and inspect the event pipeline in staging and production: the queue, the dead-letter queue, the outbox, and the processed-event markers. For the design, see architecture §15, §32, §33, [ADR 0008](../decisions/0008-outbox-dispatch.md), and the manual's Events page.

Related: [Database](./database.md) · [Cloudflare Workers](./cloudflare.md#monitoring) · [Configuration](./configuration.md)

---

## Pipeline

```text
command (HTTP) ──tx──▶ events.outbox ──post-commit (waitUntil) or 1-min sweep──▶ blixis-events-<env>
                                                                                   │ batch 10, 5 s
                                                                                   ▼
                                  events.processed ◀── handler (own scope) ◀── eventsModule consumer
                                                                                   │ 5 retries, backoff 5 s…10 min
                                                                                   ▼
                                                                         blixis-events-<env>-dlq
```

Best-effort events skip the outbox and go straight to the queue.

## What to watch

| Signal | Where | Healthy |
|---|---|---|
| Outbox backlog | `select count(*), min(created_at) from events.outbox where dispatched_at is null` | 0, or rows younger than about 1 minute |
| Stuck outbox rows | log `outbox.stuck` (error); `select id, type, attempts, last_error from events.outbox where attempts >= 10 and dispatched_at is null` | none |
| Queue backlog | Cloudflare dashboard → Queues → `blixis-events-<env>` (backlog, consumer errors), or `npx wrangler queues info blixis-events-<env>` | near 0 |
| DLQ | dashboard → Queues → `blixis-events-<env>-dlq` | empty |
| Handler failures | log `event handler failed` (error), `event.consumed` with `status: retrying` (warn) | rare, transient |
| Invalid envelopes | log `event.invalid` (error) | none |
| Post-commit dispatch | log `outbox.dispatched` (`events`: rows sent after a request committed) | after every transactional command |
| Consumer runs | `wrangler tail` line `Queue blixis-events-<env> (N messages) - Ok`; logs `event.consumed` (subscribed types) and `event.unrouted` (no subscriber in this Worker, acked) | a few seconds after writes |
| Sweep activity | log `outbox.swept` (only when it sent or deleted something) | occasional (the post-commit path normally wins) |

Logs appear in Workers Logs (`observability.enabled`) and live with `npx wrangler tail blixis-api-<env> --format pretty`. Errors also reach Sentry.

## Common procedures

**Inspect the outbox** (as `blixis_migrator` or the owner, never with app credentials in a shell):

```sql
select type, count(*) filter (where dispatched_at is null) as pending,
       max(attempts) as max_attempts, min(created_at) filter (where dispatched_at is null) as oldest_pending
from events.outbox group by type;
```

**Force a dispatch:** nothing is needed; the next cron sweep (within a minute) sends pending rows. If the queue was down, rows keep their `attempts` and `last_error` until a send succeeds.

**DLQ messages:**
1. Look at them in the dashboard (Queues → DLQ → messages), or add a temporary pull consumer.
2. Find the cause in the logs by `eventId`: a handler bug, an invalid envelope, or a schema mismatch.
3. Fix it.
4. To replay, re-send the message bodies to `blixis-events-<env>`. Handlers that already processed an event are skipped (`events.processed`), so replays are safe.

**Why an event did not arrive:**
1. Was it emitted? Check `events.outbox` by `type` and time (transactional events only).
2. Was it dispatched (`dispatched_at`)?
3. Did the consumer see it? Search logs for `eventId` (`event.consumed` / `event.unrouted`). `event.unrouted` means no module subscribes to that type in this Worker.
4. Did the subscription process it? `select * from events.processed where event_id = '<id>'`.

## Guarantees (reminder)

- **At least once**, with **no ordering guarantee**. Handlers must tolerate duplicates and reordering. `events.processed` skips duplicates per subscription for 30 days.
- A rolled-back command never produces an event. A committed transactional event is never lost: the sweep retries until the send succeeds.
- **Measured (006.007):** emit → handler takes a p50 of 8 ms locally on the post-commit path (simulated queue, local Postgres). On Cloudflare, add the queue's batching delay (`max_batch_timeout` 5 s) and network time. On the sweep path, add up to 60 s.

## Verifying the event path end to end

1. Start `npx wrangler tail blixis-api-<env> --format pretty` with **no** `--search` filter. Queue invocations aren't log lines, so a search hides them.
2. Run the content smoke test (`pnpm --filter @blixis/smoke content`, see `tooling/smoke`).
3. Expect the HTTP requests, then `outbox.dispatched` for the publish, unpublish and delete, and within about 5–10 s a `Queue blixis-events-<env> (N messages) - Ok` invocation. N counts every event of the run, best-effort ones included.

Verified on staging on 2026-09-25 (CP5): the smoke run's 13 requests were followed by `Queue blixis-events-staging (10 messages) - Ok` one second after the last request.

## Staging verification (after `db:migrate` and deploy)

1. `GET /api/v1/health/ready` returns 200.
2. `npx wrangler tail blixis-api-staging --format pretty` for 2–3 minutes shows the `* * * * *` scheduled invocations with outcome `ok` and no `outbox.*` errors.
3. Sentry has no new issues from the cron or the queue consumer.
4. `npx wrangler queues info blixis-events-staging` shows the consumer `blixis-api-staging` attached.
