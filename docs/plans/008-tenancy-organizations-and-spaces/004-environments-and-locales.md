# 008.004 — Implement environment and locale management

## Status

```text
not-started
```

## Parent plan

[008 — Tenancy: Organizations, Spaces & Memberships](./_index.md)

## Objective

Expose read access to the default environment and full CRUD for space locales, including default-locale switching and fallback chains, with validation that prevents invalid states.

## Background

§21 includes Environment and Locale under Space. MVP supports only the default environment (see plan decisions); locales are needed by content storage (plan 010).

## Requirements

- `EnvironmentService.getDefault(spaceId)`, `list(spaceId)`; no create/clone in MVP (return 501 or omit routes — omit; document deferred).
- `LocaleService`: list/create/update/delete; exactly one default; fallback must reference an existing locale and not form a cycle; deleting default or a fallback target is rejected with `ConflictError`.
- Routes: `GET /api/v1/spaces/:spaceId/environments`, `GET/POST /api/v1/spaces/:spaceId/locales`, `PATCH/DELETE /api/v1/spaces/:spaceId/locales/:localeId`.
- Events: `locale.created/updated/deleted` (best-effort) — content may subscribe later.
- Export `LOCALE_SERVICE`/`ENVIRONMENT_SERVICE` tokens for content module use.

## Architectural constraints

- Locale codes validated as BCP 47.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/spaces/src/application/environment.service.ts
modules/spaces/src/application/locale.service.ts
modules/spaces/test/locale.service.test.ts
```

### Modify

```text
modules/spaces/src/rest/routes.ts
modules/spaces/src/module.ts
modules/spaces/src/index.ts
modules/spaces/src/events.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement services with invariants.
2. Routes and events.
3. Tests for cycle detection and default switching.

## Dependencies

Requires:

- [008.003 — Implement organization/space services and management routes](./003-space-service-and-management-routes.md)

## Acceptance criteria

- [ ] Switching default locale is atomic (old default unset, new set).
- [ ] Fallback cycles are rejected with `VALIDATION_FAILED`.

## Validation

```bash
pnpm test --filter @blixis/spaces
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
- [ ] Deferred environment features documented in the plan Technical notes and ROADMAP deferred list.

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
