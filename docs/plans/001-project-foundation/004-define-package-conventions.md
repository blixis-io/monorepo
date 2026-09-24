# 001.004 — Define package conventions and create @blixis/shared

## Status

```text
completed
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Document the canonical shape of a Blixis package and prove it by creating `@blixis/shared`, a small utilities package that builds, type-checks, and is consumable by other workspace packages only through its public `exports`.

## Background

§24 requires package `exports` to enforce boundaries; §23 describes module layout; §48 lists package rules. A written convention plus one real package gives every later task a template to copy. `@blixis/shared` appears in the monorepo layout (§3) as a general-purpose package; it must stay tiny and free of domain logic so it never becomes a dumping ground.

## Requirements

- Write `docs/conventions/packages.md` covering:
  - directory choice: `packages/` (platform), `modules/` (domain modules), `apps/` (deployables), `tooling/` (dev config);
  - `package.json` fields: `name`, `version`, `private` policy, `type: module`, `exports` (root only unless documented), `files`, `sideEffects: false`, `scripts` (`build`, `typecheck`, `test`, `lint`);
  - `dependencies` vs `peerDependencies` rules (§25: modules peer-depend on `@blixis/contracts`);
  - tsconfig extension pattern (`library.json` or `worker.json`);
  - src layout (`src/index.ts` as the only public entry);
  - test file placement and naming;
  - forbidden patterns: deep imports, relative cross-package imports, default-exported god objects.
- Create `packages/shared` as `@blixis/shared` with:
  - a minimal, justified utility surface (e.g. `assertNever`, `invariant`, a typed `Result`/`ok`/`err` only if later plans need it — do not speculate; start with `assertNever` and `invariant`);
  - `exports` pointing only to the built/root entry per ADR 0001;
  - its own `tsconfig.json` extending `@blixis/tsconfig/library.json`.
- Add the package to root `tsconfig.json` references.
- Root `build` builds every package that has a `build` script in dependency order.

## Architectural constraints

- `@blixis/shared` must not depend on Cloudflare, Hono, database, or any domain package.
- Utilities must be Web-platform only (no Node built-ins).
- Keep the surface minimal; every export must have a planned consumer.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/conventions/packages.md
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
packages/shared/src/assert.ts
```

### Modify

```text
tsconfig.json
package.json
pnpm-lock.yaml
docs/development/monorepo.md
docs/ROADMAP.md
docs/plans/001-project-foundation/_index.md
docs/plans/001-project-foundation/004-define-package-conventions.md
```

### Delete

```text
None.
```

## Proposed structure

```text
packages/
└── shared/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        └── assert.ts
```

## Implementation steps

1. Write `docs/conventions/packages.md` using ADR 0001 for build/consumption details.
2. Create `packages/shared` following the convention.
3. Implement `assertNever` and `invariant` (tests come in 001.006 once the runner exists; add them there).
4. Add the package reference to the root `tsconfig.json`.
5. Wire the root `build` script (`pnpm -r build` respecting topological order).
6. Run `pnpm install`, `pnpm typecheck`, `pnpm build`.
7. Verify a deep import such as `@blixis/shared/src/assert` is not resolvable by a consumer (use a throwaway file, then delete it).

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```jsonc
// packages/shared/package.json (sketch)
{
  "name": "@blixis/shared",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"]
}
```

## Dependencies

Requires:

- [001.003 — Configure root TypeScript 7 setup](./003-configure-typescript.md)

## Acceptance criteria

- [x] `docs/conventions/packages.md` exists and covers every bullet in the requirements.
- [x] `pnpm build` produces `packages/shared/dist/index.js` and `index.d.ts` (or the ADR-defined equivalent).
- [x] `pnpm typecheck` passes with the package referenced.
- [x] Importing `@blixis/shared/src/assert` from another workspace location fails to resolve.

## Validation

```bash
pnpm install
pnpm typecheck
pnpm build
ls packages/shared/dist
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
- [x] The convention document and the real package agree field by field.
- [x] `@blixis/shared` exports nothing speculative.

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

- `@blixis/shared` exports only `invariant`, `assertNever`, and `InvariantError` (planned consumers: code standards §2, kernel, contracts tests). No `Result` type — no consumer yet.
- `invariant` throws a plain `InvariantError` (not a `@blixis/contracts` error): `shared` is a leaf package with no dependencies, and invariant failures are programming errors that map to `INTERNAL` anyway.
- Package is **not** marked private: `@blixis/kernel` (publishable) may depend on it. Publishing is decided in 018.005.
- **Build:** root `build` script is now `tsc -b` (builds all referenced library projects in dependency order); each package also has `"build": "tsc -b"` for `pnpm --filter` use. The recursive `pnpm -r build` from 001.001 is replaced to avoid building twice. Apps will add their own bundling steps later.
- **No `tsconfig.test.json` yet:** TS7 fails a project whose `include` matches no files (`TS18003`), so the test config arrives with the first tests in 001.006.
- **Boundary verification** (temporary consumer package, removed): `import '@blixis/shared/src/assert.ts'` → `TS2307` in `tsc`, `ERR_PACKAGE_PATH_NOT_EXPORTED` in Node; public import works and `invariant(false, …)` throws `InvariantError`.
- `docs/conventions/packages.md` documents the layout, `package.json` template, dependency/peer rules, tsconfig pattern, forbidden patterns (with enforcement mechanism per ADR 0003), and a creation checklist; `docs/development/monorepo.md` now links to it.
