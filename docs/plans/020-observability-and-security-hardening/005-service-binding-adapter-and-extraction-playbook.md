# 020.005 — Add the Service Binding adapter and Worker extraction playbook

## Status

```text
not-started
```

## Parent plan

[020 — Observability & Security Hardening](./_index.md)

## Objective

Provide a typed Service Binding adapter (RPC via `WorkerEntrypoint` or fetch-based) behind a service token so a module's service could later be served by another Worker without changing callers, and document when and how to extract a Worker — without splitting anything now.

## Background

§18 Service Bindings for internal communication; §46 modular monolith first, extract only with concrete reasons; §45 Management/Delivery may split later.

## Requirements

- `@blixis/cloudflare`: `createServiceBindingProxy<T>(binding, token)` producing an implementation of a service interface via RPC; serialisation constraints documented.
- Test with an auxiliary Worker in the Workers pool (fixture service).
- `docs/architecture/worker-extraction.md`: criteria (§46 list), steps (new Worker package, binding config, proxy registration in composition root, tenancy/auth context propagation, observability), and example (Delivery Worker split per §45).

## Architectural constraints

- No production Worker is split in this task.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/cloudflare/src/service-binding.ts
packages/cloudflare/src/service-binding.test.ts
docs/architecture/worker-extraction.md
```

### Modify

```text
packages/cloudflare/src/index.ts
apps/api/vitest.config.ts (auxiliary worker)
```

### Delete

```text
None.
```

## Implementation steps

1. Adapter.
2. Auxiliary-worker test.
3. Playbook.

## Dependencies

Requires:

- [020.004 — Perform the platform security review and fixes](./004-security-review.md)

## Acceptance criteria

- [ ] Fixture service called through the proxy in tests with identical results to in-process calls.
- [ ] Playbook reviewed against §18/§45/§46.

## Validation

```bash
pnpm --filter @blixis/cloudflare test
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
- [ ] Request context (actor, tenant, correlation) propagation across the binding is explicit.

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
