# 012.001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers

## Status

```text
completed
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Create `@blixis/graphql` providing `graphqlModule()` that mounts a GraphQL Yoga handler at `/graphql` in the kernel's Hono app, builds per-request GraphQL context from the kernel request context, and serves a minimal `Query { _platform: PlatformInfo }` schema.

## Background

§4 lists Yoga setup, context creation, shared scalars, error mapping, schema validation as `@blixis/graphql` responsibilities; §10 one endpoint.

## Requirements

- Scaffold `packages/graphql` depending on `graphql`, `graphql-yoga`, kernel, contracts.
- Kernel: add ability for a platform module to mount a root-level route (outside `/api/v1`) — minimal, explicit (e.g. `rootRest` contribution for platform modules, or `graphqlModule` receives the Hono app via a kernel hook); document and keep it off the public module contract unless needed.
- Yoga configured with Fetch API, `graphqlEndpoint: '/graphql'`, GraphiQL enabled only when `BLIXIS_ENV != production` (configurable), `maskedErrors` enabled.
- Context: `{ requestContext, services, loaders }` created from the kernel request scope (actor resolved by kernel middleware).
- Minimal schema with `_platform { version modules }` to prove the path.
- Workers-pool test querying `_platform`.
- Measure bundle size delta and startup impact; record.

## Architectural constraints

- No Node-only Yoga plugins.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/package.json
packages/graphql/tsconfig.json
packages/graphql/tsconfig.test.json
packages/graphql/src/index.ts
packages/graphql/src/module.ts
packages/graphql/src/context.ts
packages/graphql/src/module.test.ts
apps/api/test/graphql.worker.test.ts
```

### Modify

```text
packages/contracts/src/module.ts (RestContribution.root)
packages/kernel/src/internal/rest.ts
packages/kernel/src/create-blixis.test.ts
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/tsconfig.json
pnpm-workspace.yaml (catalog: graphql, graphql-yoga)
tsconfig.json
pnpm-lock.yaml
tooling/postman/blixis.postman_collection.json
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold the package.
2. Add kernel support for root-level platform routes.
3. Implement server and context.
4. Register in `apps/api`, test in Workers pool.

## Dependencies

Requires:

- [011.007 — Verify the content management vertical slice end to end](../011-entries-and-publishing/007-content-vertical-slice-end-to-end.md)

## Acceptance criteria

- [x] `POST /graphql { _platform { version } }` returns data in the Workers pool.
- [x] GraphiQL disabled in production config.
- [x] Bundle size delta recorded.

## Validation

```bash
pnpm --filter @blixis/api test
pnpm --filter @blixis/api deploy:dry
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
- [x] Kernel change minimal and documented.

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

- **Versions:** GraphQL Yoga **5.24.1** with graphql **16.14.2**. graphql 17 (released 2026-07) is accepted by Yoga's peer range, but the graphql-tools/Envelop ecosystem Yoga depends on still targets 16, so 16 is the safe choice now.
- **Kernel hook:** `RestContribution.root?: boolean` is a minimal, explicit contract addition. A module can mount at the site root instead of `/api/v1`, and the same kernel middleware applies (request id, actor resolution, request scope, error mapping). Route-conflict detection covers root routes too. Tested in `create-blixis.test.ts`. It's documented as meant for platform endpoints only.
- **`graphqlModule({ graphiql? })`:**
  - builds the schema once in `setup` from `KERNEL_CONTRIBUTIONS.graphql` plus the platform type defs, and creates one Yoga instance per isolate;
  - `ALL /graphql` passes `{ requestContext, services, loaders: new Map(), env }` as the server context;
  - `maskedErrors` is on (customised in 012.003), logging off (the kernel logs);
  - GraphiQL runs unless `BLIXIS_ENV === 'production'` or `graphiql: false`.
- **`GraphQLContext`** (`requestContext`, `services`, `loaders`) and a `loader(context, key, create)` helper for per-request batching loaders are exported for module authors.
- **Platform query:** `_platform { version modules { name version } }`. `version` is the Worker version id from `CF_VERSION_METADATA`, or `local`.
- **Tests:**
  - Node: composition of a fixture module's `extend type Query`, the actor reaching resolvers, GraphiQL on/off.
  - Workers pool (`apps/api/test/graphql.worker.test.ts`): `_platform` through the real Worker entry, and GraphQL-format errors.
  - GraphQL over HTTP: `application/json` clients get `200` with errors; `application/graphql-response+json` gets `400`.
- **Bundle:** the staging dry-run went from **400.65 KiB to 550.19 KiB gzip** (+150 KiB for Yoga, graphql-js, graphql-tools and Envelop) against the 1024 KiB budget. Startup time will be recorded at the next staging deploy (`Worker Startup Time`; the last was 59 ms).
