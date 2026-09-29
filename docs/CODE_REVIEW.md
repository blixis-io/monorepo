# Blixis code review

Reviewed: 2026-09-29  
Scope: repository architecture, application and module code, tests, CI, operational configuration, and project documentation at commit `638af27`.

## Executive assessment

Blixis is unusually disciplined for a project at this stage. The module contract is real rather than aspirational, package boundaries are enforced automatically, the domain code is mostly transport-independent, public API changes are checked, and the CI workflow exercises the database, the Worker bundle, the admin UI, and an externally packaged extension. The code is consistently typed and contains very few suppressions or obvious shortcuts.

The honest qualification is that this is a strong **pre-production platform**, not a production-ready CMS yet. The repository itself says the same thing: production hardening, automated deployment, load testing, disaster recovery, and the final conformance review remain unfinished. Most importantly, the configured API rate limiter is known not to enforce in staging. In addition, the one test that proves the actual `pg`/Drizzle path inside `workerd` is quarantined. Those are meaningful runtime risks, not cosmetic backlog.

My overall judgment:

- **Architecture and code discipline:** strong
- **Correctness confidence in CI:** good, with one important Worker/Postgres gap
- **Security posture:** thoughtfully designed, but the formal review and effective edge abuse controls are incomplete
- **Maintainability:** good at the package level; a few application services and admin screens are becoming too large
- **Production readiness:** not yet

I would be comfortable continuing development on this foundation. I would not recommend calling it generally production-ready until the high-priority findings below are closed and the remaining milestone-9 gates have been exercised.

## What is working well

### 1. The modular architecture is implemented, not merely documented

The API has an explicit composition root (`apps/api/src/blixis.config.ts`), all modules use the same contract, and cross-package access is checked by a custom boundary tool. `pnpm lint` reported `boundaries: ok (29 packages, 507 files, 11 example plugin files)`. This is a valuable defense against the slow erosion common in monorepos.

The service registry, request-scoped services, module lifecycle, contribution registries, and transport adapters form a coherent system. The kernel also has explicit failure semantics for setup and boot, disposes request scopes in `finally`, and handles background failures deliberately (`packages/kernel/src/create-blixis.ts`).

### 2. The security design shows care

Authentication uses modern primitives and sensible behaviors: Ed25519 JWTs, scrypt password hashing, rotating refresh-token families, reuse detection, session revocation, login throttling, generic credential errors, and explicit origin handling. Tenant and authorization behavior receives dedicated matrix/isolation tests. Webhooks include URL validation, encryption, signing, and retries. Logging has secret redaction and avoids logging rate-limit keys.

This is substantially better than bolting security onto route handlers. The remaining concern is completion and deployment verification, not an absence of a security model.

### 3. CI is broad and supply-chain conscious

The workflows pin actions by commit SHA, use least-privilege permissions, run Postgres-backed tests in CI, verify generated Worker and OpenAPI artifacts, check public API surfaces, dry-run both Worker environments with a bundle-size gate, run browser E2E tests, and install the example extension from packed tarballs. The extension-contract job is especially good: it tests the artifact consumers will actually install, not only workspace source links.

### 4. Type and lint hygiene are excellent

The scan found almost no application-level `any`, `@ts-ignore`, or unexplained suppressions. Most apparent `any` usage is generated Worker or SDK code. Typechecking and linting both pass. The repository uses strict schemas at external boundaries and public errors rather than leaking arbitrary internal failures.

### 5. Documentation and decision records are a genuine asset

The ADRs, operating guides, conventions, task specifications, and extension documentation are extensive and generally agree with the implementation. The project records known failures instead of marking incomplete work as done—the rate-limit task is a good example. That honesty materially improves maintainability.

## Findings

### High — Deployed API rate limiting is not effective

The rate-limit implementation is clean and has fake/local tests, but the project has already demonstrated that the Cloudflare binding returns success beyond the configured threshold in staging. The task records 330 sequential, 500 parallel, and up to 1,500 sustained requests without a `429` (`docs/plans/020-observability-and-security-hardening/003-rate-limiting.md:117-129`). The acceptance criterion remains open (`:80-83`).

Impact: public delivery and management APIs currently lack the intended edge abuse protection. Login has its separate Postgres throttle, which reduces credential-attack risk, but it does not protect the rest of the API from scraping, resource exhaustion, or cost amplification.

Recommendation:

1. Treat WAF rate limiting on the custom domain as a launch blocker, not an optional follow-up.
2. Add a deployed smoke/load check that must observe `429` and a valid `Retry-After` before production promotion.
3. Keep the binding adapter, but alert on sustained absence of rejections or on `rate_limit.unavailable`/`rate_limit.not_configured` signals.
4. Document which controls are strict (login throttle) and which are approximate/fail-open (edge API limiter).

### High — The most important runtime parity test is permanently skipped

`apps/api/test/database.worker.test.ts:9-16` explains that the Worker-pool test for `pg` + Drizzle through Hyperdrive cannot load the correct `pg-cloudflare` export and is unconditionally `describe.skip`. The comment says deployed Workers are unaffected, but that claim is proven only by staging checks outside this test.

Impact: the core data path can regress specifically under `workerd` while Node integration tests, typechecking, and bundle dry-runs stay green. For a database-backed Worker, this is a significant confidence gap.

Recommendation:

- Add a small post-deploy staging integration job that performs a real transaction through the deployed Worker and fails the pipeline on regression.
- Track the upstream pool/export-condition issue with an owner and review date; avoid an indefinite quarantine.
- If a reliable Miniflare/Wrangler integration process can exercise the bundled artifact, prefer that over importing source through the incompatible test pool.

### Medium — The default local test result looks more complete than it is

The root `test` script is `tsc -b && vitest run`, while database tests use `skipIf` when `BLIXIS_TEST_DATABASE_URL` is absent (`package.json:30-33`). In this review, the command passed **527 tests but skipped 223 tests across 46 files**. Those skipped tests include auth, tenancy, permissions, content lifecycle, GraphQL delivery, assets, webhooks, the SDK contract, and the example site.

CI correctly supplies Postgres (`.github/workflows/ci.yml:20-49`), so this is primarily a developer-feedback and reporting problem rather than a CI hole.

Recommendation:

- Make the distinction explicit in scripts: for example `test:unit`, `test:integration`, and `test:all`.
- Print a prominent message when database tests are disabled, or fail `test:all` when the database URL is absent.
- Document expected test/file counts in CI so a large accidental increase in skipped tests is visible.

### Medium — Coverage exists but is not a quality gate

Coverage is configured only for `packages`, `modules`, and `tooling`; it excludes both apps and has no thresholds (`vitest.config.ts:38-43`). The checked workspace also contained an old-looking `coverage/lcov.info` that described only one four-line file, so the coverage directory cannot currently be treated as useful evidence.

This is not an argument for chasing a vanity percentage. It is a request to detect large untested regressions in critical code.

Recommendation:

- Include hand-written API and admin code, while continuing to exclude generated files.
- Start with modest per-area thresholds and ratchet them gradually.
- Add focused branch thresholds for auth token rotation/reuse, tenant binding, cache invalidation, outbox retry/idempotency, and asset cleanup.
- Publish the CI report as an artifact; do not rely on a local ignored directory.

### Medium — Several implementation units are becoming maintenance hotspots

The largest hand-written production files include:

- `modules/assets/src/application/asset.service.ts` — 859 lines
- `modules/content/src/application/content.service.ts` — 652 lines
- `modules/content/src/graphql/delivery.ts` — 578 lines
- `apps/admin/src/features/entries/entry-editor.tsx` — 524 lines
- `apps/admin/src/routes/content-type.tsx` — 488 lines
- `apps/admin/src/features/entries/widgets/rich-text.tsx` — 481 lines
- `modules/webhooks/src/application/webhook.service.ts` — 462 lines

File length alone is not a defect, and these files are internally coherent. The concern is change concentration: orchestration, validation, authorization, storage lifecycle, event emission, and presentation state increasingly live in the same units. The asset service in particular spans upload creation/completion, inspection, update/delete, cleanup, delivery, and listing.

Recommendation: split by use case or lifecycle without creating generic “manager” abstractions. Good seams would be upload lifecycle, asset mutation/cleanup, asset queries/delivery, entry draft lifecycle, publishing/version history, and admin editor state versus field rendering. Preserve the current public service facade if consumers benefit from it.

### Medium — Production engineering gates are intentionally unfinished

The roadmap marks the platform security review incomplete and the entire CI/CD and launch milestones not started (`docs/ROADMAP.md:438-472`). There is no automated API/admin staging-to-production deployment pipeline in the current workflows; the existing CI performs dry runs, and docs/package publishing have their own workflows.

Impact: releases still depend on manual procedure, and rollback, migration ordering, backup/restore, load limits, and production conformance have not been proven end to end.

Recommendation: retain the repository's current labeling as pre-production until plans 020–022 are complete. Prioritize the security review, deployed rate-limit proof, staging/production pipeline with migration gates, rollback drill, backup/restore drill, and load test before feature expansion.

### Low — Project-facing status documentation has drifted

The README still says “Milestone 1” (`README.md:7`) even though the roadmap shows milestone 9 in progress. The architecture guide also uses the old `@blixis/*` namespace in early examples while actual packages use `@blixis-io/*`. These mismatches create needless doubt for new contributors and potential extension authors.

Recommendation: generate or regularly verify status/package-name snippets, and add lightweight link/string checks for high-visibility documentation.

### Low — Admin tests emit repeated environment warnings

The successful test run repeatedly printed `Not implemented: Window's scrollTo() method`. This does not currently fail tests, but noisy output trains developers to ignore logs and can hide a real warning.

Recommendation: install a small `scrollTo` test stub in the admin test setup and make unexpected console errors fail tests where practical.

## Suggested order of work

1. Establish effective deployed rate limiting and a production-promotion smoke test.
2. Replace the quarantined Worker/Postgres test with a reliable bundled or deployed integration check.
3. Complete the formal security review, especially tenancy, SSRF/webhooks, CORS/cookies, headers, secrets, and dependency posture.
4. Make full versus partial test execution unmistakable; add meaningful coverage gates.
5. Implement and drill deployment, rollback, backup/restore, and load testing.
6. Refactor the largest services/screens opportunistically as their next feature changes arrive.
7. Refresh the README and public architecture examples.

## Verification performed

Commands run from the repository root:

```text
pnpm typecheck  -> passed
pnpm lint       -> passed; 623 files checked, boundary checks passed
pnpm test       -> passed; 90 files passed, 46 skipped; 527 tests passed, 223 skipped
```

I also inspected the workspace/package topology, source and test inventory, API composition root, kernel lifecycle and REST middleware, authentication, content/assets/webhooks, GraphQL caching and limits, database/event infrastructure, admin UI structure, CI/release workflows, Worker configuration, roadmap, ADRs, and operational documentation.

Not performed as part of this review: starting Postgres to run the skipped integration suite, running Playwright browsers, deploying to Cloudflare, probing live environments, dependency-vulnerability/network audit, or a formal penetration test. Conclusions about those areas are therefore based on code and repository evidence, not a fresh live-system verification.

## Staging verification addendum

Live checks were performed on 2026-09-29 against `blixis-api-staging.frosty-hill-6079.workers.dev`, after the initial repository review. The supplied test account was used only for authentication and read-only management requests. Sessions used for rotation/domain checks were signed out; a few short-lived access tokens from isolated probes were allowed to expire. No organizations, spaces, content, assets, keys, or webhooks were created or modified.

Passed checks:

- Liveness returned `200`.
- Database-backed readiness returned `200`, with `database.status = ok` and a measured latency of 69 ms.
- Sign-in returned `200`, an active user, access token, and refresh token with `Cache-Control: no-store`.
- `GET /auth/me` returned the expected authenticated account.
- Refresh-token rotation returned `200`, produced a different refresh token, and remained `no-store`.
- Authenticated organization, space, environment, locale, content-type, entry, asset, member, delivery-key, and webhook list/read operations all returned `200`.
- Public sign-up returned `403` as configured.
- A wrong password and an unknown email both returned the same generic `401` response (`Invalid email or password`), avoiding account enumeration through response text. Observed timings were in the same broad range but this small sample is not a timing-attack assessment.
- A preflight from an untrusted origin returned no `Access-Control-Allow-Origin` header and included `Vary: Origin`.
- The deployed OpenAPI document canonically matched `apps/api/openapi.json`: 57 paths, 27 schemas, and an identical sorted-JSON SHA-256.
- Anonymous GraphQL `{ __typename }` returned only the root type. This confirms endpoint availability; it does not expose content.

Confirmed failure:

- The anonymous API rate limiter still did not enforce. A bounded 330-request burst produced 315 HTTP `401` responses and 15 client/network errors, but no `429`; 30 immediate sequential follow-ups all returned `401`. No response contained `Retry-After`. The follow-up's lack of network errors indicates the 15 burst failures were connection/concurrency noise rather than rate-limit responses. This independently confirms the high-priority finding above.

Operational observations:

- The test account can see ten organizations. Nine appear to be old `Cache probe` or `Postman Org` test records; only `Smoke tests` had a space. This is harmless in staging but suggests test-data cleanup or per-run teardown would improve signal.
- The admin Worker is documented as not deployed, and staging has no configured browser origin. Browser-admin behavior was therefore not tested live.
- The correct readiness path is `/api/v1/health/ready`; `/api/v1/readiness` correctly returned `404` but is easy to guess incorrectly.

## Bottom line

Blixis has a better foundation than most projects of comparable age. Its main risk is not sloppy code; it is the gap between a carefully designed/tested platform and the remaining proof that those controls work in the deployed environment. Close the runtime and operations gaps before broadening scope, and the project is on a credible path to production.
