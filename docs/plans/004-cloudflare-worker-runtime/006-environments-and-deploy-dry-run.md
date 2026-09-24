# 004.006 — Configure wrangler environments and deploy dry-run in CI

## Status

```text
not-started
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Define `staging` and `production` wrangler environments, add a CI job running `wrangler deploy --dry-run` with a bundle-size report, and document the manual first deploy of the staging Worker.

## Background

§46 requires one API Worker; later plans add bindings per environment. Separating environments now prevents production bindings being created ad hoc. Automated deployments are plan 021; this task establishes configuration and the dry-run gate.

## Requirements

- Add `env.staging` and `env.production` sections to `wrangler.jsonc` following `docs/operations/cloudflare.md` (Worker names `blixis-api-staging` / `blixis-api-production`, `workers_dev: false`, custom-domain routes once the domain exists, all vars/bindings declared per environment since they are not inherited).
- Extend the `verify` job in `ci.yml`: `wrangler deploy --dry-run` for staging and production; print bundle size (gzip) and fail above a documented threshold (initially generous; record baseline).
- Update `docs/operations/cloudflare.md` (already written as the target design) with the actual configuration and the resource inventory IDs.
- If credentials are available, perform one manual staging deploy and record URL and version ID in Technical notes; otherwise note that it is pending and do not block completion.

## Architectural constraints

- No secrets committed; CI dry-run does not need credentials.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
None.
```

### Modify

```text
apps/api/wrangler.jsonc
.github/workflows/ci.yml
apps/api/package.json
docs/operations/cloudflare.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add environments to wrangler config.
2. Add CI job with size reporting.
3. Update operations documentation.
4. Optional manual staging deploy.

## Dependencies

Requires:

- [004.005 — Add Workers-runtime integration tests for apps/api](./005-workers-runtime-tests.md)

## Acceptance criteria

- [ ] CI runs dry-run deploys for both environments and reports bundle size.
- [ ] `docs/operations/cloudflare.md` matches the implemented configuration.

## Validation

```bash
pnpm --filter @blixis/api exec wrangler deploy --dry-run --env staging
pnpm --filter @blixis/api exec wrangler deploy --dry-run --env production
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
- [ ] Bundle size baseline recorded in the plan Technical notes.

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
