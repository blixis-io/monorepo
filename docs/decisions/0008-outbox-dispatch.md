# 0008 — Transactional outbox dispatch

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [006.005](../plans/006-events-and-async-processing/005-transactional-outbox.md)

## Context

§32 forbids assuming that a database write and a queue send are atomic. Events whose loss would corrupt state (`delivery: 'transactional'`) must be written in the same transaction as the domain change and delivered after it commits. Workers have no long-running process: work after the response happens in `ctx.waitUntil` (best effort, bounded), and Cron Triggers give at most one invocation per minute. Neon is reached through Hyperdrive in transaction pooling mode (ADR 0006), so row locks only exist inside a transaction. Consumers are already idempotent per subscription (§33, 006.006), and delivery is at-least-once everywhere.

## Decision

1. **Table:** `events.outbox`, owned by the `@blixis/events.outbox` module and created by its migration. Columns:
   - `id` (= envelope id, UUIDv7), `type`, `version`, `envelope jsonb`;
   - `created_at`, `dispatched_at` (null while pending), `attempts`, `last_error`;
   - a partial index on `created_at` where `dispatched_at is null`.
2. **Write:** `emit(transactionalEvent, payload, { transaction })` inserts the envelope with the caller's transaction (`fromTransactionScope`). It never uses a separate connection. Without a transaction, `emit` fails (enforced by the bus since 006.001). A rollback removes the row, so the event never existed.
3. **Two dispatch triggers:**
   - **Post-commit, best effort.** The request scope remembers the IDs it wrote. When the scope ends (after the transaction has committed or rolled back), `dispatchOutbox(ids)` runs in `waitUntil`. It finds only committed rows, so rolled-back IDs are a no-op.
   - **Cron sweep, the guarantee.** Every minute (`* * * * *`), a sweep dispatches pending rows older than 5 seconds, oldest first, in batches of 100, until none are left or the run's budget is used. It catches everything the post-commit attempt missed: a crash, a timeout, or a queue outage.
4. **No double sends between concurrent dispatchers:**
   - Each batch is selected with `FOR UPDATE SKIP LOCKED` inside a transaction. It is sent with one `sendBatch`, marked `dispatched_at = now()`, and committed; parallel sweeps and post-commit dispatches skip rows another dispatcher holds.
   - This is the one place where outside I/O (the queue send) happens inside a transaction. It is bounded to one batch.
   - A crash after the send but before the commit sends the batch again. **Delivery stays at-least-once**; consumers dedupe by event ID.
5. **Failure handling:**
   - If the send fails, the rows stay pending, `attempts` is incremented, and `last_error` records the error name and message. No connection strings are stored there.
   - The sweep keeps retrying. Rows with `attempts >= 10` are logged at `error` on every sweep so they alert (020.002), but they keep being retried; they are never silently dropped.
6. **Ordering:** there is no ordering guarantee, neither global nor per aggregate. The sweep processes oldest first, but retries, batching, and queue delivery reorder events. Consumers must tolerate reordering and duplicates, for example by using versions or timestamps in payloads.
7. **Retention:** the cron also deletes rows dispatched more than **7 days** ago (configurable). Undispatched rows are never deleted.

## Alternatives considered

- **Post-commit dispatch only:** `waitUntil` isn't guaranteed to finish, so events could be lost. Rejected.
- **Sweep only:** simpler, but it adds up to a minute of latency to every transactional event. The post-commit attempt makes the common case fast.
- **A Durable Object or Workflow as the dispatcher:** more moving parts, and adds per-request cost. The sweep plus `SKIP LOCKED` is enough at MVP scale and can move later.
- **Logical replication / CDC from Neon:** needs an always-on consumer outside Workers. Rejected for the MVP.

## Consequences

- Each app that uses transactional events registers `outboxModule()` and runs its migration **before** deploying code that sweeps. Otherwise the cron fails every minute.
- The cron trigger `* * * * *` is part of `wrangler.jsonc` in every environment.
- Consumers must be idempotent and tolerate reordering. This is already required by §33.
- Queue sends happen at most every minute (sweep) or right after the request (post-commit). Latency is observable as `created_at` → `dispatched_at`.
