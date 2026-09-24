# 001.006 — Configure the test runner for unit and Workers-runtime tests

## Status

```text
completed
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
vitest.config.ts
packages/shared/src/assert.test.ts
packages/shared/tsconfig.test.json
```

### Modify

```text
package.json
pnpm-workspace.yaml (catalog: vitest, @vitest/coverage-v8)
pnpm-lock.yaml
tsconfig.json (references shared test project)
packages/shared/package.json
docs/conventions/testing.md
docs/conventions/packages.md
docs/development/monorepo.md
docs/plans/**/*.md (validation commands: `pnpm test --filter X` → `pnpm --filter X test`)
docs/ROADMAP.md
docs/plans/001-project-foundation/_index.md
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

- [x] `pnpm test` runs and passes the `@blixis/shared` tests.
- [x] `pnpm test:coverage` produces a coverage report without errors.
- [x] `docs/conventions/testing.md` describes unit, module integration, API, and infrastructure test levels and their locations.
- [x] The opt-in procedure for Workers-pool tests is documented.

## Validation

```bash
pnpm test
pnpm test:coverage
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
- [x] Tests assert behavior, not implementation details.

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

- **Vitest 4.1.11** + `@vitest/coverage-v8` 4.1.11 via the catalog (Vitest 5 blocked by the Workers pool, ADR 0002). Root `vitest.config.ts` defines a single `node` project (`packages|modules|tooling/*/src/**/*.test.ts`, `modules/*/test/**`), excluding `*.worker.test.ts`. Workers projects are added per Worker package (first: `apps/api`, 004.005); the opt-in steps are documented in `docs/conventions/testing.md#how-it-is-wired`.
- **Root scripts:** `test` = `tsc -b && vitest run` (dist consumption, ADR 0001); `test:watch`; `test:coverage` = `tsc -b && vitest run --coverage` (v8; text/html/lcov into git-ignored `coverage/`). `@blixis/shared` coverage: 100%.
- **Type tests** run through `tsc`, not Vitest: `packages/shared/tsconfig.test.json` (extends `@blixis/tsconfig/test.json`) is referenced from the root solution. Verified that changing `expectTypeOf(value).toEqualTypeOf<string>()` to `<number>` fails `pnpm typecheck` with `TS2344`; test files do not appear in `dist/`.
- **Per-package runs:** packages get `"test": "vitest run --root ../.. <dir>/<name>"` so `pnpm --filter @blixis/shared test` uses the root config. `pnpm test --filter X` (as written in many task validation sections) would pass `--filter` to Vitest and fail, so all task files were normalized to `pnpm --filter X test` (72 occurrences).
- `vitest` is declared as a devDependency of `@blixis/shared` (explicit per package, not relying on root hoisting).
- No peer warnings with `autoInstallPeers: false` (`@vitest/browser` is an optional peer of the coverage package).
