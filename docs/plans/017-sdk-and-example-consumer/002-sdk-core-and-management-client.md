# 017.002 — Create @blixis/sdk core and Management REST client

## Status

```text
not-started
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Create `@blixis/sdk` with a fetch-based HTTP core (auth header, retries for idempotent requests, error mapping, pagination helpers) and `createBlixisClient` covering spaces, content types, entries (incl. publish), assets (upload), webhooks, and API keys.

## Background

§4 `createBlixisClient` export; ADR 0015 provides types.

## Requirements

- Scaffold `packages/sdk` with zero or minimal dependencies.
- Core: base URL, token, custom `fetch` injection, timeout, `Idempotency-Key` support for commands, automatic retry on 429/5xx for idempotent methods with backoff respecting `Retry-After`.
- `BlixisApiError` with `code`, `status`, `requestId`, `details`.
- Resources: `spaces`, `contentTypes`, `entries` (list with async iterator pagination, create, update with `expectedVersion`, publish/unpublish), `assets` (streamed upload where runtime supports), `webhooks`, `apiKeys`.
- Contract tests running against the Workers-pool API instance.

## Architectural constraints

- No Node built-ins; ESM only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/sdk/package.json
packages/sdk/tsconfig.json
packages/sdk/src/index.ts
packages/sdk/src/core/http.ts
packages/sdk/src/core/errors.ts
packages/sdk/src/management/client.ts
packages/sdk/src/management/resources/
packages/sdk/test/management.contract.test.ts
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Core HTTP and errors.
2. Resources using generated types.
3. Contract tests.

## Dependencies

Requires:

- [017.001 — Decide and implement the REST API type source](./001-rest-api-type-source.md)

## Acceptance criteria

- [ ] Contract tests create space → content type → entry → publish via the SDK.
- [ ] Errors surface `code` and `requestId`.

## Validation

```bash
pnpm --filter @blixis/sdk test
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
- [ ] SDK has no dependency on server packages at runtime (types only, if any).

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
