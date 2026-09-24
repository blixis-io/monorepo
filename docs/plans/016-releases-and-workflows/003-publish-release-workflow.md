# 016.003 — Implement the publish-release Workflow

## Status

```text
not-started
```

## Parent plan

[016 — Releases & Cloudflare Workflows](./_index.md)

## Objective

Implement the publish-release Workflow per §16: validate release → publish items (batched steps) → bump delivery cache stamp → emit `release.published` (webhooks follow from events) → mark completed; with idempotent steps and resumable failure handling.

## Background

§16 lists the exact steps; §33 retries; 013 cache stamps; 015 webhooks consume events.

## Requirements

- `POST /api/v1/releases/:id/publish` validates and starts the Workflow (instance ID = release ID + attempt) and returns 202 with status URL.
- Steps: `validate` (strict validation of all items, abort with per-item errors), `publish-batch-N` (calls `CONTENT_SERVICE.publish` with idempotency key `release:<id>:<item>`), `invalidate` (cache stamp bump), `finalize` (status `published`, emit `release.published` transactionally).
- Failure: per-item errors recorded; status `failed` with resume endpoint `POST /api/v1/releases/:id/publish` (resumes remaining items).
- `GET /api/v1/releases/:id` shows progress.
- Tests: success, injected failure + retry (no duplicate publish), validation failure.

## Architectural constraints

- Steps must not hold DB connections across steps (each step gets a fresh scope).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/releases/src/workflows/publish-release.ts
modules/releases/test/publish-release.test.ts
```

### Modify

```text
modules/releases/src/module.ts
modules/releases/src/application/release.service.ts
modules/releases/src/rest/routes.ts
modules/releases/src/events.ts
apps/api/src/index.ts (explicit Workflow class export)
apps/api/wrangler.jsonc (workflows binding)
apps/api/src/env.ts
docs/contracts/events.md
docs/operations/cloudflare.md
```

### Delete

```text
None.
```

## Implementation steps

1. Workflow definition and steps.
2. Command route and status.
3. Explicit export and binding.
4. Tests (local or staging).

## Dependencies

Requires:

- [016.002 — Create the releases module](./002-releases-module.md)

## Acceptance criteria

- [ ] Release with 3 entries publishes all with one `release.published`.
- [ ] Injected failure then retry → each entry published once.

## Validation

```bash
pnpm --filter @blixis/releases test
pnpm --filter @blixis/api deploy:dry
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
- [ ] Partial-failure semantics documented for API users.

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
