# 012.002 — Compose and validate the schema from module contributions

## Status

```text
completed
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Compose all modules' GraphQL contributions (collected by the kernel in 003.007) into one executable schema with shared scalars, detect conflicts, and fail bootstrap with module-attributed errors.

## Background

§10 kernel/GraphQL package composes contributions; §26 conflicting GraphQL definitions must fail clearly.

## Requirements

- Parse each module's `typeDefs`; merge `extend type Query` fragments; detect duplicate type names, duplicate fields on extended types, and resolvers without schema fields (and vice versa) — naming modules.
- Shared scalars: `DateTime`, `JSON`, `Locale` (validated BCP 47) and `ID` conventions; exported for module authors.
- Compose once per isolate (app scope) for static contributions; design extension point for dynamic per-space schema (ADR 0011).
- Tests with fixture modules (valid merge, type conflict, field conflict, orphan resolver).

## Architectural constraints

- Composition must not require a build step (no codegen) in MVP.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/compose.ts
packages/graphql/src/compose.test.ts
packages/graphql/src/scalars.ts
packages/graphql/src/extensions.ts
apps/docs/src/content/docs/concepts/graphql.mdx
```

### Modify

```text
packages/graphql/src/module.ts
packages/graphql/src/module.test.ts
packages/graphql/src/index.ts
vitest.config.ts (graphql alias for the Node project)
```

### Delete

```text
None.
```

## Implementation steps

1. Implement parsing/merging.
2. Conflict detection with attribution.
3. Scalars.
4. Tests.

## Dependencies

Requires:

- [012.001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers](./001-scaffold-graphql-package-with-yoga.md)

## Acceptance criteria

- [x] Two fixture modules defining `type Entry` fail bootstrap naming both.
- [x] Orphan resolvers are reported.

## Validation

```bash
pnpm --filter @blixis/graphql test
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
- [x] Error messages match §26 style.

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

- **`composeSchema(parts)`:**
  - Parses every fragment and tracks the owner of every type and field. It reports, **naming the module**: invalid SDL, a type defined twice, a field added twice (including base-type fields vs. extensions), resolvers for unknown types or fields, and `Query`/`Mutation` fields without a resolver.
  - graphql-tools' own resolver check is disabled (`requireResolversToMatchSchema: 'ignore'`), because its error names no module; ours runs after the build.
  - Problems throw `ModuleValidationError`, so a bad static contribution fails module setup.
- **Shared scalars** (`SCALARS`, `SCALAR_TYPE_DEFS`), always declared: `DateTime` (ISO 8601 with offset, validated), `Date`, `Locale` (BCP 47 shape), and `JSON` (literal-aware parsing). Field type GraphQL hints (010.003) use `Date`, `DateTime` and `JSON`.
- **Static schema:** composed once per isolate in `setup`.
- **Dynamic extension point:** the request-scoped `GRAPHQL_SCHEMA_EXTENSION` provider returns `{ key, parts }` (or `undefined`). Yoga's schema factory composes static plus extension parts and caches them in an isolate LRU keyed by `key` (`schemaCacheSize`, default 50). A test shows one composition per distinct key. ADR 0011 (012.005) uses it for typed per-space schemas.
- **Dual-realm finding:** graphql 16 has no `exports` map. In Vitest's Node project, Vite loaded the ESM build (`index.mjs`) for our sources while Node's loader gave Yoga's CommonJS dependencies `index.js`, which fails with "Cannot use GraphQLObjectType … from another module or realm". The fix aliases `graphql` to one entry in the Node project. Worker bundles (esbuild) and the Workers pool resolve one build, so production isn't affected, and the Workers test passes.
- **Manual:** *Concepts → GraphQL contributions* covers fragments, rules, scalars, the context, `loader()` and per-request schemas.
