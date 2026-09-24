# 019.001 — Decide the admin stack and scaffold apps/admin

## Status

```text
not-started
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Record ADR 0017 (bundler, router, data fetching, forms, hosting, auth integration) and scaffold `apps/admin` with React, shadcn/ui, Tailwind, lint/typecheck/test integration, and a deployable build.

## Background

§3 React + shadcn/ui; 007 cookie sessions; 017 SDK.

## Requirements

- ADR 0017: Vite (or alternative) with TS7 compatibility check, router (e.g. TanStack Router / React Router), server-state library (e.g. TanStack Query), forms (library compatible with ADR 0004 schemas via Standard Schema), hosting & cookie strategy, testing (Vitest + Testing Library, Playwright for smoke).
- Scaffold app with shadcn/ui initialised, base layout, dark/light theme tokens.
- Admin tsconfig extends base + DOM.
- Boundary rule: `apps/admin` may import only `@blixis/sdk` (and shared UI deps), not server packages.
- Build output wired to chosen hosting (e.g. Workers static assets config in `apps/api/wrangler.jsonc` or separate Worker).

## Architectural constraints

- No server package imports.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0017-admin-stack.md
apps/admin/package.json
apps/admin/tsconfig.json
apps/admin/vite.config.ts
apps/admin/index.html
apps/admin/components.json
apps/admin/src/main.tsx
apps/admin/src/app.tsx
apps/admin/src/styles.css
```

### Modify

```text
tooling/boundaries/ (admin import rule)
apps/api/wrangler.jsonc (if served as static assets)
tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0017.
2. Scaffold and shadcn init.
3. Boundary rule.
4. Build and hosting wiring.

## Dependencies

Requires:

- [017.004 — Build the Astro example site](../017-sdk-and-example-consumer/004-example-astro-site.md)

## Acceptance criteria

- [ ] `pnpm --filter @blixis/admin build` succeeds; app loads locally.
- [ ] Importing a server package from admin fails lint.

## Validation

```bash
pnpm --filter @blixis/admin dev
pnpm --filter @blixis/admin build
pnpm lint
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
- [ ] Hosting choice keeps cookies secure (`Secure`, `HttpOnly`, `SameSite`).

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
