# 011.002 — Implement ContentService draft lifecycle

## Status

```text
not-started
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Implement `ContentService` create/update/get/list/delete for drafts with validation, optimistic concurrency, authorization, and events, exported as `CONTENT_SERVICE`.

## Background

§7 shows `ContentService` and `CONTENT_SERVICE` as the canonical example of a service token; §2.4 all transports call it; §30 permission checks inside.

## Requirements

- Methods: `create(ctx, { contentTypeId, fields })`, `update(ctx, id, { fields, expectedVersion })` (new version), `get(ctx, id, { version?: 'draft'|'published' })`, `list(ctx, filters, page)`, `delete(ctx, id)`.
- Validation: draft mode (010.004).
- Authorization: `content.entries.read`, `content.entries.write`, `content.entries.delete` (declare with default grants).
- Events: `entry.created`, `entry.updated`, `entry.deleted` per events table; payload IDs only (`entryId`, `spaceId`, `environmentId`, `contentTypeId`, `versionId`).
- `ctx` is the `RequestContext` (actor, tenant) — no Hono types.
- Export public types: `Entry`, `EntryVersion`, `ContentService`, `CONTENT_SERVICE`, event definitions.
- Unit tests with fakes; integration tests with test DB.

## Architectural constraints

- No Hono or GraphQL types in the service (§2.4, §28).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/application/content.service.ts
modules/content/src/application/content.commands.ts
modules/content/test/content.service.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/index.ts
modules/content/src/permissions.ts
modules/content/src/events.ts
docs/contracts/events.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement service and commands.
2. Wire events with transactions.
3. Tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface ContentService {
  get(ctx: RequestContext, id: string, options?: { state?: 'draft' | 'published' }): Promise<Entry | null>
  list(ctx: RequestContext, query: EntryQuery): Promise<Page<Entry>>
  create(ctx: RequestContext, input: CreateEntryInput): Promise<Entry>
  update(ctx: RequestContext, id: string, input: UpdateEntryInput): Promise<Entry>
  publish(ctx: RequestContext, id: string, options?: PublishOptions): Promise<Entry>
  unpublish(ctx: RequestContext, id: string): Promise<Entry>
  delete(ctx: RequestContext, id: string): Promise<void>
}
export const CONTENT_SERVICE = createServiceToken<ContentService>('@blixis/content.service')
```

## Dependencies

Requires:

- [011.001 — Create entry, version, and publication schema](./001-entry-and-version-schema.md)

## Acceptance criteria

- [ ] Update with stale `expectedVersion` → `ConflictError`.
- [ ] Each update creates a new version; previous versions unchanged.
- [ ] Events recorded in outbox within the same transaction.

## Validation

```bash
pnpm --filter @blixis/content test
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
- [ ] Service API matches §7 intent; deviations documented.

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
