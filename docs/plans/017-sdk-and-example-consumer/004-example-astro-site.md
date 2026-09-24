# 017.004 — Build the Astro example site

## Status

```text
not-started
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Create `apps/example-site` (Astro) that renders a sample content model (e.g. blog posts with authors and images) using the SDK delivery client, supports preview mode, and documents deployment and webhook-triggered rebuilds.

## Background

§3 `apps/example-site` Astro; proves consumer experience end to end.

## Requirements

- Astro project using `@blixis/sdk` via workspace dependency (consumed as a normal package).
- Seed script creating the sample model and content via the SDK management client.
- Pages: index (list), post detail with linked author and asset images, locale switch.
- Preview mode route using preview key (server-side only; never ship keys to the browser).
- README: local run against `wrangler dev` API, deploy option (Cloudflare Pages/Workers static assets), webhook → rebuild hook setup.

## Architectural constraints

- Delivery/preview keys only in server environment variables.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/example-site/package.json
apps/example-site/astro.config.mjs
apps/example-site/tsconfig.json
apps/example-site/src/pages/index.astro
apps/example-site/src/pages/posts/[slug].astro
apps/example-site/src/lib/blixis.ts
apps/example-site/scripts/seed.ts
apps/example-site/README.md
```

### Modify

```text
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold Astro app.
2. Seed script.
3. Pages and preview.
4. README.

## Dependencies

Requires:

- [017.003 — Add the GraphQL delivery client](./003-sdk-graphql-delivery-client.md)

## Acceptance criteria

- [ ] `pnpm --filter example-site build` succeeds against a seeded local API.
- [ ] Preview shows draft changes; production build shows published only.

## Validation

```bash
pnpm --filter @blixis/api dev   # separate shell
pnpm --filter example-site seed && pnpm --filter example-site build
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
- [ ] Example uses only public SDK APIs.

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
