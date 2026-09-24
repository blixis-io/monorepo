# 007.004 — Resolve actors from sessions and bearer tokens

## Status

```text
not-started
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Implement the auth module's actor resolver plugged into the kernel so every request's `RequestContext.actor` is `user`, `apiToken`, or `anonymous`, with consistent handling of invalid credentials.

## Background

The kernel accepts an `actorResolver` (003.006). Resolution must be transport-agnostic so GraphQL (plan 012) reuses it. Delivery keys are added to the same resolver chain in plan 012.

## Requirements

- Define a resolver chain contract in the kernel (multiple modules can contribute resolvers in order: auth sessions, auth API tokens, later delivery keys) — extend the module contract minimally or use a kernel-level service token `ACTOR_RESOLVERS`; document.
- Session resolver: reads cookie, looks up hashed session, checks expiry/revocation and user status (`disabled` → anonymous + log).
- Bearer resolver: `Authorization: Bearer blx_pat_…` → token lookup (implemented in 007.005; stub interface here).
- Invalid presented credentials → `UnauthorizedError` (not silent anonymous) for bearer tokens; for cookies → anonymous + clear-cookie header (document rationale).
- Update `last_seen_at` at most once per N minutes (avoid write per request) using `waitUntil`.

## Architectural constraints

- Resolution must not require authorization logic.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/actor-resolver.ts
modules/auth/src/application/actor-resolver.test.ts
```

### Modify

```text
packages/kernel/src/internal/rest.ts
packages/kernel/src/create-blixis.ts
packages/contracts/src/module.ts (if resolver contribution becomes public)
modules/auth/src/module.ts
docs/kernel/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Design the resolver chain and document it.
2. Implement session resolver.
3. Integrate with kernel middleware.
4. Tests.

## Dependencies

Requires:

- [007.003 — Implement sign-up, sign-in, sign-out, and sessions](./003-auth-module-sessions.md)

## Acceptance criteria

- [ ] Request with a valid cookie has a `user` actor in context.
- [ ] Request with an invalid bearer token receives 401.
- [ ] Disabled users cannot authenticate.

## Validation

```bash
pnpm test --filter @blixis/auth --filter @blixis/kernel
pnpm --filter @blixis/api test
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
- [ ] Resolver chain is reusable by GraphQL and by delivery keys.

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
