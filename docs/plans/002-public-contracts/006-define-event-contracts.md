# 002.006 — Define event envelope, definition, and subscription contracts

## Status

```text
completed
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Define the versioned `EventEnvelope`, a typed `defineEvent` helper that couples an event name, version, and payload schema, the `EventBus` publishing interface, and `EventSubscription` for module handlers.

## Background

§15 defines the envelope and naming, §5 lists `events` subscriptions on modules, §32/§33 require explicit consistency and idempotency. The event bus implementation comes in plan 006; here only the public shapes exist so modules and the kernel can reference them.

## Requirements

- Define `EventEnvelope<TType, TPayload>` exactly per §15 (`id`, `type`, `version`, `timestamp` ISO string, `tenantId?`, `spaceId?`, `payload`, `metadata?` with `correlationId`, `actorId`, `source`).
- Implement `defineEvent({ type, version, schema, delivery })` returning an `EventDefinition` object; `delivery` is `'transactional'` (outbox, §32) or `'best-effort'` — the per-event-class consistency decision that §32 asks to document.
- Define `EventBus` with `emit(definition, payload, options?)` (typed payload from schema) and an overload for emitting within a transaction handle (opaque `TransactionScope` type from `migrations.ts`/`context.ts` — keep opaque).
- Define `EventSubscription` (`event` definition or type string, `handler(envelope, ctx)`, `id` stable handler name for idempotency, optional `retry` hints).
- Define `EventHandlerContext` (services, logger, `isRedelivery`/attempt number when known).
- Naming rules documented: `<aggregate>.<past-tense-verb>` e.g. `entry.published`, dotted sub-aggregates allowed (`webhook.delivery.failed`).
- Tests: `defineEvent` preserves metadata; type tests infer payload types.

## Architectural constraints

- Envelopes must be JSON-serialisable (no `Date`, `Map`, class instances).
- No dependency on Cloudflare Queues types (§15: domain code never touches `env.QUEUE`).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/events.test.ts
packages/contracts/src/events.test-d.ts
docs/contracts/events.md
```

### Modify

```text
packages/contracts/src/events.ts
packages/contracts/src/context.ts (TransactionScope)
docs/contracts/README.md
docs/ROADMAP.md
docs/plans/002-public-contracts/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write envelope and definition types.
2. Implement `defineEvent`.
3. Write `EventBus`, `EventSubscription`, handler context types.
4. Write tests and `docs/contracts/events.md` with naming and delivery-class rules.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface EventDefinition<TType extends string, TPayload> {
  readonly type: TType
  readonly version: number
  readonly schema: StandardSchemaV1<unknown, TPayload>
  readonly delivery: 'transactional' | 'best-effort'
}
export interface EventBus {
  emit<TType extends string, TPayload>(
    event: EventDefinition<TType, TPayload>,
    payload: TPayload,
    options?: EmitOptions,
  ): Promise<void>
}
```

## Dependencies

Requires:

- [002.005 — Select the validation library and define the schema contract](./005-select-validation-library.md)

## Acceptance criteria

- [x] Type test: emitting `entryPublished` with a wrong payload shape fails to compile.
- [x] `docs/contracts/events.md` documents naming, versioning, and delivery classes.
- [x] Envelope type matches §15 field-for-field.

## Validation

```bash
pnpm --filter @blixis/contracts test
pnpm typecheck
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
- [x] Delivery class concept documented as the §32 per-event-class decision point.

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

- Exports: `EventEnvelope` (§15 field-for-field), `EventMetadata`, `EventDelivery`, `EventDefinition`, `EventType`, `defineEvent`, `EventPayload`, `EmitOptions`, `EventBus`, `EventHandlerContext`, `EventSubscription`, and a `subscribe()` helper (added so handlers get typed envelopes without annotations).
- `defineEvent` validates the naming rule and `version >= 1` at runtime (throws `TypeError` — a programming error at module definition time), infers the payload from the schema via `InferOutput`, and freezes the definition. `EventType` (`${string}.${string}`) also rejects undotted names at compile time.
- **`TransactionScope`** (opaque, branded with a `declare const unique symbol`) was introduced here in `context.ts` instead of 002.008 because `EmitOptions.transaction` needs it; 002.008 documents it alongside the other context types.
- `EventHandlerContext` has `attempt` and `services`; logger/request-context fields are added in 002.008 once `Logger` exists.
- Type tests: payload inference, `emit` rejects missing/mistyped fields (`@ts-expect-error`), typed envelopes in `subscribe`, undotted type rejected.
- `docs/contracts/events.md` holds naming/versioning/idempotency rules and the **event register** table where every event's delivery class is recorded (§32 per-event-class decision).
