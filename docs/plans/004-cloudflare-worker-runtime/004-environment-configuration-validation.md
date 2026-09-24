# 004.004 — Validate environment configuration at boot

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Validate `apps/api` environment variables and secrets during lazy boot using the env schema, fail with clear redacted errors, and provide the validated config to modules through a service token.

## Background

§29 lists environment configuration as untrusted input. Env is only available per invocation on Workers, so validation happens on the first invocation (memoised per isolate, re-validated if env identity changes in tests).

## Requirements

- Validate env on first invocation inside the adapter/kernel boot path.
- Expose validated platform config via `PLATFORM_CONFIG` service token (defined in contracts if modules need it; otherwise kernel/cloudflare-level) — decide and document.
- Failure returns 500 with `INFRASTRUCTURE_ERROR` publicly and logs the list of invalid keys (never values).
- Document every variable in `docs/operations/configuration.md` (name, required/optional, environments, secret or var, description). Keep this document updated by all later plans.

## Architectural constraints

- Never log secret values or full connection strings (§35).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/operations/configuration.md
```

### Modify

```text
packages/cloudflare/src/worker-handler.ts (envSchema option)
packages/cloudflare/src/worker-handler.test.ts
packages/cloudflare/src/index.ts
packages/kernel/src/create-blixis.ts (app.logger)
apps/api/src/index.ts
apps/api/src/env.ts
apps/api/.dev.vars.example
docs/ROADMAP.md
docs/plans/004-cloudflare-worker-runtime/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Wire env validation into first invocation.
2. Add the config token.
3. Tests for missing/invalid vars (Workers pool in 004.005 covers runtime).
4. Write configuration documentation.

## Dependencies

Requires:

- [004.003 — Implement the Worker entry adapter for fetch, queue, and scheduled](./003-worker-entry-adapter.md)

## Acceptance criteria

- [x] Missing `BLIXIS_ENV` yields a logged error naming the key and a 500 response without internal details.
- [x] `docs/operations/configuration.md` lists all current variables.

## Validation

```bash
pnpm --filter @blixis/cloudflare test
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
- [x] Redaction verified by test.

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

- Validation lives in `createWorkerHandler(app, { envSchema })` (`@blixis/cloudflare`), not in the kernel — the kernel stays platform-neutral. `apps/api` passes `apiEnvSchema`.
- Validated once per `env` object (a `WeakMap`), i.e. once per isolate in practice; a different `env` object is re-validated.
- On failure: `fetch` → 500 problem details with generic `INFRASTRUCTURE_ERROR` (no key names in the response); `queue` → `retryAll()` then reject; `scheduled` → reject. The app logger records `invalid Worker environment` with the offending keys and problems, never values (test with a secret-looking value). Liveness (`/api/v1/health`) also fails when the environment is invalid — intentional: a misconfigured deployment should look unhealthy.
- **`PLATFORM_CONFIG` token not added:** modules must not read platform configuration, and platform packages already get the raw bindings via `ServiceResolutionContext.bindings` (004.003). Revisit if a platform service needs parsed config.
- `BlixisApp.logger` added (additive) so runtime adapters can log with the platform logger. Applying `LOG_LEVEL` to the logger is deferred to 020.001 (the logger is created before `env` is known).
- `docs/operations/configuration.md` created: validation flow and the variable table; the definition of done for config changes is stated at the top.
