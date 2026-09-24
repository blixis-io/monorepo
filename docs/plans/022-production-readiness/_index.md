# 022 — Production Readiness & Launch

## Status

```text
not-started
```

Milestone: Milestone 9 — Production readiness  
Roadmap scope: MVP / initial platform  
Progress: 0/5 tasks completed

## Objective

Establish, with evidence, that the MVP platform meets performance targets, can recover from data loss, is documented for API consumers, module authors, and operators, and still conforms to the architecture — then execute the launch checklist.

## Why this plan exists

The architecture's final constraint (§52) and agent rules (§48) must be verified across the finished system, not assumed. Operational concerns (§35 observability, §13 Postgres as source of truth, §17 R2 binaries) need tested recovery procedures before real content is stored.

## Scope

In scope:

- performance targets, load tests, bundle/cold-start review
- backup/restore and DR drills (Neon PITR/branch restore, R2 object recovery strategy)
- documentation: API reference (OpenAPI), delivery guide, SDK docs, operator runbooks index
- architecture conformance review and follow-up backlog
- launch checklist and go-live

Out of scope:

- extended features (plan 016) — not required for launch
- marketing site, billing

## Dependencies

Depends on:

- [013 — Delivery Caching & Invalidation](../013-delivery-caching/_index.md)
- [014 — Assets on R2](../014-assets/_index.md)
- [015 — Webhooks](../015-webhooks/_index.md)
- [018 — Extension Platform & Example Plugin](../018-extension-platform/_index.md)
- [019 — Admin UI Foundation](../019-admin-ui-foundation/_index.md)
- [020 — Observability & Security Hardening](../020-observability-and-security-hardening/_index.md)
- [021 — CI/CD & Release Engineering](../021-ci-cd-and-release-engineering/_index.md)

## Architecture decisions

- **Evidence-based readiness**: every checklist item links to proof (test run, document, dashboard).
- **Postgres is the recovery anchor** (§13); R2 objects are recoverable only if retained — define retention/versioning policy explicitly.
- **Deferred items stay deferred**: Workers for Platforms, runtime plugin toggles, Durable Objects etc. do not block launch.

## Deliverables

- Performance report with targets and results.
- DR runbook and drill report.
- `docs/README.md` documentation index; API reference published from OpenAPI.
- Architecture conformance report with follow-up tasks.
- Completed launch checklist.

## Tasks

- [ ] [001 — Define performance targets and run load tests](./001-performance-and-load-testing.md)
- [ ] [002 — Implement and drill backup, restore, and disaster recovery](./002-backup-restore-and-disaster-recovery.md)
- [ ] [003 — Publish documentation and API reference](./003-documentation-and-api-reference.md)
- [ ] [004 — Perform the architecture conformance review](./004-architecture-conformance-review.md)
- [ ] [005 — Execute the launch checklist](./005-launch-checklist.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Performance targets met or exceptions accepted by the project owner.
- [ ] DR drill restored staging from backup within the documented RTO/RPO.
- [ ] Conformance review has no open blocking violations.

## Risks

- **Unrealistic targets** without real traffic data — set initial targets, revisit after launch.
- **R2 has no built-in point-in-time recovery**; deletions must be soft-delayed or replicated if recovery is required.

## Open questions

- What are the initial SLOs (availability, delivery p95 latency, publish-to-live time)? Proposed defaults in 022.001; confirm with the project owner.
- Required RPO/RTO for customer content? Default proposal: RPO ≤ 1h (Neon PITR gives finer), RTO ≤ 4h.

## Technical notes

No technical notes yet.
