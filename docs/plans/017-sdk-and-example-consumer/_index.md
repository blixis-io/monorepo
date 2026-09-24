# 017 — SDK & Example Astro Consumer

## Status

```text
not-started
```

Milestone: Milestone 8 — Consumers & extension platform  
Roadmap scope: MVP / initial platform  
Progress: 0/4 tasks completed

## Objective

Give content consumers and automation a first-party, dependency-light TypeScript SDK (`createBlixisClient`, `createBlixisGraphQLClient` per §4) and prove it with an Astro example site (§3 `apps/example-site`) that renders published entries, supports preview, and documents deployment.

## Why this plan exists

§4 defines `@blixis/sdk` with those exports and requires independence from the admin UI. §3 lists `apps/example-site` (Astro). A real consumer is the only reliable test that the delivery API, keys, caching, and asset URLs are usable by outsiders.

## Scope

In scope:

- `@blixis/sdk` package: HTTP core (fetch-based), error mapping, management REST client, GraphQL delivery client
- API reference generation strategy for REST types (OpenAPI or shared types)
- `apps/example-site` with Astro, delivery + preview
- SDK docs and versioning readiness

Out of scope:

- admin UI (plan 019), though admin will reuse the management client
- publishing the SDK to npm (plan 021.003)
- framework-specific adapters (React hooks, etc.) — deferred

## Dependencies

Depends on:

- [013 — Delivery Caching & Invalidation](../013-delivery-caching/_index.md)
- [014 — Assets on R2](../014-assets/_index.md)
- [015 — Webhooks](../015-webhooks/_index.md)

## Architecture decisions

- **Independent of the admin UI** (§4).
- **Runtime-neutral**: uses global `fetch`, `URL`, `Headers` only; works in Workers, browsers, Node ≥ LTS, Astro SSR/SSG.
- **No domain logic** in the SDK; it maps HTTP/GraphQL responses and errors (`BlixisApiError` with `code` from `docs/contracts/errors.md`).
- **Types from the server's public contracts**: REST DTO types come from a generated OpenAPI document or from shared schema exports — decided in 017.001 (avoid hand-duplicated types, §29).
- **Credentials**: management clients use personal API tokens; delivery clients use delivery/preview keys; never both implicitly.

## Deliverables

- `packages/sdk` built for ESM with types.
- REST type source decided (ADR 0015) and implemented.
- `apps/example-site` renders a sample content model from local/staging API.
- `docs/sdk/README.md` with quick start, auth, errors, preview, pagination.

## Tasks

- [ ] [001 — Decide and implement the REST API type source](./001-rest-api-type-source.md)
- [ ] [002 — Create @blixis/sdk core and Management REST client](./002-sdk-core-and-management-client.md)
- [ ] [003 — Add the GraphQL delivery client](./003-sdk-graphql-delivery-client.md)
- [ ] [004 — Build the Astro example site](./004-example-astro-site.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] SDK tests pass against the Workers-pool API (contract tests) and in a browser-like environment.
- [ ] Example site builds (SSG) and runs preview mode against local API.

## Risks

- **Type drift** between API and SDK if types are hand-written; mitigated by generation/shared schemas.
- **Bundle size** for browser consumers — keep zero dependencies where possible.

## Open questions

- OpenAPI generation from Hono routes (e.g. via the validation library's Hono OpenAPI integration) vs. exporting DTO schemas from modules into a shared package? (ADR 0015; recommendation: OpenAPI generated from route schemas — also serves plan 022 API reference.)
- Generated typed GraphQL client (codegen from delivery schema) for SDK users? Default: document using standard GraphQL codegen against the delivery endpoint; not bundled in SDK.

## Technical notes

No technical notes yet.
