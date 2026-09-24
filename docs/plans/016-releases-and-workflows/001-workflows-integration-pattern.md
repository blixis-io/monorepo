# 016.001 — Define the Workflows integration pattern and adapter

## Status

```text
not-started
```

## Parent plan

[016 — Releases & Cloudflare Workflows](./_index.md)

## Objective

Record ADR 0014 and implement a Workflows adapter so modules can define workflows as plain step functions calling services, while `@blixis/cloudflare` provides the `WorkflowEntrypoint` wrapper and `apps/api` exports them explicitly.

## Background

§16 Workflows; §4 Workflow adapters in `@blixis/cloudflare`; Workflows require exported classes and bindings in `wrangler.jsonc`.

## Requirements

- ADR 0014: contribution shape (`workflows?: readonly WorkflowDefinition[]` on modules vs. kernel-level registry), binding naming, how `WorkflowEntrypoint` classes are generated (`createWorkflowClass(app, definition)`), how steps get a kernel scope, how instances are started from services (`WORKFLOW_LAUNCHER` port), scheduling approach, local testing approach.
- Contracts: `WorkflowDefinition` (name, `run(event, step, ctx)` with a Blixis `StepApi` subset: `do`, `sleep`, `sleepUntil`), `WorkflowLauncher` port (`start(name, params, { id })`, `status(id)`).
- `@blixis/cloudflare`: `createWorkflowClass`, `CloudflareWorkflowLauncher` using bindings.
- Kernel: collect workflow contributions (if module contract extended).
- Fixture workflow with a test (local simulation or documented staging test).

## Architectural constraints

- Workflow params and step outputs must be JSON-serialisable and small.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0014-workflows-integration.md
packages/contracts/src/workflows.ts
packages/cloudflare/src/workflows.ts
packages/cloudflare/src/workflows.test.ts
```

### Modify

```text
packages/contracts/src/index.ts
packages/contracts/src/module.ts
packages/kernel/src/internal/contributions.ts
packages/cloudflare/src/index.ts
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0014 (consult current Workflows docs).
2. Contracts.
3. Adapter and launcher.
4. Fixture test.

## Dependencies

Requires:

- [013.005 — Review cache correctness and document operations](../013-delivery-caching/005-cache-correctness-review.md)
- [014.006 — Implement idempotent asset deletion and orphan cleanup](../014-assets/006-asset-deletion-and-cleanup.md)
- [015.005 — Verify webhooks end to end](../015-webhooks/005-webhooks-end-to-end.md)

## Acceptance criteria

- [ ] ADR accepted.
- [ ] Fixture workflow executes steps with a kernel scope (test or staging evidence).

## Validation

```bash
pnpm test --filter @blixis/cloudflare --filter @blixis/contracts
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
- [ ] Contract additions are minimal and additive.

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
