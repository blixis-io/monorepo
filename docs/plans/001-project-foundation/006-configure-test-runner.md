# 001.006 — Configure the test runner for unit and Workers-runtime tests

## Status

```text
not-started
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Set up the test runner chosen in ADR 0002 so that `pnpm test` runs pure unit tests in every package and is ready to run Workers-runtime tests (via `@cloudflare/vitest-pool-workers`) in packages that opt in, with coverage reporting available.

## Background

§36 requires unit tests without Cloudflare network access, module integration tests with a test kernel, API tests against Hono, and separate infrastructure tests. This task establishes only the runner and conventions; test utilities (`@blixis/testing`) arrive in plan 003 and database test support in plan 005.

## Requirements

- Install the test runner at the root (e.g. Vitest) and configure a workspace/projects file so each package is its own project.
- Establish naming: `*.test.ts` for unit tests (Node pool), `*.worker.test.ts` or a per-package config for Workers-pool tests (exact convention per ADR 0002).
- Add `test` scripts to `@blixis/shared` and write unit tests for `assertNever` and `invariant`.
- Add `pnpm test` (all), `pnpm test:watch`, and `pnpm test:coverage` root scripts.
- Do not add Workers-pool configuration to any package yet unless ADR 0002 requires a root-level setup; document how a package opts in (plan 004 is the first user).
- Update `docs/conventions/testing.md` (already written as the target design) so file naming, commands, and runner configuration match the actual implementation.

## Architectural constraints

- Unit tests must not require network access or Cloudflare credentials.
- Type checking is not delegated to the test runner; `pnpm typecheck` remains authoritative.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
vitest.config.ts (or vitest.workspace.ts — per ADR 0002)
packages/shared/src/assert.test.ts
```

### Modify

```text
docs/conventions/testing.md
package.json
packages/shared/package.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Install the runner and create the root config.
2. Add package-level `test` script to `@blixis/shared`.
3. Write tests for `assertNever` (exhaustiveness at type level documented; runtime throw) and `invariant` (throws with message; narrows type).
4. Add root scripts and coverage configuration.
5. Update `docs/conventions/testing.md` to match the implementation.
6. Run `pnpm test` and `pnpm test:coverage`.

## Dependencies

Requires:

- [001.004 — Define package conventions and create @blixis/shared](./004-define-package-conventions.md)

## Acceptance criteria

- [ ] `pnpm test` runs and passes the `@blixis/shared` tests.
- [ ] `pnpm test:coverage` produces a coverage report without errors.
- [ ] `docs/conventions/testing.md` describes unit, module integration, API, and infrastructure test levels and their locations.
- [ ] The opt-in procedure for Workers-pool tests is documented.

## Validation

```bash
pnpm test
pnpm test:coverage
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
- [ ] Tests assert behavior, not implementation details.

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
