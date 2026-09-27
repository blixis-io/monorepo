# Webhooks

How webhook delivery runs and how to set it up, verify it, and troubleshoot it (plan 015). The API is in the manual: [Webhooks API](../../apps/docs/src/content/docs/content/webhooks-api.mdx); the contract for receivers is [`docs/api/webhooks.md`](../api/webhooks.md).

Related: [Events](./events.md) · [Cloudflare Workers](./cloudflare.md) · [Configuration](./configuration.md)

---

## How it runs

```text
entry.published (outbox → events queue)
  → fan-out.entry.published            one pending row per matching webhook (webhooks.deliveries)
  → webhook.delivery.requested         transactional, with the rows
  → deliver                            claim (5-min lease) → sign → POST (10 s) → log attempt
  → per-minute sweep (* * * * *)       retries due deliveries: 1m, 5m, 15m, 1h, 3h, 6h, 12h
```

| Table | Holds |
|---|---|
| `webhooks.webhooks` | configuration; `secret_encrypted` (AES-GCM, key from `WEBHOOK_SECRET_KEYS`), `failure_count`, `disabled_reason` |
| `webhooks.deliveries` | one row per (webhook, event); `status`, `attempts`, `next_attempt_at`, last result |
| `webhooks.attempts` | one row per HTTP attempt; ≤ 1 KB response excerpt, never headers |

- **Queue:** deliveries share the events queue (`blixis-events-<env>`). An attempt holds a consumer for at most 10 s. A dedicated queue is the change if webhook latency ever delays other events (decision in plan 015.003).
- **Retention:** finished deliveries are deleted after 30 days (hourly, by the sweep).
- **Disabling:** 50 consecutive failed attempts disable a webhook (`webhook.disabled`).

## Setup per environment

1. **Secret keys** (once; rotation in [Cloudflare → Secrets](./cloudflare.md#secrets)):
   ```bash
   node tooling/db/src/cli.ts generate-webhook-key staging-2026-09 \
     | (cd apps/api && npx wrangler secret put WEBHOOK_SECRET_KEYS --env staging)
   ```
2. **Migrations:** `pnpm db:migrate` (webhooks `0001`–`0003`).
3. **Deploy.** Without the secret, webhook routes fail with a server error; nothing else is affected, and the sweep stays idle.

## Verify on staging

With an admin token for the test space (`$TOKEN`, `$SPACE`) and an HTTPS endpoint you control that logs requests (a small Worker, or a request inspector):

```bash
API=https://blixis-api-staging.frosty-hill-6079.workers.dev/api/v1
# 1. Create: the response shows the secret once
curl -s -X POST "$API/spaces/$SPACE/webhooks" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Staging check","url":"https://<your receiver>","eventTypes":["entry.published"]}'
# 2. Ping: the receiver gets a signed webhook.ping
curl -s -X POST "$API/webhooks/$HOOK/test" -H "authorization: Bearer $TOKEN"
# 3. Publish an entry in the space (Postman "Publish entry"), then check the log
curl -s "$API/webhooks/$HOOK/deliveries" -H "authorization: Bearer $TOKEN"
# 4. SSRF guard: must answer 400
curl -s -X POST "$API/spaces/$SPACE/webhooks" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"x","url":"https://169.254.169.254/","eventTypes":["*"]}'
# 5. Clean up
curl -s -X DELETE "$API/webhooks/$HOOK" -H "authorization: Bearer $TOKEN"
```

Expect `succeeded` deliveries with `attempts: 1`, and a signature that verifies with the receiver example in [`docs/api/webhooks.md`](../api/webhooks.md#verify-the-signature). To see retries, point the webhook at an endpoint answering `500`: the log shows `pending` with `nextAttemptAt` about a minute later.

## Troubleshooting

**Deliveries stay `pending`.** Check `next_attempt_at` (a future time is a scheduled retry) and the queue consumer (`wrangler tail`). A delivery claimed by a crashed attempt becomes due again after its 5-minute lease.

**`lastError: "Signing secret unavailable (server configuration)"`.** `WEBHOOK_SECRET_KEYS` is missing, or doesn't contain the key id the secret was encrypted with (`secret_encrypted` starts with `v1.<kid>.`). Restore the key, or rotate the webhook's secret. These attempts don't count toward disabling.

**A webhook was disabled.** `disabledReason` says why (`… (last: HTTP 502)`). Fix the endpoint, then `PATCH /webhooks/:id { "active": true }` — this resets `failureCount`. Deliveries abandoned meanwhile can be redelivered from the log.

**`lastError: "URL refused: …"`.** The URL no longer passes the policy (e.g. saved in local development). Change the URL.

**Useful queries** (read-only):

```sql
select status, count(*) from webhooks.deliveries group by status;
select w.name, w.active, w.failure_count, w.disabled_reason from webhooks.webhooks w order by w.failure_count desc;
select d.event_type, d.status, d.attempts, d.last_status_code, d.last_error, d.next_attempt_at
  from webhooks.deliveries d where d.webhook_id = '<id>' order by d.created_at desc limit 20;
```
