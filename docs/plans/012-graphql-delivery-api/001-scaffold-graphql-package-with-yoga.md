# 012.001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers

## Status

```text
not-started
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
packages/graphql/src/index.ts
packages/graphql/src/module.ts
packages/graphql/src/context.ts
packages/graphql/src/server.ts
apps/api/test/graphql.worker.test.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/internal/rest.ts
apps/api/src/blixis.config.ts
apps/api/package.json
tsconfig.json
docs/kernel/README.md
pnpm-lock.yaml
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

- [ ] `POST /graphql { _platform { version } }` returns data in the Workers pool.
- [ ] GraphiQL disabled in production config.
- [ ] Bundle size delta recorded.

## Validation

```bash
pnpm --filter @blixis/api test
pnpm --filter @blixis/api deploy:dry
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
- [ ] Kernel change minimal and documented.

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
