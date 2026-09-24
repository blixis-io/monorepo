# 006.001 — Scaffold @blixis/events with the event definition registry

## Status

```text
completed
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Create `@blixis/events` with an event definition registry, envelope creation (IDs, timestamps, tenant, correlation metadata), payload validation, and the `EVENT_BUS` service token wiring through an `eventsModule()` platform module.

## Background

Contracts define `defineEvent`, `EventEnvelope`, `EventBus`, and `EventSubscription` (002.006). The kernel collects subscriptions (003.007). This package turns those into working infrastructure while staying independent of Cloudflare.

## Requirements

- Create `packages/events` depending on contracts, kernel, shared (no Cloudflare dependency).
- `EventRegistry`: register definitions (by `type`+`version`), detect conflicting definitions (same type/version with different schema identity) naming modules.
- `createEnvelope(definition, payload, requestContext)`: UUIDv7 `id`, ISO `timestamp`, tenant IDs from context, metadata (`correlationId`, `actorId`, `source` = module name).
- Validate payloads against the definition schema on emit and on receive (`parseEnvelope(raw)` for consumer side, returning a typed envelope or `ValidationError`).
- `eventsModule(options)` platform module providing `EVENT_BUS` (request-scoped, since it may hold a transaction or a DB connection) and capability `blixis.events`.
- `ctx.events` in module setup/handlers resolves to the bus.

## Architectural constraints

- No Cloudflare imports (§4, §15).
- Payloads must be JSON-serialisable; reject non-plain values on emit.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/events/package.json
packages/events/src/bus.ts
packages/events/src/envelope.test.ts
packages/events/src/envelope.ts
packages/events/src/index.ts
packages/events/src/json.ts
packages/events/src/module.test.ts
packages/events/src/module.ts
packages/events/src/registry.test.ts
packages/events/src/registry.ts
packages/events/tsconfig.json
packages/events/tsconfig.test.json
packages/shared/src/ids.test.ts
packages/shared/src/ids.ts
```

### Modify

```text
apps/docs/astro.config.mjs
apps/docs/src/content/docs/concepts/events.mdx
docs/ROADMAP.md
docs/decisions/0007-ids-and-tenancy-conventions.md
docs/kernel/README.md
docs/plans/006-events-and-async-processing/001-scaffold-events-package-and-registry.md
docs/plans/006-events-and-async-processing/_index.md
packages/contracts/src/context.ts
packages/contracts/src/events.ts
packages/database/package.json
packages/database/src/ids.ts
packages/database/tsconfig.json
packages/kernel/src/create-blixis.ts
packages/kernel/src/internal/rest.test.ts
packages/kernel/src/internal/rest.ts
packages/kernel/src/internal/services.ts
packages/shared/src/index.ts
packages/shared/tsconfig.json
packages/shared/tsconfig.test.json
pnpm-lock.yaml
tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold package.
2. Implement registry and conflict detection.
3. Implement envelope creation and parsing.
4. Implement `eventsModule()` with a placeholder bus selection (filled by 006.002–006.005).
5. Tests.

## Dependencies

Requires:

- [005.008 — Add the database readiness vertical slice](../005-database-foundation/008-database-readiness-vertical-slice.md)

## Acceptance criteria

- [x] Envelopes match §15 field-for-field and serialise via `JSON.stringify` round-trip.
- [x] Invalid payloads throw `ValidationError` on emit and on parse.
- [x] Conflicting definitions fail bootstrap naming both modules.

## Validation

```bash
pnpm --filter @blixis/events test
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
- [x] No Cloudflare types in the package.

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

- **Contracts additions** (both zero-dependency service tokens):
  - `EVENT_BUS` in `events.ts`: modules call `ctx.services.get(EVENT_BUS)` and never depend on `@blixis/events`.
  - `REQUEST_CONTEXT` in `context.ts`: the bus is request-scoped, but service factories only receive `services`/`bindings`, not the request context.
- **Kernel change:** `RequestServiceScope.provideValue(token, value)`. Values provided this way need no registration and are not disposed. The REST middleware and `runInScope` (queue and cron) provide `REQUEST_CONTEXT`. Tested for HTTP and `runInScope`.
- **Deviation:** there is no `ctx.events` shortcut. Modules use `services.get(EVENT_BUS)`, like every other service. A property on `RequestContext` would make the kernel depend on the events package.
- **Deviation:** `metadata.source` (emitting module) is not set by the bus yet. The request-scope registry doesn't know which module resolved `EVENT_BUS`. `createEnvelope` accepts `source`; revisit when per-module bus instances are needed.
- **`newId()` moved to `@blixis/shared`** (dependency-free) and is re-exported by `@blixis/database`, so `@blixis/events` doesn't pull in `pg`. ADR 0007 is updated, and `ids.test.ts` moved with it. `@blixis/shared` tsconfig adds lib `webworker` for Web Crypto types.
- **Bus/transport split:** the bus registers the definition, rejects transactional events without `transaction`, validates the payload, checks JSON, and builds the envelope. An `EventTransport` delivers it. `eventsModule()` without a transport fails `emit` with `InfrastructureError` (no silent drops). Transports: in-process (006.002), queue (006.003), outbox (006.005).
- **Registry:** keyed by `type@version`. The same definition object from several modules is OK; a *different* object for the same key is a conflict, and the `ModuleError` names both modules. `eventsModule` setup registers all subscription events from `KERNEL_CONTRIBUTIONS`, so conflicts fail at startup.
- **Envelopes:**
  - `createEnvelope`: UUIDv7 `id`, ISO timestamp from `context.now()`, `tenantId` = `organizationId` (overridable), `spaceId`, and metadata `correlationId` plus `actorId` (`user:`/`apiToken:`/`deliveryKey:`/`system:`; none for anonymous).
  - `assertJsonValue` rejects `undefined`, functions, symbols, bigint, NaN/Infinity, class instances (`Date`, `Map`), and cycles, with the path of the offending value.
  - `parseEnvelope` checks the shape (UUID id, integer version, ISO UTC timestamp, string tenant fields), looks up the definition, validates the payload, and **rebuilds** the envelope, dropping unknown fields and unknown or non-string metadata.
- **Tests:** 21 in `@blixis/events` plus 1 kernel test; the full suite is 271 passed with `pnpm test:db`.
- **Docs:** manual Events → Emitting (`EVENT_BUS`, transaction, JSON rules), `@blixis/events` in the API reference, kernel README (request context as a service).
