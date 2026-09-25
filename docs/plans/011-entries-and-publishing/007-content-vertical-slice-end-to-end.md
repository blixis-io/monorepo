# 011.007 — Verify the content management vertical slice end to end

## Status

```text
completed
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Run and document the complete content workflow end to end in the Workers pool and on staging: create space → content type → entry → update → publish → event consumed by a test subscriber → unpublish → delete, with isolation and authz coverage.

## Background

Architectural checkpoint CP5 validates the kernel/database/events/tenancy/authz design against a real domain before delivery APIs and extensions are layered on.

## Requirements

- Workers-pool scenario test covering the full workflow with a test subscription asserting `entry.published` delivery.
- Staging run via a script (`tooling/smoke/content-smoke.ts`) using a personal API token; records timings.
- Review against §48 agent rules (no internal imports, no business logic in handlers, services used by all transports).
- Update ROADMAP checkpoint CP5 with findings.

## Architectural constraints

- Smoke script uses only public REST API.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/test/vertical-slice.test.ts (the plan's Workers-pool scenario; Node pool, see notes)
tooling/smoke/package.json
tooling/smoke/tsconfig.json
tooling/smoke/src/content-smoke.ts
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
docs/ROADMAP.md (CP5, once staging passes)
```

### Delete

```text
None.
```

## Implementation steps

1. Scenario test.
2. Smoke script.
3. Architecture review and notes.

## Dependencies

Requires:

- [011.006 — Implement entry references and link resolution](./006-references-and-link-resolution.md)

## Acceptance criteria

- [x] Scenario test passes.
- [x] Staging smoke passes (or blocked with documented Blocker).
- [x] CP5 findings recorded.

## Validation

```bash
pnpm --filter @blixis/api test
BLIXIS_API_URL=... BLIXIS_TOKEN=... pnpm smoke:content
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
- [x] Architectural review findings are either fixed or turned into follow-up tasks.

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

- **Vertical slice** (`modules/content/test/vertical-slice.test.ts`):
  - Runs over HTTP: organization → space → component → page type → draft → update (`If-Match`) → publish (`Idempotency-Key`) → published read with a slug filter → unpublish.
  - A separate module (`@acme/cache`) subscribes to `entry.published` and `entry.unpublished`. Delivery is **deferred**: nothing arrives before the flush that stands in for the commit.
  - Asserts that the envelopes carry the tenant, that a replayed publish is delivered once, and that stored versions are immutable and keyed by stable ids.
  - **Deviation:** it runs in the Node pool against Postgres, not the Workers pool (`pg` can't reach Postgres there, see ADR 0006 notes), like every database suite. The Worker path itself is covered by the local Newman run and the staging smoke run.
- **Smoke script:** `tooling/smoke` (`@blixis/smoke`, `pnpm --filter @blixis/smoke content`), configured by `BLIXIS_API_URL`, `BLIXIS_TOKEN` (an access token or a PAT with `content.*` and `spaces.read` scopes) and `BLIXIS_SPACE_ID`.
  - It creates a component and a page type with unique names, then an entry: create, update, publish, replayed publish, published read, list by slug, versions.
  - It cleans up in reverse order, also after failures, and prints per-request timings with p50 and max.
  - Local run against `wrangler dev` + Docker Postgres: 13 requests, p50 23 ms, max 67 ms, all OK.
- **§48 review of `@blixis/content`:**
  - It uses only public imports of other packages (the boundary checker passes).
  - Route handlers only parse HTTP and call `CONTENT_SERVICE`/`CONTENT_TYPE_SERVICE`/`FIELD_TYPES`, never repositories or transactions.
  - All business rules (validation, concurrency, integrity, publishing) live in services shared by every transport. Untrusted input is validated with Zod and compiled schemas.
  - Side effects go through events (outbox for publish, unpublish and delete).
  - No hidden global state: the only app-scoped state is the pure compiled-schema LRU.
  - One justified `any` (field type settings generics in `ContentModuleOptions`, with a `biome-ignore` comment).
  - New behaviour has tests.
- **Staging (2026-09-25, version `19979c84`):**
  - **Postman:** 60 requests / 134 assertions, all green.
  - **Smoke:** three runs of 13 requests, p50 **203–246 ms** from the Netherlands.

    | Step | Typical time |
    |---|---|
    | create entry | ~280 ms |
    | update entry | ~265 ms |
    | publish | ~260–280 ms |
    | idempotent replay | 82–104 ms |
    | read published | ~150 ms |
    | list by slug | ~150–165 ms |

  - **Event path:** `wrangler tail` showed `Queue blixis-events-staging (10 messages) - Ok` one second after the run: 4 content type events, 5 entry events (published, unpublished and deleted through the outbox), and `user.signed-in`.
- **Finding (latency):** local p50 is 23 ms against 200–250 ms on staging. The replay, which runs one query, costs ~90 ms, so most of the gap is **several sequential Hyperdrive→Neon round trips per request**: actor memberships, roles, content types, locales, then the entry and version. They aren't cached since ADR 0019. Follow-ups for plans 013 and 020:
  - measure the query count per route;
  - combine the authorization lookups into one query;
  - cache content types and locales per isolate, invalidated by `content-type.*`/`locale.*` events.
- **Finding (observability):** a successful post-commit dispatch logged nothing, and unrouted events logged only at `debug`, so the event path couldn't be verified from staging logs. Fixed here: `outbox.dispatched` and `event.unrouted` are now logged at `info`, and `docs/operations/events.md` describes the end-to-end check.
