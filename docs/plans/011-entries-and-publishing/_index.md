# 011 — Entries, Versions & Publishing

## Status

```text
not-started
```

Milestone: Milestone 5 — Content management core  
Roadmap scope: MVP / initial platform  
Progress: 0/7 tasks completed

## Objective

Deliver the Management REST API for entries such that editing never overwrites the only copy of content (§22): every save creates a new draft version, publishing is an explicit command that points the entry's publication at a specific version and emits `entry.published` through the outbox, and consumers can read published content publicly or draft content when authorised (delivery transport follows in 012).

## Why this plan exists

§22 defines draft vs. published and publishing as an explicit command; §9 lists the entry routes; §15 lists entry events; §33 idempotency keys for publish. This plan produces the core CMS vertical slice: request → Hono route → `ContentService` → repository → Hyperdrive → Neon, plus outbox → queue.

## Scope

In scope:

- entries, entry versions, publications schema
- `ContentService` (`CONTENT_SERVICE`): create, update (new version), get, list (filters, pagination), delete
- publish/unpublish commands with idempotency keys and transactional events
- version history listing and restore
- entry references (entry→entry, entry→asset placeholder) and integrity rules
- public read API on the service for delivery (published/draft) used by plan 012
- end-to-end tests and content management vertical slice

Out of scope:

- GraphQL delivery (012), caching (013), assets storage (014), webhooks (015), releases/scheduling (016)
- concurrent editing/collaboration (§47 non-goal) — only optimistic concurrency via version numbers

## Dependencies

Depends on:

- [010 — Content Modeling](../010-content-modeling/_index.md)

## Architecture decisions

- **Versions are immutable** rows; the entry row holds pointers `current_draft_version_id` and `published_version_id` (via a publication record) (§22).
- **Optimistic concurrency**: updates carry `expectedVersion`; mismatch → `ConflictError` (no silent overwrite).
- **Publishing validates strictly** (010.004 `publish` mode) and checks reference integrity for published targets.
- **Events** through the outbox: `entry.created`, `entry.updated` (best-effort or transactional — decide in events table; recommendation: transactional for `entry.published/unpublished/deleted` because cache invalidation and webhooks depend on them).
- **Idempotency**: `POST /entries/:id/publish` and `/unpublish` accept `Idempotency-Key` (006.006).
- **Routes**: space-scoped list/create (`/api/v1/spaces/:spaceId/entries`) and entry-ID routes (`/api/v1/entries/:id`) exactly as §9 lists; entry-ID routes resolve tenant from the entry's stored `space_id` and then verify membership — never trusting the ID alone (§31).
- **Service is transport-agnostic** and is the only path for REST, GraphQL, Workflows, and imports (§2.4).

## Deliverables

- Entries/versions/publications migrations.
- `CONTENT_SERVICE` public token and `ContentService` interface (§7 example extended).
- REST: `GET/POST /api/v1/spaces/:spaceId/entries`, `GET/PATCH/DELETE /api/v1/entries/:id`, `POST /api/v1/entries/:id/publish`, `POST /api/v1/entries/:id/unpublish`, `GET /api/v1/entries/:id/versions`, `POST /api/v1/entries/:id/versions/:versionId/restore`.
- Vertical-slice end-to-end test with event delivery.

## Tasks

- [ ] [001 — Create entry, version, and publication schema](./001-entry-and-version-schema.md)
- [ ] [002 — Implement ContentService draft lifecycle](./002-content-service-draft-lifecycle.md)
- [ ] [003 — Implement entry management REST routes](./003-entry-management-routes.md)
- [ ] [004 — Implement publish and unpublish commands](./004-publish-and-unpublish-commands.md)
- [ ] [005 — Implement version history and restore](./005-version-history-and-restore.md)
- [ ] [006 — Implement entry references and link resolution](./006-references-and-link-resolution.md)
- [ ] [007 — Verify the content management vertical slice end to end](./007-content-vertical-slice-end-to-end.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Publish → `entry.published` delivered through the queue in the Workers-pool test.
- [ ] Isolation and authz matrices cover all entry routes.
- [ ] Architectural checkpoint CP5 (content vertical slice) recorded, including latency of create/publish on staging.

## Risks

- **Version table growth**: every save creates a version; add retention/compaction policy later (document as deferred); index by `(entry_id, created_at)`.
- **List queries on JSONB**: filters on field values need indexes; keep MVP filters limited (content type, updated range, simple field equality) per ADR 0010.
- **Entry-ID routes and tenancy**: must resolve space from the entry and still verify membership; covered by isolation tests.

## Open questions

- Should deleting an entry be soft (recoverable) or hard with a `entry.deleted` event? Default per ADR 0007 (hard delete + event), unless product needs a trash.
- Autosave frequency from the admin UI may create many versions — do we coalesce versions within a time window per user? Default: no coalescing in MVP; revisit with admin (019).

## Technical notes

No technical notes yet.
