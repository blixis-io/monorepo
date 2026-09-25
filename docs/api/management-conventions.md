# Management API conventions

Rules every Management REST route follows (architecture §9, §29, §31, §33). New modules follow them too; the manual's API pages link here.

Related: [Errors](../contracts/errors.md) · [Tenancy](../conventions/tenancy.md) · [Authorization](../conventions/authorization.md)

---

## Paths

- **Base path:** `/api/v1`.
- **Resources:** lowercase, plural, kebab-case (`/content-types`, `/entries`).
- **Tenant resources:** these live under their tenant, `/organizations/:orgId/…` and `/spaces/:spaceId/…`.
- **Resource ids** that are unique on their own may have top-level routes (`/entries/:entryId`). Such routes resolve the tenant from the stored resource and verify access before anything else (`entryScoped()`). Register the segment in `@blixis/testing`'s `TENANT_SEGMENTS`, so the isolation suite and authorization matrix cover it.
- **Environment:** space-scoped routes select one with `?environment=<key>`; the default is the space's default environment, `main`.

## Authentication and access

| Case | Answer |
|---|---|
| no or invalid credentials | `401` |
| not a member of the resource's tenant | `404` (existence is never revealed) |
| a member without the permission | `403` |
| an API token acting beyond its scopes or its owner's permissions | `403` (or `404` when the owner isn't a member) |

## Representations

- **Format:** JSON, with camelCase properties.
- **Ids:** UUIDv7 strings (ADR 0007). Field ids and block ids are 8-character strings (ADR 0010).
- **Timestamps:** ISO 8601 in UTC with milliseconds (`2026-09-25T14:30:00.000Z`).
- **Content entries:** `{ sys, fields }`. `sys` holds system properties (`id`, `version`, `status`, timestamps, …), and `fields` holds the content keyed by `apiId`.
- **Other resources:** plain objects.

## Lists and pagination

- **Shape:** `{ "<plural>": [ … ] }`, e.g. `{ "entries": [ … ], "nextCursor": "…" }`.
- **Paginated lists:**
  - `?limit=` is 1–100 (default 25);
  - `?cursor=` takes an **opaque** `nextCursor` from the previous page;
  - `nextCursor: null` means the last page.

  Cursors are keyset positions, never offsets, so pages stay stable while content changes.
- **Filters** are query parameters. Field filters use `fields.<apiId>=<value>`.

## Changes

- `POST` creates and answers `201` with the resource. `PATCH` changes and answers `200` with the resource. `DELETE` answers `204`.
- **Optimistic concurrency:** resources that are edited concurrently carry a version.
  - **Content types:** send `version` in the body.
  - **Entries:** send `expectedVersion`, or `If-Match: "<version>"` with the `ETag` from the last response.
  - A stale version answers `409`, and nothing is overwritten.
- **Commands** such as `…/publish` are `POST` routes. They accept `Idempotency-Key` (ADR 0008 / 006.006), so a repeat returns the first result, and the same key with a different body answers `409`.

## Errors

Errors are RFC 9457 problem details (`application/problem+json`):
- `type` is `urn:blixis:problem:<CODE>`, plus `status`, `title`, `detail` and `requestId`.
- Validation errors add `errors: [{ path, message }]`. Paths point into the request body, e.g. `["fields", "body", "en-US", 0, "heading"]`.
- Messages are safe to show to users and never contain secrets or other tenants' data.
