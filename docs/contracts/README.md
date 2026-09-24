# `@blixis/contracts`

The developer documentation for `@blixis/contracts` lives in the **developer manual** — [blixis-docs.frosty-hill-6079.workers.dev](https://blixis-docs.frosty-hill-6079.workers.dev) (source in [`apps/docs`](../../apps/docs)), with an API reference generated from the TSDoc in [`packages/contracts/src`](../../packages/contracts/src). Run it locally with `pnpm --filter @blixis/docs dev`.

| Topic | Manual page (source) |
|---|---|
| Overview and principles | [getting-started/introduction.mdx](../../apps/docs/src/content/docs/getting-started/introduction.mdx) |
| Walkthrough | [getting-started/first-module.mdx](../../apps/docs/src/content/docs/getting-started/first-module.mdx) |
| Module contract, lifecycle, REST, GraphQL | [concepts/modules.mdx](../../apps/docs/src/content/docs/concepts/modules.mdx) |
| Services, scopes, capabilities | [concepts/services-and-capabilities.mdx](../../apps/docs/src/content/docs/concepts/services-and-capabilities.mdx) |
| Public errors and transport mapping | [concepts/errors.mdx](../../apps/docs/src/content/docs/concepts/errors.mdx) |
| Validation (Standard Schema, Zod) | [concepts/validation.mdx](../../apps/docs/src/content/docs/concepts/validation.mdx) |
| Events, delivery classes, idempotency | [concepts/events.mdx](../../apps/docs/src/content/docs/concepts/events.mdx) |
| Actors and permissions | [concepts/permissions.mdx](../../apps/docs/src/content/docs/concepts/permissions.mdx) |
| Request context, logging, migrations | [concepts/context-and-migrations.mdx](../../apps/docs/src/content/docs/concepts/context-and-migrations.mdx) |

## Package rules (for maintainers)

- Types, tokens, and small pure helpers only — no database clients, Hono instances, Cloudflare bindings, GraphQL servers, or business logic (architecture §4).
- **No runtime `dependencies`** (enforced by `tooling/boundaries`). The only peer is `hono`, used type-only.
- Semantic versioning; breaking changes use `feat(contracts)!:` + `BREAKING CHANGE:`. Unstable APIs are marked `@experimental`.
- Every export has TSDoc — it becomes the generated API reference.
- `*.test-d.ts` type tests (checked by `pnpm typecheck`) keep the public types honest; `src/module.test-d.ts` is a complete third-party-style module that must keep compiling.
