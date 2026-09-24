# 004.001 — Scaffold @blixis/cloudflare with binding types and env validation

## Status

```text
not-started
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
packages/cloudflare/src/index.ts
packages/cloudflare/src/env.ts
packages/cloudflare/src/execution-context.ts
packages/cloudflare/src/env.test.ts
```

### Modify

```text
tooling/tsconfig/worker.json
tsconfig.json
tooling/boundaries/ (or lint config — forbid modules/* → @blixis/cloudflare)
pnpm-lock.yaml
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

- [ ] `parseEnv` error for a missing secret names the key and does not print any env values.
- [ ] A module package importing `@blixis/cloudflare` fails `pnpm lint`.

## Validation

```bash
pnpm test --filter @blixis/cloudflare
pnpm lint
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
- [ ] Types approach consistent with `wrangler types` output (checked in 004.002).

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
