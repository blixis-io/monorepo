# 017.001 — Decide and implement the REST API type source

## Status

```text
not-started
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Record ADR 0015 on how REST request/response types reach the SDK (OpenAPI generation vs. shared schema exports) and implement the chosen mechanism, producing a machine-readable description of the Management API.

## Background

§29 avoid duplicated types; the SDK (§4) needs accurate types; plan 022 needs API reference docs.

## Requirements

- Evaluate OpenAPI generation from route schemas (Hono integrations for the ADR 0004 library) vs. shared DTO package; consider TS7 compatibility and Workers bundle impact (OpenAPI generation should be build-time or served lazily).
- Implement: annotate existing routes as needed; generate `openapi.json` via a tooling script; serve at `/api/v1/openapi.json` in non-production (or all — decide).
- CI check that generated spec is up to date.

## Architectural constraints

- No duplicated handwritten DTO interfaces.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0015-rest-api-type-source.md
tooling/openapi/package.json
tooling/openapi/src/generate.ts
docs/api/openapi.json (generated)
```

### Modify

```text
modules/*/src/rest/*.ts (route schema annotations as needed)
package.json
.github/workflows/ci.yml
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0015.
2. Implement generation.
3. CI freshness check.

## Dependencies

Requires:

- [013.005 — Review cache correctness and document operations](../013-delivery-caching/005-cache-correctness-review.md)
- [014.006 — Implement idempotent asset deletion and orphan cleanup](../014-assets/006-asset-deletion-and-cleanup.md)
- [015.005 — Verify webhooks end to end](../015-webhooks/005-webhooks-end-to-end.md)

## Acceptance criteria

- [ ] `pnpm openapi:generate` produces a valid OpenAPI 3.1 document covering all Management routes.
- [ ] CI fails when routes change without regenerating.

## Validation

```bash
pnpm openapi:generate && git diff --exit-code docs/api/openapi.json
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
- [ ] Worker bundle size unaffected in production (or impact recorded).

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
