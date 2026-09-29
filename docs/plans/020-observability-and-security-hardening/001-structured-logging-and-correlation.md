# 020.001 — Implement structured logging, redaction, and correlation propagation

## Status

```text
completed
```

## Parent plan

[020 — Observability & Security Hardening](./_index.md)

## Objective

Implement the platform logger (JSON, level filtering, child fields, redaction) and ensure correlation/request IDs flow through HTTP, events, queue consumers, scheduled jobs, and Workflows with the §35 field names.

## Background

§35 structured fields and forbidden content; contracts `Logger` (002.008).

## Requirements

- Logger in `@blixis/kernel` (or `@blixis/shared`) implementing `Logger`: JSON lines, level from `LOG_LEVEL`, child bindings, error serialisation without stack in production info logs (stack at debug), size limits per field.
- Redaction: key-based (`password`, `token`, `secret`, `authorization`, `cookie`, `connectionString`, …) and value-pattern-based (token prefixes `blx_`, `postgres://`).
- Standard fields: `requestId`, `correlationId`, `tenantId`/`organizationId`, `spaceId`, `actorId`, `module`, `eventType`, `eventId`, `duration`, `status`.
- Request log line per HTTP request (method, route pattern, status, duration) — no query strings with secrets.
- Tests: redaction, propagation through event dispatch and queue consumer.
- Replace ad-hoc logging across modules.

## Architectural constraints

- No logging library dependency unless justified (Workers-compatible, small).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/logger.test.ts
```

### Modify

```text
packages/kernel/src/logger.ts
packages/kernel/src/index.ts
packages/kernel/src/internal/rest.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/create-blixis.test.ts
packages/events/src/dispatch.ts
packages/events/src/consumer.ts
packages/events/src/consumer.test.ts
packages/events/src/outbox/module.ts
packages/cloudflare/src/worker-handler.ts
packages/cloudflare/src/execution-context.ts
packages/cloudflare/src/env.test.ts
packages/graphql/src/module.ts
modules/webhooks/src/application/deliver.ts
docs/conventions/code-standards.md
docs/api-surface/kernel.api.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement logger and redaction.
2. Wire into kernel/adapters.
3. Update call sites.
4. Tests.

## Dependencies

Requires:

- [013.005 — Review cache correctness and document operations](../013-delivery-caching/005-cache-correctness-review.md)
- [014.006 — Implement idempotent asset deletion and orphan cleanup](../014-assets/006-asset-deletion-and-cleanup.md)
- [015.005 — Verify webhooks end to end](../015-webhooks/005-webhooks-end-to-end.md)

## Acceptance criteria

- [x] Redaction tests pass for all listed keys/patterns.
- [x] Consumer logs for an event carry the originating request's `correlationId`.

## Validation

```bash
pnpm test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Grep for `console.` in source outside the logger returns nothing (lint rule added).

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- The logger already existed in `@blixis/kernel` (JSON lines, levels, child bindings) but `LOG_LEVEL` was never applied, nothing was redacted, and errors were logged as `"Name: message"` strings. It now takes a level *function*: Workers only expose `env` per invocation, so `createBlixis` reads `LOG_LEVEL` in `fetch`, `queue`, and `scheduled` and the default logger reads it on every call.
- Redaction runs on every entry: by field name (case-insensitive, ignoring `_`/`-`, suffix match so `refreshToken`, `clientSecret`, `set-cookie` are caught) and by value shape (`blx_` tokens, `scheme://user:pass@`, Bearer/Basic, JWTs, `npm_`/`gh?_`/`sk_live_`/`sk_test_`). The message string is redacted too.
- Errors are serialized to `name`, `message`, `code`, `status`, `cause`; the stack only when stacks are on (default: at `debug` level). All `String(error)` call sites in packages and modules now pass the error object.
- One `request` line per HTTP request (method, route pattern from Hono, status, duration) bound to `requestId`, `correlationId`, and `actorId`. Health and readiness probes are answered before the request middleware and produce no line.
- Background scopes (`runInScope`: queue, scheduled) bind `requestId`, `correlationId`, `actorId`, and tenant fields. Existing dispatch and consumer tests already assert that the envelope's `correlationId` reaches handler contexts and consumer logs.
- No dependency added; the Biome `noConsole` rule already enforces no `console.*` outside the logger sink.
