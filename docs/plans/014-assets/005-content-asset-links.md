# 014.005 — Validate asset links from content via capability

## Status

```text
not-started
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Complete content's asset link support: validate that linked assets exist in the same space (and are published when the entry is published) through `ASSET_SERVICE` when the `blixis.assets` capability is present, and resolve asset links in delivery.

## Background

§8 capabilities avoid package-name coupling; 010.003 created the asset field type; 011.006 stores asset references.

## Requirements

- `@blixis/content` optionally resolves `ASSET_SERVICE` (`getOptional`) — if assets capability absent, asset fields are rejected at content-type creation with a clear error.
- Draft validation: asset exists in same space (or allow dangling per ADR 0010).
- Publish validation: linked assets must be published.
- Delivery: resolve asset links via batched loader.
- Tests with and without assets module registered.

## Architectural constraints

- No import from `@blixis/assets` internals; use its public token/types (or contracts port).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/test/asset-links.test.ts
```

### Modify

```text
modules/content/src/domain/field-types/asset.ts
modules/content/src/application/publishing.ts
modules/content/src/application/links.ts
modules/content/src/graphql/resolvers.ts
modules/content/src/module.ts
modules/content/package.json
```

### Delete

```text
None.
```

## Implementation steps

1. Optional capability resolution.
2. Validation rules.
3. Delivery resolution.
4. Tests (both configurations).

## Dependencies

Requires:

- [014.004 — Serve published assets](./004-asset-delivery.md)

## Acceptance criteria

- [ ] Entry cannot be published while linking an unpublished asset.
- [ ] Content module boots without assets module (asset field type disabled).

## Validation

```bash
pnpm --filter @blixis/content test
pnpm --filter @blixis/api test
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
- [ ] Capability-based coupling verified (no package import of assets internals).

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
