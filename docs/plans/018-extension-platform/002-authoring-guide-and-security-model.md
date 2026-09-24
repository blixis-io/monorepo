# 018.002 — Write the module authoring guide and security model

## Status

```text
not-started
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Document how to build, test, version, and publish a Blixis module, and the security model for build-time modules.

## Background

§25 third-party package rules; §39 security boundaries; §48 agent instructions; §49 questions before architectural changes.

## Requirements

- `docs/extensions/authoring-guide.md`: package setup (peer deps), `defineModule` factory with typed options and `configSchema`, services/tokens, capabilities, REST routes with `BlixisHonoEnv`, GraphQL contributions, permissions with default roles, events (definitions, delivery classes, idempotent handlers), migrations (ownership, naming, expand/contract), tenancy helpers, testing with `@blixis/testing`, versioning/semver rules, forbidden patterns.
- `docs/extensions/security-model.md`: trusted code statement (§39), what a module can access, review checklist for installing third-party modules, future isolation roadmap (Phase 2/3).
- Link both from README and `docs/contracts/README.md`.

## Architectural constraints

- Examples must compile (extracted into the example plugin in 018.003).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/extensions/authoring-guide.md
docs/extensions/security-model.md
```

### Modify

```text
README.md
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write guide.
2. Write security model.
3. Cross-link.

## Dependencies

Requires:

- [018.001 — Relocate public content capability contracts](./001-public-content-capability-contracts.md)

## Acceptance criteria

- [ ] Every public extension point has a documented example.
- [ ] Security model explicitly says npm modules are not sandboxed.

## Validation

- Docs review; examples verified by 018.003.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Guide reflects actual APIs (no aspirational features).

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
