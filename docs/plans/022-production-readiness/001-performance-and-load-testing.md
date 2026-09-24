# 022.001 — Define performance targets and run load tests

## Status

```text
not-started
```

## Parent plan

[022 — Production Readiness & Launch](./_index.md)

## Objective

Define initial SLO targets and run load tests on staging for delivery (cached/uncached), management CRUD, publish, and uploads; review bundle size and cold-start impact; fix or document bottlenecks.

## Background

§34 caching layers; 013 measurements; Hyperdrive pooling behaviour; Workers CPU limits.

## Requirements

- Propose targets (e.g. delivery p95 < 100 ms cached / < 400 ms uncached; management p95 < 500 ms; publish-to-live < documented bound).
- Load test scripts (e.g. k6) in `tooling/load/`, run against staging with seeded data.
- Collect: latency percentiles, error rates, DB connections/queries (Neon metrics), Hyperdrive cache hits, queue backlog, CPU time.
- Bundle size and startup time review; remove unnecessary dependencies.
- Performance report.

## Architectural constraints

- Never run load tests against production.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
tooling/load/package.json
tooling/load/scenarios/delivery.js
tooling/load/scenarios/management.js
tooling/load/scenarios/publish.js
docs/operations/performance-report.md
```

### Modify

```text
package.json
```

### Delete

```text
None.
```

## Implementation steps

1. Targets.
2. Scripts and seeding.
3. Runs and analysis.
4. Fixes or accepted exceptions.

## Dependencies

Requires:

- [020.005 — Add the Service Binding adapter and Worker extraction playbook](../020-observability-and-security-hardening/005-service-binding-adapter-and-extraction-playbook.md)
- [021.002 — Add pull request preview environments](../021-ci-cd-and-release-engineering/002-pull-request-preview-environments.md)

## Acceptance criteria

- [ ] Report contains targets, results, and actions for each scenario.

## Validation

```bash
k6 run tooling/load/scenarios/delivery.js -e BASE_URL=https://<staging>
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
- [ ] Results reproducible from scripts.

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
