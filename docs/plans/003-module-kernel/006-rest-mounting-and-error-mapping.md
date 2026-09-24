# 003.006 — Mount module REST apps with request context and error mapping

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Mount module `rest` contributions under `/api/v1`, add kernel middleware that creates the request context and request service scope, map `BlixisError`s to HTTP responses, and detect route conflicts.

## Background

§9 prescribes Hono sub-apps mounted by the kernel and `/api/v1` grouping; §28 requires transports to map errors to protocol responses; §35 requires request and correlation IDs. REST handlers must obtain services from context (`c.var`) rather than importing implementations (§2.5).

## Requirements

- Define `BlixisHonoEnv` (Hono `Variables`: `requestContext`, `services` (request scope), `actor`; `Bindings` left generic so plan 004 can supply Cloudflare bindings).
- Middleware order: request ID (use incoming `x-request-id` only if trusted-config allows, else generate), correlation ID (`x-correlation-id` accepted, else = request ID), request scope creation, actor resolution via `actorResolver` option, lazy boot await.
- Mount each `rest` contribution at `/api/v1${path}`.
- Conflict detection: after mounting, enumerate registered routes (`app.routes`) and fail bootstrap on identical method+path registered by different modules, naming both.
- Error handler: `BlixisError` → status per `docs/contracts/errors.md`; body format decided here (recommendation: RFC 9457 problem details `{ type, title, status, code, detail, errors? }` with `application/problem+json`); `ValidationError` includes normalised issues; unknown errors → 500 `INTERNAL` with no internal message; always include `requestId`.
- 404 handler returns the same error format.
- Response headers: `x-request-id`, `x-correlation-id`.
- Dispose request scope after response (return promise for `waitUntil` in plan 004).
- Kernel-provided liveness route `GET /api/v1/health` returning `{ status: 'ok' }` (no I/O). Readiness checks are added by plan 005.
- Tests with `app.request()`: routing, conflicts, each error mapping, header propagation, 404 format.

## Architectural constraints

- No business logic in the kernel's handlers (§48 Code.8).
- Do not throw `HTTPException` from services; only the error handler converts errors.
- Never echo untrusted headers into logs without sanitising length.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/internal/rest.ts
packages/kernel/src/internal/rest.test.ts
packages/kernel/src/internal/errors-http.ts
packages/kernel/src/internal/errors-http.test.ts
packages/kernel/src/hono-env.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
docs/kernel/README.md
docs/contracts/errors.md
```

### Delete

```text
None.
```

## Implementation steps

1. Define `BlixisHonoEnv` and export it for module authors.
2. Implement context/scope middleware and actor resolution hook.
3. Implement mounting and route-conflict detection.
4. Implement error and not-found handlers with the chosen format.
5. Implement health route.
6. Tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface BlixisVariables {
  requestContext: RequestContext
  services: ServiceRegistry
}
export type BlixisHonoEnv<TBindings = unknown> = {
  Bindings: TBindings
  Variables: BlixisVariables
}
```

## Dependencies

Requires:

- [003.004 — Implement the setup/boot lifecycle and createBlixis](./004-lifecycle-and-create-blixis.md)

## Acceptance criteria

- [ ] A fixture module's route is reachable at `/api/v1/<path>`.
- [ ] Two fixture modules registering `GET /api/v1/spaces/:id` fail bootstrap naming both modules.
- [ ] Each `ErrorCode` maps to the documented status in tests.
- [ ] 500 responses never include the thrown error's message.
- [ ] `GET /api/v1/health` returns 200 without booting I/O-dependent services.

## Validation

```bash
pnpm --filter @blixis/kernel test
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
- [ ] Error body format documented in `docs/contracts/errors.md` and stable.

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
