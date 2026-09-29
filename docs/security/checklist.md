# Security checklist for modules

Go through this list before a module (first-party or plugin) is merged or released, and again when it gains routes, storage, events, or outbound calls. It condenses the architecture's security rules (§30, §31, §35, §39) and the findings of the [security reviews](./review-2026-09-29.md). The [authoring guide](../../apps/docs/src/content/docs/extending/authoring-guide.mdx) shows how; the [security model](../../apps/docs/src/content/docs/extending/security-model.mdx) explains what the platform does for you.

## Routes

- [ ] Every route authorizes before it reads or writes: resolve the tenant from the resource, then `AUTHORIZATION_SERVICE.require(...)`. Non-members get `404`, members without the permission `403`.
- [ ] Tenant-scoped routes are added to `tooling/tenant-isolation/test/routes.ts` **and** `authz-routes.ts` (the suites fail otherwise).
- [ ] Every body and query is validated with `validate()` against a schema with length and size limits (strings, arrays, nesting). JSON bodies are capped at 1 MiB by the kernel; set tighter limits in your schema.
- [ ] Expensive routes (exports, bulk operations, anything that fans out) add `rateLimit({ limiter })` and document the limiter name.
- [ ] Only public errors (`NotFoundError`, `ValidationError`, …) carry messages to clients; never put internal details, SQL, hosts, or other tenants' ids in them.
- [ ] Routes are described with `operations` so they appear in OpenAPI and the SDK.

## Data

- [ ] Every table has `organization_id` (and `space_id`/`environment_id` where it applies); every query goes through `tenantScope()` or an explicit tenant condition. Cross-tenant references are checked with `assertSameTenant`.
- [ ] The module deletes its rows on `space.deleted` (and any other lifecycle event it depends on).
- [ ] Migrations are expand/contract and run by the migration role; the Worker's role has no DDL.
- [ ] Secrets stored at rest are encrypted (see `WEBHOOK_SECRET_KEYS`) or hashed (see API tokens); never stored in plain text, never returned after creation.

## Secrets and configuration

- [ ] Secrets come from Worker secrets (`wrangler secret put`), never from `vars`, the repository, or logs. `.dev.vars.example` lists new ones without values.
- [ ] Missing secrets fail only the features that need them, with a server error that names no value.
- [ ] Rotation is documented (how to add a new key while the old one still works).

## Outbound calls

- [ ] URLs that users control follow the webhook URL policy (`checkWebhookUrl` in `@blixis/webhooks`, `modules/webhooks/src/domain/url.ts`) or an equivalent: `https:` only, public hosts only, no redirects followed, timeouts, response size caps.
- [ ] Calls to third parties send only what they need; no tokens or personal data in URLs.

## Logging, events, and errors

- [ ] Use `ctx.logger` / `requestContext.logger` with structured fields; never `console.*`.
- [ ] Log errors as objects (`{ error }`), never `String(error)`.
- [ ] Never log tokens, passwords, secrets, cookies, connection strings, request bodies, or personal data. Redaction is a safety net, not a licence.
- [ ] Event payloads carry ids, not secrets or personal data beyond what subscribers need; public events (webhooks) are treated as published to third parties.
- [ ] Event handlers are idempotent (they may run more than once) and throw to be retried.

## Files and content

- [ ] Files from users are served with `nosniff`, a sandboxing CSP, and `attachment` unless the type is safe to show inline.
- [ ] HTML or rich text from users is stored as data (e.g. ProseMirror JSON), never rendered as HTML by the API.

## Dependencies

- [ ] New dependencies run on Workers, are maintained, and have a licence allowed by `tooling/licenses/src/policy.ts` (CI checks it; exceptions need a reason in the same PR).
- [ ] No high or critical advisories (`pnpm audit:check`). An accepted advisory goes in `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with a comment: why it doesn't apply, and when to remove it.

## Before release

- [ ] Tests cover the authorization and tenant paths, not only the happy path.
- [ ] The public API surface (`pnpm api-surface:check`) and docs are updated.
- [ ] A reviewer who didn't write the code went through this list.
