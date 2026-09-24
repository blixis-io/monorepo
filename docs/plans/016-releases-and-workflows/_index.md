# 016 — Releases & Cloudflare Workflows

## Status

```text
not-started
```

Milestone: Milestone 7 — Assets, integrations & durable processes  
Roadmap scope: Extended initial platform (post-MVP, still planned)  
Progress: 0/4 tasks completed

## Objective

Deliver the first durable multi-step process on Cloudflare Workflows — publishing a release (validate → publish items → invalidate caches → trigger webhooks → mark completed, §16) — using a reusable Workflows integration that other modules (bulk import/export, migrations) can adopt later without architectural changes.

## Why this plan exists

§16 prescribes Workflows for durable multi-step processes and gives "Publish release" as the canonical example; §21 includes Release in the domain model and §15 lists `release.created/published`. §41 lists `@blixis/releases` as a *later* module, so this plan is scheduled after the MVP core and is marked Extended — it must not block MVP readiness (plan 022).

## Scope

In scope:

- Workflows adapter in `@blixis/cloudflare` and a transport-neutral workflow contract
- module contribution pattern for workflows (explicit export from `apps/api/src/index.ts`)
- `modules/releases`: schema, service, routes, permissions, events
- publish-release Workflow with idempotent steps
- scheduled publishing of releases (and optionally single entries)

Out of scope:

- bulk import/export, localisation jobs, content migrations (future Workflow users; deferred)
- release conflict resolution UI (admin)

## Dependencies

Depends on:

- [013 — Delivery Caching & Invalidation](../013-delivery-caching/_index.md)
- [014 — Assets on R2](../014-assets/_index.md)
- [015 — Webhooks](../015-webhooks/_index.md)

## Architecture decisions

- **Workflows only for durable multi-step processes** (§16); CRUD stays synchronous.
- **Explicit Worker exports**: Workflow classes must be named exports of the Worker entry module; the composition root (`apps/api/src/index.ts`) re-exports module workflow classes explicitly (§2.3 explicit composition — no dynamic discovery).
- **Steps call services** (§2.4): each Workflow step runs inside a kernel scope (`runInScope`) with a `system` actor carrying the initiating actor ID in metadata.
- **Idempotent steps** (§33): step results are persisted by Workflows; publish operations use idempotency keys derived from `(releaseId, itemId)`.
- **Partial failure semantics** documented: a release publish is not a single DB transaction across all items; the Workflow tracks per-item status and can resume.

## Deliverables

- ADR 0014 (Workflows integration pattern) accepted.
- `modules/releases` registered; `PUBLISH_RELEASE` Workflow binding configured.
- REST: `GET/POST /api/v1/spaces/:spaceId/releases`, `GET/PATCH/DELETE /api/v1/releases/:id`, `POST/DELETE /api/v1/releases/:id/items`, `POST /api/v1/releases/:id/publish`, `POST /api/v1/releases/:id/schedule`.
- Scheduled publishing via Workflow `step.sleepUntil` or cron (ADR).

## Tasks

- [ ] [001 — Define the Workflows integration pattern and adapter](./001-workflows-integration-pattern.md)
- [ ] [002 — Create the releases module](./002-releases-module.md)
- [ ] [003 — Implement the publish-release Workflow](./003-publish-release-workflow.md)
- [ ] [004 — Implement scheduled release publishing](./004-scheduled-publishing.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Workers-pool/integration test: release with 3 entries publishes all, emits one `release.published`, survives an injected step failure with retry and no duplicate publishes.

## Risks

- **Workflows local testing** support in vitest-pool-workers may be limited; plan for integration tests on staging.
- **Long-running releases** with many items — batch steps to stay within step limits.
- **Kernel boot inside Workflow instances**: each run executes in the Worker isolate; kernel lazy boot applies — confirm behaviour.

## Open questions

- Should releases be atomic ("all or nothing" visible at once) for delivery? True atomicity would require publishing via a single DB transaction or a release-scoped version stamp for delivery caches. Default: per-item publish with cache stamp bump at the end (near-atomic for cached delivery); document.
- Scheduling granularity: Workflow `sleepUntil` per scheduled release vs. minute cron scanning due releases? (ADR 0014.)

## Technical notes

No technical notes yet.
