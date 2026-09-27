# 017.001 — Decide and implement the REST API type source

## Status

```text
completed
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
tooling/openapi/ (package.json, tsconfig.json, src/document.ts, src/cli.ts, test/openapi.test.ts)
apps/api/openapi.json (generated)
apps/api/src/openapi-module.ts
modules/{spaces,users,permissions,auth,content,assets,webhooks}/src/rest/operations.ts
packages/contracts/src/same-shape.test-d.ts
apps/docs/src/content/docs/concepts/api-reference.mdx
```

### Modify

```text
packages/contracts/src/module.ts (RestOperation, RestContribution.operations, SameShape)
modules/*/src/module.ts (operations), modules/users/src/index.ts
apps/api/src/blixis.config.ts, .github/workflows/ci.yml, package.json, tsconfig.json, biome.json
modules/auth/src/domain/password.test.ts (flaky timing test)
tooling/postman/blixis.postman_collection.json
apps/docs/src/content/docs/concepts/modules.mdx, docs/decisions/README.md, docs/ROADMAP.md
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

- [x] `pnpm openapi:generate` produces a valid OpenAPI 3.1 document covering all Management routes.
- [x] CI fails when routes change without regenerating.

## Validation

```bash
pnpm openapi:generate
pnpm openapi:check && git diff --exit-code docs/api/openapi.json
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
- [x] Worker bundle size unaffected in production (or impact recorded).

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

- **Decision (ADR 0015):** operations declared beside the routes (`RestContribution.operations`, Zod schemas), OpenAPI 3.1 generated at build time — not `@hono/zod-openapi` (a rewrite of every route and a second router) and not a shared DTO package (server types leaking into the published SDK). TS 7 has no compiler API, so SDK types will come from our own JSON-Schema emitter (017.002).
- **Coverage:** 83 operations (81 module + 2 kernel health routes) in nine modules; the test compares registered routes and operations both ways, checks unique `operationId`s and that every `$ref` resolves. `GET /assets/…` (root delivery route) is documented too; `/graphql` (`ALL`) is not a REST operation.
- **Drift:** every operations file asserts `SameShape<z.output<schema>, ServiceView>` for its views (ignoring `readonly` and optional `undefined`; a type test proves missing, extra, and retyped properties still fail). Writing them found no real drift, only `readonly` arrays and `exactOptionalPropertyTypes` noise, which `SameShape` normalizes.
- **Generator details:** one Zod registry per direction — requests converted with `io: 'input'` (bodies with transforms, e.g. normalized emails), responses with `io: 'output'`; named schemas (`.meta({ id })`) become `components.schemas`, reused anonymous schemas are inlined; Zod's safe-integer bounds are dropped; standard errors are shared `components.responses`. A body is `required` when it is binary or has required properties.
- **Served** at `/api/v1/openapi.json` (all environments, `max-age=300`) by `apps/api/src/openapi-module.ts` importing the committed JSON (bundle +~190 KB raw; gzip total 618 KB, within the size gate). The JSON is excluded from Biome (it must stay byte-identical to the generator's output).
- **CI:** `pnpm openapi:check` step in `verify`.
- **Also fixed:** the scrypt timing test in `@blixis/auth` compared single samples and failed under full-suite load (the earlier unexplained ship flake); it now interleaves five runs and compares medians.
