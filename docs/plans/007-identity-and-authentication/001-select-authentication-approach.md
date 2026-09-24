# 007.001 — Select the authentication approach

## Status

```text
not-started
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Decide the authentication implementation — library vs. custom, session model, API token format, password hashing algorithm and parameters on Workers — and record it as ADR 0009.

## Background

§30 defines the separation of concerns but not the mechanism. The choice affects schema ownership (§20), Workers compatibility (§38), and the admin UI integration (plan 019).

## Requirements

- Evaluate at least: Better Auth (Hono/Workers support, Postgres adapter via chosen query layer, plugin model, schema ownership, TS7 compatibility), and a custom minimal implementation (sessions table + Web Crypto).
- Decide session model: opaque random session ID in an `HttpOnly; Secure; SameSite=Lax` cookie, stored hashed in Postgres with expiry and rotation — vs. stateless JWT (not recommended for revocation).
- Decide password hashing: e.g. PBKDF2-SHA256 via Web Crypto with iteration count within Workers limits vs. WASM Argon2id; include CPU time measurements from a spike in `workerd`.
- Decide API token format: `blx_pat_<random>` with stored SHA-256 hash, prefix for identification, optional expiry, scopes (list of permission IDs) — scopes enforced by plan 009.
- Decide how tables are owned (module-owned migrations even if a library is used).
- Decide CSRF approach for cookie sessions (e.g. require custom header or Origin check for unsafe methods).

## Architectural constraints

- Must work in Workers without long-lived Node state (§38).
- Must fit module-owned migrations (§20).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0009-authentication.md
```

### Modify

```text
None.
```

### Delete

```text
None.
```

## Implementation steps

1. Spike hashing in `workerd` and measure CPU time.
2. Evaluate library integration with the kernel's actor resolver and module migrations.
3. Write ADR 0009.

## Dependencies

Requires:

- [006.007 — Verify the event pipeline end to end](../006-events-and-async-processing/007-event-pipeline-end-to-end.md)

## Acceptance criteria

- [ ] ADR 0009 accepted with measured hashing cost and explicit session/token/CSRF decisions.

## Validation

- ADR review against §30, §35, §38.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Decision keeps authorization out of the auth module.

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
