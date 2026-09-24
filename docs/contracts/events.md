# Events

Event contracts from architecture §15, §32, and §33, implemented in [`packages/contracts/src/events.ts`](../../packages/contracts/src/events.ts). The bus implementation (in-process, outbox, Cloudflare Queues) is `@blixis/events` (plan 006).

Related: [Contracts overview](./README.md) · [Errors](./errors.md)

---

## Defining and using events

```ts
import { defineEvent, subscribe } from '@blixis/contracts'
import { z } from 'zod'

export const entryPublished = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  description: 'An entry version was published.',
  schema: z.object({ entryId: z.string(), spaceId: z.string(), versionId: z.string() }),
})

// emit (payload type-checked against the schema):
await ctx.events.emit(entryPublished, { entryId, spaceId, versionId }, { transaction })

// consume (module definition `events: [...]`):
subscribe(entryPublished, 'invalidate-delivery-cache', async (envelope, ctx) => { /* idempotent */ })
```

## Rules

- **Naming:** `<aggregate>.<past-tense-verb>`, lowercase, dotted sub-aggregates allowed (`webhook.delivery.failed`). Enforced by `defineEvent`.
- **Payloads:** small and JSON-serialisable — **IDs, not documents** (Queues have message size limits). No `Date`, `Map`, or class instances.
- **Versioning:** start at `1`; bump `version` when a payload change is incompatible. Events that are public integration contracts (webhooks, plan 015) must stay backward compatible within a version. Subscriptions declare accepted `versions` when they support more than one.
- **Validation:** payloads are validated on emit *and* on consume (queue messages are untrusted input, §29).
- **Idempotency:** handlers must tolerate redelivery; the subscription `id` is the key for processed-event records (006.006). Never rename a subscription `id` casually.
- **Tracing:** envelopes carry `correlationId`, `actorId`, and `source` in `metadata` (§35).

## Delivery classes (§32)

| Class | Guarantee | Use when |
|---|---|---|
| `transactional` | Written to the outbox in the emitting DB transaction; delivered at least once iff the transaction commits. Requires `options.transaction`. | Losing the event would leave the system incorrect (cache invalidation, webhooks, provisioning). |
| `best-effort` | Sent after the operation; may be lost on failure. | Pure side effects whose loss is acceptable (analytics, non-critical notifications). |

## Event register

Every event is listed here with its delivery class — this is the per-event-class decision §32 asks for. Rows are added by the task that defines the event.

| Event | Version | Delivery | Owner | Consumers | Defined in |
|---|---|---|---|---|---|
| _none yet_ | | | | | |
