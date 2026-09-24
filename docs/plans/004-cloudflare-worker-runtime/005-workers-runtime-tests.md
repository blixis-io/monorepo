# 004.005 — Add Workers-runtime integration tests for apps/api

## Status

```text
not-started
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Configure `@cloudflare/vitest-pool-workers` for `apps/api` and write integration tests executing the real Worker entry inside `workerd`: health route, error format, request/correlation IDs, env validation failure, scheduled/queue dispatch smoke tests.

## Background

§36 requires API tests against Hono and infrastructure tests; running inside `workerd` catches runtime incompatibilities that Node-based tests miss (global-scope I/O, Node APIs, streams). This suite becomes the home for later end-to-end API tests.

## Requirements

- Add Workers-pool Vitest config for `apps/api` using `wrangler.jsonc`.
- Tests via `SELF.fetch` or `exports.default.fetch` (per current pool API): health, 404 error format, `x-request-id` and `x-correlation-id` propagation.
- Test env validation failure with overridden bindings.
- Smoke tests invoking `scheduled` and `queue` handlers with fake inputs.
- Record cold-start/boot timing observations in Technical notes.

## Architectural constraints

- No network access to Cloudflare required.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/vitest.config.ts
apps/api/test/health.worker.test.ts
apps/api/test/entry.worker.test.ts
apps/api/test/env.d.ts
```

### Modify

```text
apps/api/package.json
vitest.config.ts (root workspace/projects list, if needed)
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Configure the pool (consult current Cloudflare docs).
2. Write tests.
3. Ensure `pnpm test` at root includes the suite and CI passes.

## Dependencies

Requires:

- [004.004 — Validate environment configuration at boot](./004-environment-configuration-validation.md)

## Acceptance criteria

- [ ] The suite runs inside `workerd` and passes locally and in CI.
- [ ] Tests assert header propagation and error format.

## Validation

```bash
pnpm --filter @blixis/api test
pnpm test
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
- [ ] Tests exercise the real Worker entry, not the Hono app directly.

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
