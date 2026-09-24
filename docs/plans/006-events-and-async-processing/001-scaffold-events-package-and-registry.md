# 006.001 — Scaffold @blixis/events with the event definition registry

## Status

```text
not-started
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
packages/events/tsconfig.json
packages/events/src/index.ts
packages/events/src/registry.ts
packages/events/src/envelope.ts
packages/events/src/module.ts
packages/events/src/registry.test.ts
packages/events/src/envelope.test.ts
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
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

- [ ] Envelopes match §15 field-for-field and serialise via `JSON.stringify` round-trip.
- [ ] Invalid payloads throw `ValidationError` on emit and on parse.
- [ ] Conflicting definitions fail bootstrap naming both modules.

## Validation

```bash
pnpm --filter @blixis/events test
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] No Cloudflare types in the package.

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

No technical notes yet.
