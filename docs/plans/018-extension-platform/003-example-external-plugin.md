# 018.003 — Build the example external SEO plugin

## Status

```text
completed
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Create `examples/blixis-example-seo` — `@blixis-example/seo` — outside the workspace globs, implementing: an SEO metadata service, `GET/PUT /api/v1/entries/:id/seo` routes, a GraphQL `seo` field on delivered entries, `seo.read`/`seo.write` permissions, a migration, and an `entry.published` handler — using only public packages.

## Background

§42 Stage 8 and §44 describe exactly this example; §52 requires it be maintained.

## Requirements

- Own `package.json` with peer deps on `@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`; dev deps from packed tarballs.
- Options schema (`defaultTitle`), capability requirement `blixis.content`.
- Own tests using `@blixis/testing` (installed from tarball) booting it with first-party modules.
- README showing installation into `apps/api` (`pnpm add`, import in `blixis.config.ts`).

## Architectural constraints

- Must not import any path outside public package roots (lint rule applies).
- Not included in `pnpm-workspace.yaml` globs.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
examples/blixis-example-seo/{package.json,pnpm-workspace.yaml,tsconfig.json,tsconfig.test.json,vitest.config.ts,README.md}
examples/blixis-example-seo/src/{index.ts,service.ts,routes.ts,graphql.ts,events.ts,permissions.ts,schema.ts,migrations.ts}
examples/blixis-example-seo/test/seo.test.ts
packages/contracts/src/{struct.ts (moved from content-api),struct.test.ts,tenancy.ts}
packages/content-api/src/events.test.ts
```

### Modify

```text
packages/contracts/src/{index.ts,module.ts (GraphQLResolverContext)}
packages/content-api/src/{events.ts,index.ts}
packages/graphql/src/context.ts (extends the contract)
modules/spaces/src/events.ts (space.deleted re-exported from contracts)
tooling/boundaries/src/{rules.ts,rules.test.ts,workspace.ts,cli.ts} (plugin-internal-import)
package.json (pack:public), .gitignore (example lockfile)
docs/decisions/0016-public-capability-contracts.md (addendum), docs/contracts/{README.md,events.md}
docs/ROADMAP.md, docs/plans/018-extension-platform/_index.md
```

### Delete

```text
packages/content-api/src/schema.ts, schema.test.ts (moved to contracts as struct.ts)
```

## Implementation steps

1. Pack public packages to a local directory.
2. Build the plugin against tarballs.
3. Tests with `createTestBlixis`.
4. README.

## Dependencies

Requires:

- [018.002 — Write the module authoring guide and security model](./002-authoring-guide-and-security-model.md)

## Acceptance criteria

- [x] Plugin tests pass using tarball-installed packages.
- [x] Any required internal import is treated as a contract gap: fix the contract, not the plugin (record gaps in Technical notes).

## Validation

```bash
pnpm -r --filter "./packages/**" pack --pack-destination .artifacts
cd examples/blixis-example-seo && pnpm install && pnpm test
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
- [x] Contract gaps found and resolved are listed.

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

- **Done before 018.002** (swapped with the owner's go-ahead to "do what's best"): the authoring guide is written from this working plugin, so its examples are real code rather than a tour.
- **What it covers:** options with `configSchema` (typed `defineModule<Options, Config>`), capability requirements, a request-scoped service with a public token, REST routes with `operations`, a GraphQL extension of `Sys` with a per-request batching loader, two permissions with default roles, three event subscriptions, a Drizzle table in its own Postgres schema, and a migration.
- **Contract gaps found and fixed** (ADR 0016 addendum): `space.deleted` moved to contracts (every module must clean up per-space data); `struct` moved to contracts; `GraphQLResolverContext` added to contracts (`@blixis/graphql`'s context extends it); `@blixis/database` counts as a public platform package for modules that store data.
- **Authorization pattern for entry routes:** `CONTENT_SERVICE.resolveTenant(actor, entryId)` (404 for entries the actor can't read), then `AUTHORIZATION_SERVICE.require` with the plugin's permission on the entry's space (403 for members without it).
- **GraphQL:** the field goes on `Sys` because every delivered entry type has `sys`; `Entry` is an interface that each type implements. Delivery doesn't bind the tenant, but `Sys` parents come only from entries the delivery layer already authorized, and entry ids are unique UUIDs, so lookups by entry id are safe.
- **Tarball install:** `pnpm pack:public` builds and packs twelve packages into `.artifacts/`. The example is its own pnpm project (its own `pnpm-workspace.yaml` with `overrides` to the tarballs), so pnpm doesn't treat it as part of the monorepo. Its lockfile is ignored (tarball hashes change on every pack). `skipLibCheck` is needed, as in the monorepo: a dependency pulls in `lib.dom` alongside `webworker`.
- **Boundary rule `plugin-internal-import`:** `examples/*/src` may import only `@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`, `@blixis/database` (no deep imports, no escapes from `src`); tests may boot first-party modules.
- **Tests:** 3 Postgres tests: REST with per-role permissions (200/403/404/400), the GraphQL field for a delivery key, and the event handlers (publish time, entry deletion, space deletion). They run in CI with 018.004's gate.
