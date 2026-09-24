# 017.003 — Add the GraphQL delivery client

## Status

```text
not-started
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Implement `createBlixisGraphQLClient` for delivery/preview queries with typed variables/results via generics, APQ/GET support for cacheability, and preview toggling.

## Background

§4 `createBlixisGraphQLClient`; 013 caching favours GET/APQ.

## Requirements

- `query<TData, TVars>(document, variables, { preview?, locale? })`.
- Automatic Persisted Queries (hash first, fallback to full query) and GET for queries when enabled.
- Error mapping from `extensions.code`.
- Docs example using GraphQL codegen typed documents (optional for users).
- Contract tests against Workers-pool API.

## Architectural constraints

- No heavy GraphQL client dependency; plain fetch.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/sdk/src/delivery/client.ts
packages/sdk/src/delivery/apq.ts
packages/sdk/test/delivery.contract.test.ts
```

### Modify

```text
packages/sdk/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Client with APQ.
2. Error mapping.
3. Tests.

## Dependencies

Requires:

- [017.002 — Create @blixis/sdk core and Management REST client](./002-sdk-core-and-management-client.md)

## Acceptance criteria

- [ ] Delivery queries succeed with delivery key; preview requires preview key.
- [ ] APQ path produces cache HITs in the Workers-pool test (with 013 caching).

## Validation

```bash
pnpm test --filter @blixis/sdk
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
- [ ] Works in Workers and browser environments (test matrix).

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
