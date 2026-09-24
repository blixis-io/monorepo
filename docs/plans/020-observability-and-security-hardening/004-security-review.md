# 020.004 — Perform the platform security review and fixes

## Status

```text
not-started
```

## Parent plan

[020 — Observability & Security Hardening](./_index.md)

## Objective

Run a structured security review of the whole platform, fix findings, and leave a reusable checklist for future modules.

## Background

§30, §31, §35, §39 security requirements; webhook SSRF (015), uploads (014), auth (007) already have local controls.

## Requirements

- Review areas: authN/authZ coverage (every route has authz; matrix complete), tenancy isolation suite completeness, secrets inventory (where each secret lives, rotation), CORS policy (admin origin(s), delivery CORS for browsers), security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP for any HTML), cookie flags, input size limits, SSRF, upload content types, dependency audit (`pnpm audit`, licence check), GraphQL introspection/limits, error message leakage, log redaction.
- Fix findings or create blocking tasks; document accepted risks.
- `docs/security/checklist.md` for module authors (links from authoring guide).
- Add `pnpm audit` (or equivalent) to CI with an allow-list process.

## Architectural constraints

- High-severity findings block plan completion.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/security/review-YYYY-MM-DD.md
docs/security/checklist.md
```

### Modify

```text
packages/kernel/src/internal/rest.ts (headers/CORS, if needed)
.github/workflows/ci.yml
docs/extensions/authoring-guide.md
```

### Delete

```text
None.
```

## Implementation steps

1. Review per area.
2. Fix/document.
3. Checklist and CI audit.

## Dependencies

Requires:

- [020.003 — Implement API rate limiting](./003-rate-limiting.md)

## Acceptance criteria

- [ ] Review document lists every area with status.
- [ ] No open high-severity findings.

## Validation

```bash
pnpm audit --prod
pnpm test
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
- [ ] Accepted risks have owners and follow-up tasks.

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
