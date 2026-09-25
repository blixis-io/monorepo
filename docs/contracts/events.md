# Events

The developer guide is in the manual: [concepts/events.mdx](../../apps/docs/src/content/docs/concepts/events.mdx). This page keeps the **event register** — the per-event delivery-class decision required by architecture §32.

## Event register

Every event is listed here with its delivery class. Rows are added by the task that defines the event.

| Event | Version | Delivery | Owner | Consumers | Defined in |
|---|---|---|---|---|---|
| `user.created` | 1 | **transactional** | `@blixis/users` | provisioning (e.g. personal space, plan 008), audit (020) | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `locale.created` | 1 | best-effort | `@blixis/spaces` | content (010) may add locale columns/indexes | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `locale.updated` | 1 | best-effort | `@blixis/spaces` | content fallback resolution caches | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `locale.deleted` | 1 | best-effort | `@blixis/spaces` | content (010) | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `membership.created` | 1 | best-effort | `@blixis/users` | audit (020), notifications | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `membership.removed` | 1 | best-effort | `@blixis/users` | audit (020), cache invalidation of access | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `user.invited` | — | *reserved* | `@blixis/users` | email invitations (deferred until an email provider is chosen) | — |
| `organization.created` | 1 | best-effort | `@blixis/spaces` | audit (020) | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `space.created` | 1 | **transactional** | `@blixis/spaces` | provisioning: content defaults (010), delivery keys (012), search indexes | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `space.deleted` | 1 | **transactional** | `@blixis/spaces` | **every module storing space data deletes its rows** (no cross-module FKs) | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `space.updated` | 1 | best-effort | `@blixis/spaces` | caches of space names | [`modules/spaces/src/events.ts`](../../modules/spaces/src/events.ts) |
| `user.signed-in` | 1 | best-effort | `@blixis/auth` | audit (020), analytics | [`modules/auth/src/events.ts`](../../modules/auth/src/events.ts) |
| `user.signed-out` | 1 | best-effort | `@blixis/auth` | audit (020) | [`modules/auth/src/events.ts`](../../modules/auth/src/events.ts) |
| `user.disabled` | 1 | **transactional** | `@blixis/users` | `@blixis/auth` revokes refresh tokens and API tokens | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `user.updated` | 1 | best-effort | `@blixis/users` | caches of display names; losing one only delays a refresh | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `content-type.created` | 1 | best-effort | `@blixis/content` | GraphQL schema cache (012), webhooks (015) | [`modules/content/src/events.ts`](../../modules/content/src/events.ts) |
| `content-type.updated` | 1 | best-effort | `@blixis/content` | GraphQL schema cache (012): payload carries the new `version`; webhooks (015) | [`modules/content/src/events.ts`](../../modules/content/src/events.ts) |
| `content-type.deleted` | 1 | best-effort | `@blixis/content` | GraphQL schema cache (012), webhooks (015) | [`modules/content/src/events.ts`](../../modules/content/src/events.ts) |
