# 020.004 — Perform the platform security review and fixes

## Status

```text
in-progress
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
docs/security/review-2026-09-29.md
docs/security/checklist.md
packages/kernel/src/internal/security-headers.ts
packages/kernel/src/internal/security-headers.test.ts
tooling/licenses/ (package.json, tsconfig.json, src/policy.ts, src/policy.test.ts, src/cli.ts)
```

### Modify

```text
packages/kernel/src/internal/rest.ts
packages/kernel/src/create-blixis.ts
.github/workflows/ci.yml
package.json
tsconfig.json
pnpm-lock.yaml
apps/docs/src/content/docs/extending/authoring-guide.mdx
docs/extensions/README.md
docs/api-surface/kernel.api.md
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

- [x] Review document lists every area with status.
- [ ] No open high-severity findings. *(Finding 1, rate limiting, is open: see Technical notes.)*

## Validation

```bash
pnpm audit --prod
pnpm test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Accepted risks have owners and follow-up tasks.

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

- Report: [docs/security/review-2026-09-29.md](../../security/review-2026-09-29.md). 9 findings: 1 high (open, blocking), 2 medium (fixed), 2 low (1 fixed, 1 accepted), 2 low accepted, 2 info.
- **High, open:** API rate limiting doesn't enforce on staging (020.003). It blocks plan 020 completion and launch (architectural constraint); resolution is WAF rules on the custom domain (022.005) plus the promotion gate (021.001). The review, fixes, checklist, and CI gates are done; the task stays `in-progress` until finding 1 is closed, because its acceptance criteria require no open high findings.
- **Fixed:** baseline security headers from the kernel on every response (handlers keep their own CSP; HTML pages get no default CSP so GraphiQL works outside production); JSON body limit 1 MiB via Hono `bodyLimit`, also for bodies without `Content-Length`, returned as `400 VALIDATION_FAILED` per the project's error convention (no 413 code exists).
- **CI:** `pnpm audit:check` (`pnpm audit --prod --audit-level high`; allow list via `auditConfig.ignoreGhsas` with a reason) and `pnpm licenses:check` (`tooling/licenses`, allow list + recorded exceptions).
- The route inventory was taken from the composed API app (`app.hono.routes`); tenant routes are guarded by the isolation and authz suites, the global routes were reviewed by hand (listed in the report).
