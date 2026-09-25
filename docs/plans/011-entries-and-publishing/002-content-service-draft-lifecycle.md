# 011.002 — Implement ContentService draft lifecycle

## Status

```text
completed
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
modules/content/src/domain/links.ts
modules/content/test/content.service.test.ts
modules/content/test/links.test.ts
```

### Modify

```text
modules/content/src/permissions.ts
modules/content/src/events.ts
modules/content/src/module.ts
modules/content/src/index.ts
modules/spaces/src/application/locales.service.ts (LocaleService.codes)
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

- [x] Update with stale `expectedVersion` → `ConflictError`.
- [x] Each update creates a new version; previous versions unchanged.
- [x] Events recorded in outbox within the same transaction.

## Validation

```bash
pnpm --filter @blixis/content test
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
- [x] Service API matches §7 intent; deviations documented.

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

- **Signature choice:** the service takes `(actor, tenant, …)` like every other Blixis service, not a `RequestContext` `ctx`. For entry-id routes, `resolveTenant(actor, entryId)` loads the entry by id, requires `content.entries.read` on its organization and space (`404` for non-members), and returns the verified environment tenant, which routes bind before calling other methods (011.003).
- **Methods:**
  - `create`: validates as a draft, rejects `component` types, writes version 1 and its links in one transaction, emits `entry.created`.
  - `get`: `state: 'draft' | 'published'`; `published` without a publication gives `404 Entry is not published`.
  - `list`: keyset pagination with an opaque base64 cursor, limit 1–100 (default 25), `contentType` (`apiId` or id), `updatedSince`, `state`.
  - `update`: the complete fields plus `expectedVersion`; a stale version gives `409`; emits `entry.updated`.
  - `delete`: only when unpublished; optional `expectedVersion`; emits `entry.deleted` transactionally, in the same transaction.
- **Response shape** `{ sys, fields }`:
  - `sys` carries `id`, `type`, `contentType{id,apiId}`, `environmentId`, `version` (current), `fieldsVersion` (the version the fields come from), `status` (`draft`/`published`/`changed`), the publication pointers and timestamps, and `createdBy`/`updatedBy` (actor ids).
  - `fields` are keyed by `apiId`, translated by `fromStorage`.
- **Field filters (MVP, ADR 0010 §9):** `fields.<apiId>=value` on non-localized `text`/`select`/`number`/`boolean`/`date` fields. They require `contentType`, are typed by field type, and run as stored-shape JSONB containment (multi-selects as `[value]`). Anything else is a `400` with a path.
- **Permissions:**

  | Permission | Default roles |
  |---|---|
  | `content.entries.read` | admin, editor, viewer |
  | `content.entries.write` | admin, editor |
  | `content.entries.publish` | admin, editor |
  | `content.entries.delete` | admin, editor |

- **Events** (registered in `docs/contracts/events.md`):
  - best-effort: `entry.created` and `entry.updated`;
  - transactional: `entry.deleted`, and (from 011.004) `entry.published` and `entry.unpublished`, which cache invalidation and webhooks rely on.

  Payloads carry only ids: `entryId`, `environmentId`, `contentTypeId`, `versionId`.
- **Links:** `collectLinks` (domain) extracts entry and asset links from `reference`/`asset`, entry `link`s, rich-text embeds and `link.entryId` marks, recursively through blocks. They're stored per version in `entry_references`.
- **Locales:** `LocaleService.codes(tenant)` was added to `@blixis/spaces`, platform-only and without authorization, so validation works for API tokens without a `spaces.read` scope.
- **Validators:** compiled validators come from one isolate-level `EntrySchemaCache`, and content types are memoised per request.
- `createEntryToolkit` holds the internals that publishing and versions (011.004/005) reuse.
