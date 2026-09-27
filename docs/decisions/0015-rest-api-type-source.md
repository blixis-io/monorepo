# 0015 — REST API type source: operations beside the routes, OpenAPI generated

- Status: accepted
- Date: 2026-09-27
- Roadmap task: [017.001](../plans/017-sdk-and-example-consumer/001-rest-api-type-source.md) (decision register D18)

## Context

The SDK (plan 017), the admin UI (019), and the public API reference (022) all need the types of the Management API: 83 operations across nine modules. §29 forbids hand-duplicated DTO types. The routes are plain Hono handlers that pass bodies to services, which validate them; responses are the services' view types (`EntryView`, `AssetView`, …), declared as TypeScript interfaces.

Options:

- **(a) OpenAPI from Hono route schemas** (`@hono/zod-openapi`): rewrite every route as an OpenAPI route. The strongest coupling of docs and handlers, but a rewrite of every route file, a second router abstraction, and runtime work in the Worker.
- **(b) A shared DTO package**: move view types into a package the SDK imports. The published SDK's types would then depend on server modules, and there is still no OpenAPI for other languages.
- **(c) Operations declared beside the routes**, with Zod schemas for requests and responses, and a build-time generator producing OpenAPI 3.1 — from which the SDK's types are generated.

TypeScript 7 (ADR 0001) has no JavaScript compiler API, so common OpenAPI-to-TypeScript generators that print code with it don't run.

## Decision

**Option (c).**

1. **`RestContribution.operations`** (`@blixis/contracts`): each operation has `method`, `path`, `id` (the SDK method and `operationId`), `summary`, `tag`, optional `permission`, `auth: false` for public operations, a request (`query`, `body` or `'binary'`, documented `headers`, `idempotent`), and responses by status with Standard Schema bodies. Modules keep them in `src/rest/operations.ts`.
2. **Schemas are Zod** (ADR 0004). Reusable ones are named with `.meta({ id: 'Entry' })` and become `components.schemas`. Request bodies reuse the services' input schemas where they exist (`createContentTypeSchema`, `updateProfileSchema`, …).
3. **No drift between schemas and service types:** each operations file asserts at compile time that the schema's output and the view interface have the same shape (`SameShape<z.output<typeof entrySchema>, EntryView>`, ignoring `readonly` and optional-`undefined`, as JSON does). Changing a view without its schema fails `tsc`.
4. **No undocumented routes:** a test compares the registered routes with the operations, both ways.
5. **Generation at build time:** `pnpm openapi:generate` (`tooling/openapi`) writes `apps/api/openapi.json` (OpenAPI 3.1). CI runs `pnpm openapi:check`. Standard error responses (400/401/403/404/409, RFC 9457 `Problem`) are added to every operation.
6. **Served** at `GET /api/v1/openapi.json` in every environment (public API description, no secrets; `max-age=300`). The Worker imports the committed JSON: no schema conversion at runtime.
7. **SDK types** are generated from `openapi.json` by a small JSON-Schema-to-TypeScript emitter in `tooling/openapi` (plan 017.002), so the published SDK depends on no server package.

## Consequences

- Adding a route means adding its operation (the test fails otherwise), and changing a view means changing its schema (`tsc` fails otherwise).
- Request schemas document what clients send; services stay the validators. A route may accept more than documented until handlers validate with the same schemas (a later step, not needed for the SDK).
- The OpenAPI document serves the SDK, the admin, the API reference, and other languages' generators.
