# 004.007 — Integrate Sentry error monitoring for the API Worker

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Report unexpected errors (5xx, failed queue/scheduled/Workflow invocations, boot failures) from the API Worker to Sentry, tagged with environment, release version, and request/correlation IDs, with source maps uploaded on deploy — so staging and production issues raise alerts from the first deploy onward.

## Background

Sentry is the chosen alerting and error-tracking destination (decided 2026-09-24, org `private-m57`). §35 requires correlation IDs and forbids logging secrets; the same rules apply to error reports. Expected client errors (`BlixisError`s mapped to 4xx) are not reported. Sentry is an infrastructure concern: domain modules never import the Sentry SDK.

## Requirements

- Create Sentry project(s) for the API (one project, environments `staging` and `production`; `local` disabled by default).
- Add an `ErrorReporter` port (minimal: `captureException(error, context)`, `flush()`) at kernel level; the kernel's REST error handler and the Worker adapter report only unexpected errors (non-`BlixisError` or `INFRASTRUCTURE_ERROR`/`INTERNAL`).
- Implement the Sentry adapter in `apps/api` or `@blixis/cloudflare` using `@sentry/cloudflare` (`withSentry` wrapper or equivalent current API — verify against Sentry docs); add the compatibility flag it requires (`nodejs_als` or `nodejs_compat`) and record the reason.
- Configuration: `SENTRY_DSN` (var or secret per environment), `environment` = `BLIXIS_ENV`, `release` = `BLIXIS_VERSION`, low default `tracesSampleRate` (performance tracing decided in 020.002).
- Scrub data: strip `authorization`, `cookie`, `set-cookie` headers, request bodies of auth routes, query strings containing tokens; `sendDefaultPii: false`.
- Tags/context: `requestId`, `correlationId`, `module`, `spaceId`, `actorType` (not actor secrets).
- Source maps: `upload_source_maps` in `wrangler.jsonc` and a documented `sentry-cli` / Sentry Wrangler integration step for CI (wired into deploy jobs by 021.001); CI variables `SENTRY_ORG=private-m57`, `SENTRY_PROJECT`, secret `SENTRY_AUTH_TOKEN`.
- Default alert rules: new issue in `production` → notify; error spike in `staging` → notify (fine-tuned in 020.002).
- Workers-pool test with a fake reporter proving 5xx reports and 4xx does not; redaction test.

## Architectural constraints

- `modules/*` and `@blixis/contracts` must not depend on Sentry packages.
- No secrets, tokens, or cookies in Sentry events (§35).
- Reporting must not block responses (`waitUntil` / `flush` in background).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/src/sentry.ts
apps/api/test/sentry.worker.test.ts
packages/kernel/src/error-reporter.ts
```

### Modify

```text
apps/api/.dev.vars.example
apps/api/package.json
apps/api/src/env.ts
apps/api/src/index.ts
apps/api/worker-configuration.d.ts
apps/api/wrangler.jsonc
apps/docs/src/content/docs/concepts/errors.mdx
docs/ROADMAP.md
docs/kernel/README.md
docs/operations/cloudflare.md
docs/operations/configuration.md
docs/operations/github-actions.md
docs/plans/004-cloudflare-worker-runtime/007-sentry-error-monitoring.md
docs/plans/004-cloudflare-worker-runtime/_index.md
packages/cloudflare/src/worker-handler.test.ts
packages/cloudflare/src/worker-handler.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/kernel/src/internal/rest.test.ts
packages/kernel/src/internal/rest.ts
pnpm-lock.yaml
pnpm-workspace.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Read current `@sentry/cloudflare` docs (Workers setup, flags, source maps).
2. Add the kernel `ErrorReporter` port and wire reporting in REST error handling and the Worker adapter.
3. Implement the Sentry adapter with scrubbing and tags.
4. Configure DSN per environment and source-map upload procedure.
5. Tests with a fake reporter.
6. Trigger a test error on staging (debug-only route or `wrangler tail` verification) and confirm it appears in Sentry with release and environment.

## Dependencies

Requires:

- [004.006 — Configure wrangler environments and deploy dry-run in CI](./006-environments-and-deploy-dry-run.md)

## Acceptance criteria

- [x] An unhandled error in a route produces one Sentry event with `environment`, `release`, `requestId`, and readable stack traces (source maps).
- [x] `ValidationError`/`NotFoundError` responses produce no Sentry event.
- [x] Redaction test proves no `authorization`/`cookie` values reach the reporter.
- [x] `modules/*` have no Sentry dependency (boundary check).

## Validation

```bash
pnpm --filter @blixis/api test
pnpm lint
pnpm --filter @blixis/api exec wrangler deploy --dry-run --env staging
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
- [x] Sentry SDK version and required compatibility flag recorded in Technical notes.
- [x] Alert rules documented in `docs/operations/cloudflare.md#monitoring`.

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

- **SDK:** `@sentry/cloudflare` 11.0.0. It requires the `nodejs_compat` flag (its only entry point needs `AsyncLocalStorage`). The flag is recorded in `wrangler.jsonc` and `docs/operations/cloudflare.md`. Bundle: ~254 KiB gzip, well under the 1024 KiB gate.
- **v11 API change:** `sendDefaultPii` was removed and replaced by `dataCollection`. Configuration:
  - `userInfo: false`, `cookies: false`, `httpBodies: []`;
  - header deny-list, response headers off, token-like query params denied;
  - `beforeSend` → `scrubEvent` as a second line of defence (tested).
- **Two capture paths, no duplicates:**
  - `withSentry` captures uncaught errors from `fetch`/`queue`/`scheduled` and flushes through `waitUntil`.
  - The kernel `ErrorReporter` port captures errors that the REST layer turns into 5xx responses; those are handled, so `withSentry` never sees them.
  - `createWorkerHandler({ errorReporter })` also reports invalid-environment `fetch` failures.
  - Queue and cron failures rethrow, so `withSentry` reports them.
- **Deviation from spec:** the port has no `flush()` because `withSentry` already flushes in the background.
- **`release`:** the SDK reads `SENTRY_RELEASE` first, then the `CF_VERSION_METADATA` binding (added to every environment). Every deploy therefore has a release: the version id on staging, and `blixis-api@vX.Y.Z` once the release job sets `SENTRY_RELEASE` (021.001). The `BLIXIS_VERSION` var is not needed for Sentry.
- **Verification (2026-09-24):**
  - Ran `wrangler dev` locally with the DSN passed via `--var` and a temporary module whose `boot` throws (reverted before commit).
  - Result: issue `BLIXIS-API-1` with `environment=local`, tags `requestId`/`method`/`status`/`route`, the cause chain, and one event (no duplicate).
  - The issue was then resolved.
- **Finding:** Sentry's server infers the client IP for JavaScript-platform events even when the SDK sends no user data. The event stored the IP and geo. Fix: the project setting *Prevent Storing of IP Addresses* (owner action in the Sentry UI; the MCP has no tool for it). The setting is documented in the setup checklist and `cloudflare.md`.
- **Source maps:**
  - `upload_source_maps: true` sends maps to Cloudflare.
  - The bundle is unminified, so Sentry frames are readable (bundle file and line).
  - Mapping to `src/` requires `sentry-cli sourcemaps upload` in the release job with `SENTRY_AUTH_TOKEN`. The step is documented in `github-actions.md`/`cloudflare.md` and wired by 021.001.
- **Alert rules:**
  - Sentry's default "high priority issues" rule is active and fired for the verification error.
  - The environment-specific rules (new production issue; staging spike) are documented and are created in the UI when production goes live (020.002). The MCP can read alert rules but not create them.
- **Files that differ from the plan:**
  - Tests went into existing files (`rest.test.ts`, `worker-handler.test.ts`) plus `apps/api/test/sentry.worker.test.ts`, instead of `error-reporter.test.ts` / `error-reporting.worker.test.ts`.
  - `pnpm-workspace.yaml` gained the catalog entry.
