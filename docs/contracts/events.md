# Events

The developer guide is in the manual: [concepts/events.mdx](../../apps/docs/src/content/docs/concepts/events.mdx). This page keeps the **event register** — the per-event delivery-class decision required by architecture §32.

## Event register

Every event is listed here with its delivery class. Rows are added by the task that defines the event.

| Event | Version | Delivery | Owner | Consumers | Defined in |
|---|---|---|---|---|---|
| `user.created` | 1 | **transactional** | `@blixis/users` | provisioning (e.g. personal space, plan 008), audit (020) | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
| `user.updated` | 1 | best-effort | `@blixis/users` | caches of display names; losing one only delays a refresh | [`modules/users/src/events.ts`](../../modules/users/src/events.ts) |
