# 003.008 — Create @blixis/testing with createTestBlixis

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Create `@blixis/testing` providing `createTestBlixis` (§36), a capturing test logger, fake actor helpers, request helpers, and service overrides, and prove the kernel end-to-end with fixture modules including an "external-style" module.

## Background

§36 names `createTestBlixis` from `@blixis/testing` for module integration tests. Later plans extend this package with database (plan 005) and event bus (plan 006) helpers, so its structure should allow additive helpers without the core helper depending on infrastructure.

## Requirements

- Create `packages/testing` (`@blixis/testing`), depending on kernel and contracts; mark as dev-only in conventions (never a runtime dependency of modules).
- `createTestBlixis({ modules, overrides?, actor?, logger? })` returns the `BlixisApp` plus helpers: `request(path, init)` (Hono `app.request` wrapper), `services`, `logs` (captured entries).
- `overrides`: replace service providers by token before setup completes (for fakes).
- Actor helpers: `asUser(id)`, `asAnonymous()`, `asSystem(name)` producing `Actor` values and a test actor resolver.
- End-to-end kernel test suite in `packages/kernel/test/` using fixtures:
  - `fixture-greeting` provides `GREETING_SERVICE`;
  - `fixture-external` (defined like a third-party package: contracts + `defineModule` only) requires capability `fixture.greeting`, consumes the service in a REST route;
  - negative fixtures for each §26 failure.

## Architectural constraints

- `@blixis/testing` must not be imported by any non-test source file (boundary check rule: allowed only from `*.test.ts` / test directories) — add this rule to the boundary checker.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/testing/package.json
packages/testing/tsconfig.json
packages/testing/src/index.ts
packages/testing/src/create-test-blixis.ts
packages/testing/src/actors.ts
packages/testing/src/logger.ts
packages/testing/src/create-test-blixis.test.ts
packages/kernel/test/fixtures/
packages/kernel/test/kernel.e2e.test.ts
```

### Modify

```text
tsconfig.json
docs/conventions/testing.md
docs/conventions/packages.md
tooling/boundaries/ (or lint config — rule restricting @blixis/testing imports)
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold `@blixis/testing`.
2. Implement `createTestBlixis`, overrides, actor helpers, capturing logger.
3. Add the boundary rule for test-only usage.
4. Write fixture modules and the end-to-end kernel suite.
5. Document usage in testing conventions.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export async function createTestBlixis(options: {
  modules: readonly BlixisModule[]
  overrides?: readonly ServiceOverride[]
  actor?: Actor
}): Promise<TestBlixis>
```

## Dependencies

Requires:

- [003.005 — Validate module configuration](./005-module-configuration-validation.md)
- [003.006 — Mount module REST apps with request context and error mapping](./006-rest-mounting-and-error-mapping.md)
- [003.007 — Collect event, GraphQL, permission, and migration contributions](./007-contribution-registries.md)

## Acceptance criteria

- [ ] `fixture-external` boots and serves its route using the service from `fixture-greeting` via capability.
- [ ] Importing `@blixis/testing` from a non-test file fails `pnpm lint`.
- [ ] All §26 failure fixtures produce module-named errors.

## Validation

```bash
pnpm test
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
- [ ] Architectural checkpoint CP1 evidence recorded in the plan Technical notes (external-style module works with public API only).

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
