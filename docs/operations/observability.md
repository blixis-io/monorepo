# Observability runbook

How to see what the API Worker is doing in staging and production: which signals exist, where they go, which alerts fire, and how to follow one operation from the HTTP request to the webhook it triggers. Implemented by roadmap task 020.002; the log format comes from 020.001.

Related: [Cloudflare Workers](./cloudflare.md#monitoring) · [Events operations](./events.md) · [Webhooks operations](./webhooks.md) · [Code standards: logging](../conventions/code-standards.md#9-logging)

---

## Signals

| Signal | Where | What it answers |
|---|---|---|
| **Workers Logs** | Cloudflare dashboard → Workers → `blixis-api-<env>` → Logs / Observability | Every JSON log line and invocation log. Search by `correlationId`, `requestId`, `eventId`. |
| **Workers traces** | same place, Traces | Timing of one invocation, including subrequests (Hyperdrive, Queues, R2, `fetch`). |
| **Sentry issues** | `private-m57` / `blixis-api` (EU) | Unexpected errors: uncaught exceptions, 5xx responses, GraphQL resolver failures, dead-lettered events, stuck outbox rows. |
| **Sentry cron monitor** | Sentry → Crons → `blixis-api-cron` | Whether the minute cron (outbox sweep, retention, webhook retry sweep) runs, and how long it takes. |
| **Sentry performance** | Sentry → Performance | Sampled request, queue, and cron transactions. |
| **Queues** | dashboard → Queues → `blixis-events-<env>` and `-dlq` | Backlog, consumer errors, DLQ messages. |
| **Database** | `events.outbox`, `webhooks.*` tables ([events](./events.md), [webhooks](./webhooks.md)) | Backlog age and delivery history. |

## Sampling

Configured in `apps/api/wrangler.jsonc` (`observability`, per environment) and `apps/api/src/sentry.ts`.

| | local | staging | production |
|---|---|---|---|
| Workers Logs (`logs.head_sampling_rate`) | 1 | 1 | 1 |
| Workers traces (`traces.head_sampling_rate`) | 1 | 1 | 0.1 |
| Sentry `tracesSampleRate` | — (no DSN) | 1.0 | 0.1 |
| Sentry errors | — | all | all |
| `LOG_LEVEL` | `debug` | `info` | `info` |

**Logs are never sampled.** Head sampling keeps or drops a whole invocation before it runs, so a rate below 1 would also drop the error lines of the dropped invocations. Volume is controlled with `LOG_LEVEL` instead. Check the current Workers Logs limits and pricing on the Cloudflare plan before raising traffic; if log volume ever needs to shrink, lower `LOG_LEVEL` noise first (the per-request `request` line is the largest source).

Traces are sampled in production because they cost more than logs and are only needed for timing questions. Errors never depend on trace sampling: Sentry captures every error event.

## Log format

One JSON object per line (architecture §35), written by the kernel logger (`createJsonLogger`):

```json
{"level":"info","message":"request","time":"2026-09-29T10:00:00.000Z","requestId":"…","correlationId":"…","actorId":"user:…","method":"POST","route":"/api/v1/entries/:entryId/publish","status":200,"duration":84}
```

Standard fields:

| Field | Meaning |
|---|---|
| `requestId` | One HTTP request, or one background scope (queue message, cron run). Returned as `x-request-id`. |
| `correlationId` | The whole operation. Taken from a valid `x-correlation-id` header, else the request id. Copied into every event envelope (`metadata.correlationId`) and bound again in the consumer, so it follows the operation through the outbox and the queue. Returned as `x-correlation-id`. |
| `actorId` | `user:<id>`, `apiToken:<id>`, `deliveryKey:<id>`, `system:<component>`, or `anonymous`. |
| `organizationId`, `spaceId` | Tenant, when known. |
| `eventId`, `eventType` | The event being dispatched or delivered. |
| `module` | Module that logged or failed. |
| `status`, `duration` | Outcome and milliseconds. |
| `error` | Serialized error: `name`, `message`, `code`, `status`, `cause`; `stack` only at `debug`. |

Secrets are redacted by field name and by shape (see [code standards](../conventions/code-standards.md#9-logging)); URLs are logged as route patterns, never with query strings.

### Log lines to know

| Message | Level | Meaning |
|---|---|---|
| `request` | info | One per HTTP request: method, route pattern, status, duration. Health probes are not logged. |
| `request failed` | error | A 5xx problem response (also sent to Sentry). |
| `event.consumed` | info / warn | One queue message dispatched: `ok` and `failed` subscriptions, `status` `delivered` or `retrying`. |
| `event handler failed` | error | One subscription threw; the message is retried. |
| `event.invalid` | error | Envelope invalid or unknown version; retried, then dead-lettered. |
| `event.dead_lettered` | error | Last attempt failed; the queue moves the message to the DLQ. Reported to Sentry as `EventDeadLettered`. |
| `event.unrouted` | info | No subscription for the type; acked. |
| `outbox.swept` | info | Cron sweep sent or deleted outbox rows. |
| `outbox.send_failed`, `outbox.post_commit_failed` | warn | Queue send failed; the row stays pending for the sweep. |
| `outbox.stuck` | error | A row failed ≥ 10 times; logged every sweep, reported to Sentry once as `OutboxStuck`. |
| `webhooks.attempt` | info / warn | One delivery attempt: webhook, delivery, event, attempt, `status`, `statusCode`, duration. Never the URL. |
| `webhooks.disabled` | warn | A webhook was switched off after consecutive failures. |
| `readiness: check failed` | warn | `/api/v1/health/ready` answered 503. |
| `scheduled job failed` | error | A cron job threw (also a failed Sentry check-in). |

## Finding things

**Dashboard (Workers Logs):** Workers → `blixis-api-staging` → Observability. Filter on a field (for example `correlationId` equals the value from the response header), widen the time range, and sort by time. Useful filters:

- `level` = `error` — everything that went wrong;
- `message` = `request` and `status` ≥ 500 — failed requests;
- `message` = `event.consumed` and `status` = `retrying` — events that are failing;
- `eventId` = … — every line about one event, across all its attempts;
- `message` = `webhooks.attempt` and `webhookId` = … — one receiver's history.

**Live, from a terminal** (needs Wrangler logged in to the account):

```bash
npx wrangler tail blixis-api-staging --format json --search <correlationId>
npx wrangler tail blixis-api-staging --format json --status error
```

**Sentry:** issues carry the tags `requestId`, `correlationId`, `route`, `status`, `spaceId`, `module`, `eventId`, `eventType`. Search for example `correlationId:<value>`.

## Alerts

Alerts are delivered by Sentry. Rules marked *code* are raised by the Worker; the others are configured in the Sentry UI by the owner.

| Signal | Source | Rule | Severity |
|---|---|---|---|
| Unexpected errors (5xx, uncaught, resolver failures) | code → Sentry issue | Default *high priority issues* rule (all environments) | notify |
| New issue in production | Sentry UI | *A new issue is created* · `environment:production` | notify |
| Error spike in staging | Sentry UI | *Number of events > 10 in 1 h* · `environment:staging` | notify |
| Dead-lettered event | code → `EventDeadLettered` issue | Covered by the rules above; the DLQ must be looked at ([events](./events.md#common-procedures)) | notify |
| Stuck outbox | code → `OutboxStuck` issue | Covered by the rules above | notify |
| Cron not running / failing / hung | code → cron monitor `blixis-api-cron` (upserted on the first check-in) | 3 consecutive missed or failed check-ins open an issue; margin 2 min, max runtime 5 min | notify |
| API not ready | Sentry UI → Uptime monitor on `GET /api/v1/health/ready` | 1-minute interval; alert after consecutive failures | notify |
| 5xx rate | Sentry (issues above) and Workers dashboard metrics | Error budget below | review |

**Error budget (starting point, revisit at launch):** production 99.5 % of requests without a 5xx over 30 days (about 3.6 hours of failures). Staging has no budget; spikes are investigated when they happen.

**Why no metrics endpoint:** the task allowed an auth-protected endpoint with backlog details. Not built: the outbox (`OutboxStuck`), queue (`EventDeadLettered`), and cron (check-ins) already raise alerts, backlog numbers are one SQL query away ([events](./events.md)), and another authenticated operational endpoint is attack surface without a consumer. Revisit when there is a dashboard that would poll it.

### Owner setup (Sentry UI)

Done once per environment when it goes live:

1. Sentry → Alerts → create *new issue in `production`* and *> 10 events in 1 h in `staging`* (email).
2. Sentry → Uptime → add `https://<staging host>/api/v1/health/ready` (and production once it has a domain), interval 1 minute, environment set accordingly.
3. Sentry → Crons → after the first deploy with this change, `blixis-api-cron` appears per environment; attach the alert to email.
4. Keep **Project Settings → Security & Privacy → Prevent Storing of IP Addresses** on.

## Tracing one publish end to end

The plan-020 completion criterion: one publish on staging, traced by `correlationId` from the HTTP request to the webhook.

Path of the operation:

```text
POST /api/v1/entries/:entryId/publish    request line                 correlationId = C
  └─ transaction writes entry + outbox row (events.outbox, envelope.metadata.correlationId = C)
  └─ post-commit dispatch sends the envelope to blixis-events-staging (or the cron sweep: outbox.swept)
queue consumer: entry.published          event.consumed               correlationId = C, eventId = E
  ├─ @blixis/content#delivery-stamp.entry.published    (delivery cache invalidation)
  └─ @blixis/webhooks#fan-out.entry.published          (one delivery per matching webhook,
                                                          emits webhook.delivery.requested)
queue consumer: webhook.delivery.requested event.consumed              correlationId = C
  └─ @blixis/webhooks#deliver                           webhooks.attempt   eventId = E, correlationId = C
later retries (cron sweep)                webhooks.attempt             eventId = E (own correlationId)
```

Procedure (owner, after deploying `main` to staging):

1. Create a webhook in a staging space pointing at a request catcher you control, subscribed to `entry.published`.
2. Publish an entry with a known correlation id:
   ```bash
   curl -sS -X POST "$API_URL/api/v1/entries/$ENTRY_ID/publish" \
     -H "authorization: Bearer $TOKEN" -H "x-correlation-id: trace-$(date +%s)" \
     -H "if-match: $ETAG" -D - -o /dev/null
   ```
   Note `x-correlation-id` from the response.
3. In Workers Logs, filter `correlationId` = that value. Expect, in order: `request` (status 200); `event.consumed` for `entry.published` with `ok` listing the delivery-stamp and fan-out subscriptions; `event.consumed` for `webhook.delivery.requested`; and `webhooks.attempt` with `status` `succeeded`.
4. Take `eventId` from `webhooks.attempt` and filter on it to see every later retry.
5. Check that the delivery API reads the new version (cache invalidated) and that the catcher received the POST with `blixis-event-id` = `eventId`.
6. Record the result below: date, Worker version, and the log lines with ids shortened and tokens removed.

### Record

**2026-09-29, staging** (deploy of `main` at `3c8c869`, 020.001 + 020.002). Publish of a `traceNote` entry in the Smoke space with `x-correlation-id: trace-1790667625`; logs captured with `wrangler tail --format json`. Ids shortened, `actorId` is the throwaway trace token.

```text
07:40:26.126  POST /api/v1/entries/:entryId/publish
  request                  status 200, duration 181 ms, correlationId trace-1790667625
  outbox.dispatched        events 1                      (post-commit dispatch, same request)
07:40:34.308  queue blixis-events-staging
  event.consumed           entry.published, eventId 01a0ec1b-966a…, status delivered, 2168 ms
                           ok: @blixis/content#delivery-stamp.entry.published,
                               @blixis/webhooks#fan-out.entry.published
  outbox.dispatched        events 1                      (fan-out emitted webhook.delivery.requested)
07:40:40.685  queue blixis-events-staging
  webhooks.attempt         webhookId 01a0ec1b-232e…, attempt 1, status succeeded, statusCode 200
  event.consumed           webhook.delivery.requested, status delivered, ok: @blixis/webhooks#deliver
```

Every line carries `correlationId: trace-1790667625`. The receiver (webhook.site) answered 200 to the signed POST (`blixis-event-id` = the `entry.published` event id), and the delivery API (`/graphql?space=…`) returned the published title right after. Request to webhook: about 14.5 s, most of it queue batching (`max_batch_timeout` 5 s, twice).

Notes from the run:

- `wrangler tail` redacts ids in the request path itself (`/api/v1/entries/REDACTED/publish`); the `route` field of the `request` line is the reliable source.
- `event.consumed` is logged by the consumer before a scope exists, so it has `correlationId` and `eventId` but no `requestId` or tenant fields; filter on `correlationId` or `eventId`, not `requestId`.
