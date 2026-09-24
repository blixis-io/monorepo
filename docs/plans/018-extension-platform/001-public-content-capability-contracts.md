# 018.001 — Relocate public content capability contracts

## Status

```text
not-started
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Record ADR 0016 and move the public, consumer-facing content types and service tokens (`CONTENT_SERVICE`, `ContentService`, `Entry`, `ContentType`, content event definitions) into the chosen public package so third-party modules depend on capabilities, not on the `@blixis/content` implementation package.

## Background

§44 future improvement; §8 capabilities over package names; §25 plugins primarily depend on contracts.

## Requirements

- ADR 0016 decides location (recommendation: `packages/content-api` → `@blixis/content-api`, types/tokens/event definitions only, zero runtime deps beyond contracts).
- Move definitions; `@blixis/content` re-exports for compatibility and implements them.
- Apply the same pattern where assets are concerned (`ASSET_SERVICE` public types) if the example plugin needs them — keep minimal.
- Update module docs and boundary rules (plugins may import `@blixis/content-api`, not `@blixis/content`).

## Architectural constraints

- No behavioural change; tests must remain green.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0016-public-capability-contracts.md
packages/content-api/package.json
packages/content-api/tsconfig.json
packages/content-api/src/index.ts
```

### Modify

```text
modules/content/src/index.ts
modules/content/src/application/content.service.ts
modules/content/src/events.ts
modules/content/package.json
modules/releases/package.json (only if plan 016 is already implemented)
modules/webhooks/package.json (if it imports content events)
tsconfig.json
docs/contracts/README.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0016.
2. Create package; move definitions.
3. Update consumers to import from the public package.
4. Run full test suite.

## Dependencies

Requires:

- [017.004 — Build the Astro example site](../017-sdk-and-example-consumer/004-example-astro-site.md)

## Acceptance criteria

- [ ] First-party consumers (webhooks, releases) import content tokens/events from the public package only.
- [ ] Full test suite green.

## Validation

```bash
pnpm typecheck && pnpm lint && pnpm test
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
- [ ] Public package contains no implementation code.

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
