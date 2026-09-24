# 014.001 — Decide upload strategy and implement the R2 object storage adapter

## Status

```text
not-started
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Record ADR 0013 (upload flows, size limits, key scheme, serving domain) and implement the `ObjectStorage` port with an R2 adapter and test fake.

## Background

§17 R2 for binaries; §4 R2 adapters in `@blixis/cloudflare`; domain modules depend on abstractions.

## Requirements

- ADR 0013: upload modes (streaming single-part via binding up to N MB; R2 multipart upload via binding for larger), request size limits by Workers plan, allowed MIME types policy, key scheme, checksum verification (MD5/SHA-256), serving domain and headers (`Content-Disposition`, `X-Content-Type-Options: nosniff`, CSP for SVG).
- `ObjectStorage` port (in `@blixis/assets` public types or contracts — decide; recommendation: contracts, since third-party modules may need storage via capability): `put(key, stream, meta)`, `get(key, range?)`, `head`, `delete`, multipart methods.
- R2 adapter in `@blixis/cloudflare` using the binding; fake in `@blixis/testing`.
- Provision R2 buckets per environment; binding `ASSETS`; docs updated.

## Architectural constraints

- Streams only; never `await request.arrayBuffer()` for uploads above small thresholds.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0013-asset-uploads.md
packages/cloudflare/src/r2-object-storage.ts
packages/cloudflare/src/r2-object-storage.test.ts
packages/testing/src/object-storage.ts
```

### Modify

```text
packages/contracts/src/index.ts (ObjectStorage port, if placed in contracts)
packages/cloudflare/src/index.ts
packages/testing/src/index.ts
apps/api/wrangler.jsonc
apps/api/src/env.ts
docs/operations/configuration.md
docs/operations/cloudflare.md
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0013.
2. Port and adapter.
3. Provision buckets.
4. Tests in Workers pool (local R2 simulation).

## Dependencies

Requires:

- [012.008 — Enforce query limits and verify batching](../012-graphql-delivery-api/008-query-limits-and-batching.md)

## Acceptance criteria

- [ ] ADR accepted with explicit size limits.
- [ ] Adapter streams a multi-MB file in tests without buffering.

## Validation

```bash
pnpm test --filter @blixis/cloudflare
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
- [ ] Security headers policy documented.

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
