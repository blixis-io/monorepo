# 004.001 — Scaffold @blixis/cloudflare with binding types and env validation

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Create `@blixis/cloudflare` containing the `CloudflareEnv` binding contract (§19), a runtime env validation helper, and small utilities for `ExecutionContext` handling.

## Background

§4 assigns binding types and Cloudflare adapters to `@blixis/cloudflare`; §19 shows the target env shape; §29 requires validating environment configuration. Bindings will be added incrementally (Hyperdrive in 005, Queue in 006, KV in 013, R2 in 014); this task establishes the pattern.

## Requirements

- Create `packages/cloudflare` with Workers types per ADR 0001/0002 (e.g. generated runtime types or `@cloudflare/workers-types`), extending `tooling/tsconfig/worker.json`.
- Define `CloudflareEnvBase` (vars shared by all environments: `BLIXIS_ENV` = `local|staging|production`, `LOG_LEVEL`) and document the pattern for adding bindings per plan.
- Implement `defineEnvSchema` / `parseEnv(env, schema)` using the contracts `validate` helper; errors list missing/invalid keys but never values.
- Implement `waitUntilSafe(ctx, promise, logger)` that attaches error logging to background promises (no floating promises).
- Update `tooling/tsconfig/worker.json` with Workers types.
- Unit tests for env parsing and redaction.

## Architectural constraints

- This package may depend on Cloudflare types; domain modules must never depend on it (add boundary rule: `modules/*` cannot depend on `@blixis/cloudflare`).
- No Node built-ins.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/cloudflare/package.json
packages/cloudflare/tsconfig.json
packages/cloudflare/tsconfig.test.json
packages/cloudflare/src/index.ts
packages/cloudflare/src/env.ts
packages/cloudflare/src/execution-context.ts
packages/cloudflare/src/env.test.ts
```

### Modify

```text
tsconfig.json
pnpm-workspace.yaml (catalog: @cloudflare/workers-types; minimumReleaseAgeExclude)
pnpm-lock.yaml
docs/ROADMAP.md
docs/plans/004-cloudflare-worker-runtime/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold the package with Workers types.
2. Implement env schema helpers with redacted errors.
3. Implement `waitUntilSafe`.
4. Add the boundary rule and verify it.
5. Tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface CloudflareEnvBase {
  readonly BLIXIS_ENV: 'local' | 'staging' | 'production'
  readonly LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
}
export function parseEnv<S extends StandardSchemaV1>(env: unknown, schema: S): StandardSchemaV1.InferOutput<S>
```

## Dependencies

Requires:

- [003.008 — Create @blixis/testing with createTestBlixis](../003-module-kernel/008-testing-package-create-test-blixis.md)

## Acceptance criteria

- [x] `parseEnv` error for a missing secret names the key and does not print any env values.
- [x] A module package importing `@blixis/cloudflare` fails `pnpm lint`.

## Validation

```bash
pnpm --filter @blixis/cloudflare test
pnpm lint
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
- [x] Types approach consistent with `wrangler types` output (checked in 004.002).

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

- **Types:** the library compiles with `@cloudflare/workers-types` 5.20260924.1 (`types` in its tsconfig; also a peer dependency). `tooling/tsconfig/worker.json` was **not** changed: Worker apps get their types from `wrangler types` (004.002), which is the recommended source for app bindings; the library can't use generated types because it has no wrangler config. pnpm added the just-published workers-types version to `minimumReleaseAgeExclude`.
- `CloudflareEnvBase` (`BLIXIS_ENV`: `local | preview | staging | production`, optional `LOG_LEVEL`) and `BlixisEnvironment`; bindings are added per plan (documented in the TSDoc).
- `parseEnv(env, schema)` uses the synchronous `validateSync` (env validation happens once per isolate on first invocation) and throws a **non-exposed** `InfrastructureError` listing keys and problems — values never appear (test with a secret-looking value); `details.keys` lists offending keys for logs. `defineEnvSchema` is an identity helper.
- `waitUntilSafe(ctx, promise, logger, label)` wraps background promises with error logging; only needs `{ waitUntil }` (structural `WaitUntilContext`).
- Boundary rule `modules/*` → `@blixis/cloudflare` already exists in `tooling/boundaries` (003/001.005, unit-tested); no module packages exist yet to exercise it for real.
- **Docs:** not added to the developer manual/API reference — module authors must not use this package (architecture §4); it is platform-internal. Operator docs (`docs/operations/cloudflare.md`) are updated when bindings are added.
