# 020 — Observability & Security Hardening

## Status

```text
not-started
```

Milestone: Milestone 9 — Production readiness  
Roadmap scope: MVP / initial platform  
Progress: 0/5 tasks completed

## Objective

Make Blixis operable and defensible in production: every request/event is traceable by correlation ID with the §35 fields, sensitive data is never logged, abusive traffic is limited, the attack surface is reviewed against a checklist, and the path to splitting Workers via Service Bindings is prepared without actually splitting (§18, §46).

## Why this plan exists

§35 defines observability fields and forbidden log content; §18/§46 prefer Service Bindings for internal communication once splitting is justified; §30/§31/§39 define security boundaries. Earlier plans include local measures (auth throttling, SSRF for webhooks); this plan makes them consistent platform-wide before launch.

## Scope

In scope:

- structured logger implementation and redaction, correlation propagation (requests, events, Workflows)
- Workers Logs / Traces configuration and log field conventions
- rate limiting for delivery and management APIs
- security review and fixes: headers, CORS, secrets inventory, dependency audit, tenancy re-check, SSRF, upload safety
- Service Binding adapter and extraction playbook (no actual split)

Out of scope:

- Analytics Engine, Durable Objects, Vectorize (deferred §11 optional)
- audit log module (`@blixis/audit`, deferred §41 Later) — noted as follow-up
- penetration test by third party (recommended, outside roadmap)

## Dependencies

Depends on:

- [013 — Delivery Caching & Invalidation](../013-delivery-caching/_index.md)
- [014 — Assets on R2](../014-assets/_index.md)
- [015 — Webhooks](../015-webhooks/_index.md)

## Architecture decisions

- **Logger is an interface in contracts** (002.008); implementation lives in kernel/shared with JSON output compatible with Workers Logs.
- **Correlation**: request `correlationId` → event metadata → consumer scope → Workflow params (§35).
- **Never log** tokens, passwords, secrets, cookies, connection strings, sensitive personal data (§35) — enforced by redaction + tests.
- **Rate limiting** prefers Cloudflare primitives (Rate Limiting binding / WAF rules) over custom storage; KV is not used for strict counters (§14).
- **Modular monolith stays** (§46): Service Binding work is preparation only.

## Deliverables

- Logger implementation with redaction and tests; all modules using it.
- `wrangler.jsonc` observability configuration per environment; `docs/operations/observability.md`.
- Rate limits configured and documented.
- `docs/security/review-<date>.md` with findings and resolutions; `docs/security/checklist.md` for future modules.
- `@blixis/cloudflare` Service Binding adapter + `docs/architecture/worker-extraction.md`.

## Tasks

- [ ] [001 — Implement structured logging, redaction, and correlation propagation](./001-structured-logging-and-correlation.md)
- [ ] [002 — Configure Workers observability and write the observability runbook](./002-workers-observability-configuration.md)
- [ ] [003 — Implement API rate limiting](./003-rate-limiting.md)
- [ ] [004 — Perform the platform security review and fixes](./004-security-review.md)
- [ ] [005 — Add the Service Binding adapter and Worker extraction playbook](./005-service-binding-adapter-and-extraction-playbook.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] A single publish operation can be traced from HTTP request through outbox, queue consumer, cache invalidation, and webhook delivery by one correlation ID in logs (staging evidence).
- [ ] Security review has no open high-severity findings.

## Risks

- **Log volume/cost**: sample debug logs; keep info logs concise.
- **Rate limiting false positives** for legitimate high-volume delivery clients; limits per key kind with documented defaults.

## Open questions

- Is Cloudflare WAF/zone-level rate limiting available (custom domain + plan), or only the Workers Rate Limiting binding? Decide in 020.003.
- Should an audit log of management actions be part of MVP for compliance? Default: deferred to `@blixis/audit`; events already capture most actions.

## Technical notes

No technical notes yet.
